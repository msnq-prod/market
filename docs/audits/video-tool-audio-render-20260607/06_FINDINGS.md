# Findings

### P1. Rendered videos are always silent

- Promise: Video Tool renders final item videos.
- Reality: `prepareSource` uses `-an`; `renderItem` uses `concat ... a=0`, maps only `[v]`, and uses `-an`.
- Evidence: `electron/hq/videoToolV3/ffmpegService.cjs`.
- Effect: every rendered/uploaded video has no audio.
- Fix: preserve/add audio during prepare and concatenate audio during render.
- Status: fixed.

### P1. Editor preview is muted

- Promise: montage preview plays the selected prepared source.
- Reality: `PreviewPanel` set the video element `muted`, so audio could not be heard even after prepared files include audio.
- Evidence: `src/admin/pages/video-tool-v3/components/PreviewPanel.tsx`.
- Effect: монтаж decisions cannot be checked by sound.
- Fix: remove muted playback and call `video.play()` directly from the play button.
- Status: fixed.
