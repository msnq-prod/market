# Function Map

- `RenderWorker.handle`: after successful render sets `export_items.upload_status = 'QUEUED'` and inserts `UPLOAD_ITEM`.
- `UploadService.recoverOnStartup`: previously recreated missing upload jobs only during app startup.
- `VideoToolV3App.getSnapshot`: now repairs missing upload jobs before returning runtime state.
- `VideoToolV3App` queue events: now repair upload queue after job finish/fail.

