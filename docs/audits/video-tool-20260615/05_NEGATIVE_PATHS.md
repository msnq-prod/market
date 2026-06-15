# Negative Paths

## Access

| Scenario | Current Handling | Gap |
| --- | --- | --- |
| Non-desktop browser opens route | Desktop-only route blocks unless dev mock. | Matches. |
| No token | Admin fullscreen redirects to login unless dev mock. | Matches UI. |
| `SALES_MANAGER` opens UI | UI redirects to orders. | Backend route still allows `SALES_MANAGER`. |

## Batch and Source

| Scenario | Current Handling | Gap |
| --- | --- | --- |
| Batch not found/deleted | Backend fetch rejects. | Local existing project can bypass refetch and show stale project. |
| Batch status changes after first open | Local snapshot keeps old status. | Export can start locally and fail late on backend run creation. |
| Item serial/video URL changes after first open | Local item copy stays stale. | Replace confirmation and upload serial expectations can be wrong. |
| Source prepare fails | Source becomes `PREPARE_FAILED`; retry available. | Matches. |
| Prepared file missing on startup | Source becomes `MISSING`; retry available. | Matches. |
| Source replaced while prepared/export exists | Runtime cancels jobs, cleans prepared files, marks run stale. | Preview cache can still point at old protocol URL. |
| Source deleted | Runtime soft-deletes source/segments and marks run stale. | Matches local model. |

## Editor

| Scenario | Current Handling | Gap |
| --- | --- | --- |
| Invalid cut/min segment duration | `timelineModel` blocks cut. | Matches. |
| Invalid saved timeline | Electron `timelineService` validates. | Matches backend-local rules. |
| Boundary drag | Saves every pointer move. | Race/stale snapshot risk, high write volume. |
| Undo after failed save | Undo stack is pushed before save result. | Can record edits that were never persisted. |
| Source replaced after preview loaded | Preview URL cache not invalidated by revision. | Can show stale preview. |

## Export and Upload

| Scenario | Current Handling | Gap |
| --- | --- | --- |
| Existing item video and `replaceExisting=false` | Backend run creation rejects. | Local UI may miss replacement warning because local item data is stale. |
| Render output missing | Upload worker fails item. | Matches. |
| Render cancelled/stale | Worker checks run/job state before and after render. | Good stale output guard. |
| Network offline | Upload pauses with `PAUSED_OFFLINE` / `WAITING_NETWORK`. | Waiting jobs are undercounted in header. |
| Auth missing/expired | Upload pauses with `AUTH_REQUIRED` / `WAITING_AUTH`. | Recovery requires token sync path. |
| Chunk checksum mismatch | Server rejects/removes intent as needed. | Matches. |
| Full-file checksum mismatch | Server rejects commit. | Matches. |
| Upload complete for already uploaded run item | Server currently allows new intent/complete unless run is cancelled. | Can overwrite published file for same run item. |
| DB transaction fails after file move | No rollback cleanup for final public file. | Orphan/overwritten public file possible. |
| Run cancel | Local cancel marks jobs/items, server cancel marks non-uploaded server items. | Uploaded items remain published by design. |

## Restart/Recovery

| Scenario | Current Handling | Gap |
| --- | --- | --- |
| Desktop restart with running prepare/render | Jobs become failed. | Matches. |
| Desktop restart with running upload | Upload requeued/recovered. | Matches. |
| Desktop restart with paused upload | Recovery resumes if network/auth available. | Matches. |
| Desktop restart with server data changed | Local project is not refreshed. | Stale snapshot persists across restarts. |

