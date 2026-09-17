# Camen 1.16.0 release verification

Date: 2026-09-17. Target: Redmi K80 Pro, Android arm64.

## Passed

- `npm test` and `npm run typecheck`.
- Dependency audit: zero reported advisories at verification time.
- Offline signed `assembleRelease`, with the original release key.
- APK signer certificate matches the previously installed APK.
- In-place `adb install -r` succeeded; installed versionName 1.16.0 / versionCode 16.
- Camen launches with existing settings and archive entries intact.
- Photo capture with Portrait Nature selected saved and opened in SHOTS: front, 1944×2430, approximately 1.2 MB.
- Video recording stopped and saved as Video 27, duration 205 seconds. Export exists in DCIM at 550,279,703 bytes; thumbnail displays in the internal archive.
- App force-stop/relaunch preserved all 27 archive entries and the new video; VIDEOS filter shows it.
- Front zoom ruler opens at 1.0× and responds to adjustment.
- No fatal application exception observed in the sampled capture logs.
- Release config fixture behavioral checks passed (seven tests with Gradle enabled); isolated real AGP configuration succeeded and unsigned signing validation rejected missing credentials.

## Limits

This is a device smoke test, not exhaustive acceptance of every audit finding. No destructive interruption during a real save, permission revocation, GPS fix validation, full AEB sequence, preset write-failure injection, or full lens-range calibration was performed on the phone. Recovery fault injection and malformed storage cases are covered by host tests. No person was deliberately framed, so subject-edge bokeh quality is not established by the portrait-preset capture. Foreground RGB bleeding refinement remains open.

The video test ran longer than intended while accessibility snapshots failed to become idle. It and the new photo were left intact; no existing media was deleted. Private screenshots and recordings are not included in the repository or release assets.

The previous broad claim that every report item was fully verified was too strong: video still displays disabled preset labels and inactive photo-only chips, and native focus crop mapping / comprehensive device acceptance remain follow-up work. The release ships the implemented fixes, not a claim of complete audit closure.
