# State Machine

- Expected path: `RENDER_ITEM QUEUED/RUNNING/DONE` -> item `RENDERED` -> `UPLOAD_ITEM QUEUED/RUNNING/DONE` -> item `UPLOADED`.
- Broken path: item reached `RENDERED + QUEUED`, but upload job was absent/inactive.
- Recovery before fix: only app restart.
- Recovery after fix: runtime repair recreates missing upload jobs and schedules queue.

