# Negative Paths

- Missing output file: still becomes `UPLOAD_FAILED`.
- Existing active upload job: runtime recovery does not duplicate it.
- Active `UPLOADING` job: runtime recovery does not reset it unless startup recovery requested.
- Terminal run: recovery skips `COMPLETED`, `CANCELLED`, `STALE`.

