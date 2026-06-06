# Video Tool V3 Negative Paths

## Access / Boot

| Case | Current Handling | Risk |
| --- | --- | --- |
| No Electron bridge outside dev mock | Desktop gate blocks route | OK. |
| Missing `batchId` | Controller shows error | OK. |
| Backend batch missing/hidden | API fails | Fallback can mask actual v3 error. |
| Unauthorized token | Upload waits auth or API fails | OK for upload; initial load can fail. |
| Token changed | Auth-waiting uploads resume only when token changes | Invalid unchanged token can stay blocked. |

## Prepare

| Case | Current Handling | Risk |
| --- | --- | --- |
| Missing source file | `MISSING` | OK. |
| Probe/transcode error | `PREPARE_FAILED` | OK. |
| Replace/delete source | Resets/deletes and marks active run stale | OK. |
| Quality change | Requeues prepare and marks active run stale | OK. |
| Startup during prepare/render | Running prepare/render become failed | Docs mismatch; no 5-minute threshold. |

## Editor

| Case | Current Handling | Risk |
| --- | --- | --- |
| Cut too close to edge | Blocked by model | OK. |
| Delete all segments | Export blocker appears | OK. |
| Fast trim drag | Saves every pointer move | Race/load risk. |
| Multiple hotkeys/clicks while save pending | No serialization | Stale save can overwrite newer edit. |
| Undo while save pending | Saves prior full array | Can race with newer save. |
| `Z` in editor | Undo without modifier | Accidental undo risk. |

## Export / Render

| Case | Current Handling | Risk |
| --- | --- | --- |
| Batch changed after local project creation | Server rejects later | Wasted render/upload. |
| Item serial/list changed | Server rejects later | Wasted render/upload/confusing error. |
| Existing video appears after local load | Local modal may not show | Rejection or overwrite race. |
| Double-click start export | UI disable may lag | Duplicate local runs/jobs. |
| Timeline/source changes after run | Active local run marked stale | OK locally. |
| Cancel during render/upload | Local abort + best-effort server cancel | Local/server disagreement possible. |

## Upload / Backend

| Case | Current Handling | Risk |
| --- | --- | --- |
| Offline/API unreachable | `WAITING_NETWORK` | OK. |
| Missing/expired token | `WAITING_AUTH` | OK. |
| Intent expired/conflict/checksum mismatch | Electron resets/retries | OK for sequential upload. |
| Concurrent chunk requests | Intent JSON not locked | Lost chunk-map updates possible. |
| Repeat complete after success | Intent dir removed | Contract/test-plan mismatch. |
| Same manifest, different `replace_existing` | Existing server run returned | Replacement intent ambiguity. |
| Video URL added after run creation | Commit overwrites current URL | Data overwrite risk. |

## Alternate Truth Paths

| Case | Current Handling | Risk |
| --- | --- | --- |
| `/api/batches/:id/media-sync` writes item video | Separate route | Can race with V3 final commit. |
| Legacy `/api/batches/:id/video-tool` fallback | Client calls route on v3 404 | No matching route found. |
| Dev mock | Simplified behavior | Does not cover worker/API races. |

## Restart Recovery

| Case | Current Handling | Risk |
| --- | --- | --- |
| Restart during prepare/render | Running jobs become failed | Reasonable, docs mismatch. |
| Restart during upload | Upload jobs resume/queue | OK. |
| Server uploaded item but local stale | Upload recovery can reconcile | Covered only if recovery sees matching run/item. |
| Local cancel races with server complete | Server may already have video | Possible disagreement. |
