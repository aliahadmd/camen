# Chapter 2 — Camera Core: Preview, Permissions, Capture

**Goal:** The live camera fills the screen, the app has permission, the shutter takes a photo and
saves it. This is the spine every later feature hangs on.

**Depends on:** Chapter 1.

## Tasks

- [ ] Request permissions on first launch: `Camera.requestCameraPermissionsAsync()` +
      `MediaLibrary.requestPermissionsAsync()`; minimal in-app rationale screen (no OS-settings nag loops).
- [ ] Mount `<CameraView>` (`expo-camera`) full-screen, `facing="back"`, `mode="picture"`,
      ref stored for capture; handle `onCameraReady` to reveal the shutter (fade-in).
- [ ] Build the **shutter button**: 72px ring, bone-white stroke, no icon — press = capture.
      `onPress` → `ref.current.takePictureAsync({ quality: 0.92, skipProcessing: false })`.
- [ ] Capture feedback: 120ms white vignette flash + `expo-haptics` light impact + soft click
      (`expo-av` or system sound on Android).
- [ ] Save photo: `MediaLibrary.createAssetAsync(photo.uri)`; silent-save by default (minimalism),
      with an unobtrusive "Saved ✓" toast for the first few shots.
- [ ] Error paths: permission denied → single "Enable camera" CTA to OS settings; capture failure →
      quiet retry state on the shutter.

## Implementation notes

```tsx
const camRef = useRef<CameraView>(null);

async function shoot() {
  const photo = await camRef.current?.takePictureAsync({ quality: 0.92 });
  if (photo) await MediaLibrary.createAssetAsync(photo.uri);
}
```

Keep capture logic in a small `useCamera()` hook from day one — Chapters 4–9 all extend this hook
(torch, facing, zoom, timer, filter) instead of touching the component.

## Acceptance

- [ ] Live preview on physical device, correct orientation, no stretch
- [ ] First launch asks camera + gallery permissions once and remembers
- [ ] Shutter press → photo saved to the phone's gallery
- [ ] Flash/haptic/click feedback fires on every shot
