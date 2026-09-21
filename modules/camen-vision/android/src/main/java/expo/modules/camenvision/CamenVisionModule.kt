package expo.modules.camenvision

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.SegmentationMask
import com.google.mlkit.vision.segmentation.Segmenter
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean

private const val MAX_DECODE_EDGE = 768
// Bounds only the blocking ML Kit wait, not decode or the lifetime of its Task.
private const val SEGMENT_TIMEOUT_MS = 20_000L
// Retain at most one outstanding bitmap/task, including after a timeout.
private val segmentationBusy = AtomicBoolean(false)
private val cleanupExecutor = Executors.newSingleThreadScheduledExecutor { runnable ->
  Thread(runnable, "camen-vision-cleanup").apply { isDaemon = true }
}
// If the ML Kit Task never completes, its completion listener never runs —
// this grace beyond the await timeout is the last chance to reclaim the
// bitmap/segmenter and reopen the busy slot.
private const val CLEANUP_GRACE_MS = 5_000L

class CamenVisionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CamenVision")

    // Raw masks may have model dimensions rather than decoded bitmap dimensions.
    // Return row-major little-endian float32 person confidences (0..1).
    AsyncFunction("segmentSelfie") Coroutine { uri: String, rawSizeMask: Boolean ->
      withContext(Dispatchers.IO) {
        // Tasks.await is blocking: never occupy the main or Expo module queue.
        if (!segmentationBusy.compareAndSet(false, true)) {
          throw CodedException("E_SEGMENT_BUSY", "Previous segmentation is still finishing", null)
        }
        var bitmap: Bitmap? = null
        var segmenter: Segmenter? = null
        var task: Task<SegmentationMask>? = null
        try {
          val decoded = decodeCapped(Uri.parse(uri))
            ?: throw CodedException("E_SEGMENT_DECODE", "Could not decode image for segmentation", null)
          bitmap = decoded
          val options = SelfieSegmenterOptions.Builder()
            .setDetectorMode(SelfieSegmenterOptions.SINGLE_IMAGE_MODE)
            .apply { if (rawSizeMask) enableRawSizeMask() }
            .build()
          val client = Segmentation.getClient(options)
          segmenter = client
          val pending = client.process(InputImage.fromBitmap(decoded, 0))
          task = pending
          val mask = Tasks.await(pending, SEGMENT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
          mapOf("width" to mask.width, "height" to mask.height, "mask" to maskBytes(mask))
        } catch (e: CancellationException) {
          throw e
        } catch (e: TimeoutException) {
          throw CodedException("E_SEGMENT_TIMEOUT", "Selfie segmentation wait exceeded ${SEGMENT_TIMEOUT_MS}ms", e)
        } catch (e: InterruptedException) {
          Thread.currentThread().interrupt()
          throw CancellationException("Segmentation wait interrupted").apply { initCause(e) }
        } catch (e: CodedException) {
          throw e
        } catch (e: Exception) {
          throw CodedException("E_SEGMENT", "Selfie segmentation failed: ${e.message}", e)
        } finally {
          val ownedBitmap = bitmap
          val ownedSegmenter = segmenter
          // Exactly-once cleanup: the completion listener and the force
          // watchdog below may both fire.
          var cleaned = false
          val cleanup = {
            if (!cleaned) {
              cleaned = true
              try {
                ownedSegmenter?.close()
              } finally {
                ownedBitmap?.recycle()
                segmentationBusy.set(false)
              }
            }
          }
          val pending = task
          if (pending == null || pending.isComplete) {
            cleanup()
          } else {
            // Timeout/interruption does NOT cancel an ML Kit Task. Transfer
            // ownership to its completion listener, never close/recycle while
            // it can still read InputImage. Registration also handles a task
            // completing between isComplete and addOnCompleteListener.
            pending.addOnCompleteListener(cleanupExecutor) { cleanup() }
            // A Task that never completes would wedge segmentationBusy=true
            // (every future call rejects E_SEGMENT_BUSY until restart) —
            // schedule a force cleanup beyond the await timeout.
            cleanupExecutor.schedule(
              { cleanup() },
              SEGMENT_TIMEOUT_MS + CLEANUP_GRACE_MS,
              TimeUnit.MILLISECONDS,
            )
          }
        }
      }
    }
  }

  /** Decode using a power-of-two sample aimed at the MAX_DECODE_EDGE budget. */
  private fun decodeCapped(uri: Uri): Bitmap? {
    val resolver = appContext.reactContext?.contentResolver
      ?: throw CodedException("E_NO_CONTEXT", "no reactContext/contentResolver for segmentation", null)
    val boundsStream = resolver.openInputStream(uri)
      ?: throw CodedException("E_NO_STREAM", "cannot open input stream: $uri", null)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    boundsStream.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw CodedException("E_BAD_BOUNDS", "unusable bounds ${bounds.outWidth}x${bounds.outHeight}", null)
    }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > MAX_DECODE_EDGE) sample *= 2
    val decodeStream = resolver.openInputStream(uri)
      ?: throw CodedException("E_NO_STREAM", "cannot reopen input stream: $uri", null)
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    return decodeStream.use { BitmapFactory.decodeStream(it, null, opts) }
  }

  private fun maskBytes(mask: SegmentationMask): ByteArray {
    val count = mask.width.toLong() * mask.height.toLong()
    val src = mask.buffer.duplicate().order(ByteOrder.nativeOrder())
    src.rewind()
    if (mask.width <= 0 || mask.height <= 0 || count > MAX_DECODE_EDGE.toLong() * MAX_DECODE_EDGE || src.remaining().toLong() != count * 4) {
      throw CodedException("E_SEGMENT_MASK", "Invalid segmentation mask dimensions/buffer", null)
    }
    val out = ByteBuffer.allocate(count.toInt() * 4).order(ByteOrder.LITTLE_ENDIAN)
    repeat(count.toInt()) {
      val confidence = src.float
      if (!confidence.isFinite() || confidence < 0f || confidence > 1f) {
        throw CodedException("E_SEGMENT_MASK", "Invalid segmentation confidence", null)
      }
      out.putFloat(confidence)
    }
    return out.array()
  }
}
