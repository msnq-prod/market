# Fix Plan

- Move startup-only upload recovery into reusable `recoverUploadQueue`.
- Call recovery after queue job finish/fail.
- Call recovery when opening snapshot, so existing stuck runs self-repair on reload.
- Add regression test for `RENDERED + QUEUED` with no active upload job.
- Also schedule queue for already existing runnable `QUEUED` jobs when recovery repairs nothing.
- Resume `WAITING_AUTH` jobs from network/auth state checks, not only from direct token-change calls.
- Recreate missing `PREPARE_SOURCE` jobs for `NEW` sources during recovery.
- Recreate missing `RENDER_ITEM` jobs for queued render items during recovery.
