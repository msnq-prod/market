# Function Map

| Entry | File | Role |
|---|---|---|
| Source prepare | `electron/hq/videoToolV3/prepareWorker.cjs` | Calls `FfmpegService.prepareSource`. |
| FFmpeg prepare | `electron/hq/videoToolV3/ffmpegService.cjs` | Normalizes source media. |
| Editor preview | `src/admin/pages/video-tool-v3/components/PreviewPanel.tsx` | Plays prepared source in монтаж preview. |
| Export run | `electron/hq/videoToolV3/exportService.cjs` | Builds render manifest and queues item renders. |
| Render worker | `electron/hq/videoToolV3/renderWorker.cjs` | Calls `FfmpegService.renderItem`. |
| FFmpeg render | `electron/hq/videoToolV3/ffmpegService.cjs` | Produces final item mp4. |
