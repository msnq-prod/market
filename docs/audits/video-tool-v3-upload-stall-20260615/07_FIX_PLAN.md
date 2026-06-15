# Fix Plan

- Move startup-only upload recovery into reusable `recoverUploadQueue`.
- Call recovery after queue job finish/fail.
- Call recovery when opening snapshot, so existing stuck runs self-repair on reload.
- Add regression test for `RENDERED + QUEUED` with no active upload job.

