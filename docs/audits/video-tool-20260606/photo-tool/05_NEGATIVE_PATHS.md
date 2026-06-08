# Photo Tool Negative Paths And Races

## Checked Paths

| Path | Current behavior | Risk |
|---|---|---|
| Empty/unknown `batchId` | API 404 | OK |
| Deleted batch | API 404 because `deleted_at: null` | OK |
| Batch not `RECEIVED` | API 400 | OK |
| Missing `item_seq` | API 400 | OK |
| Non-HQ role | `SALES_MANAGER`/partner/user get 403 | OK |
| Browser route | Placeholder, no Photo Tool UI | OK |
| Unsupported extension | UI rejects; API upload rejects | OK |
| RAW/DNG | UI/API reject with specific message | OK |
| Active markup payload | Upload middleware rejects | OK |
| HEIC browser conversion fails | UI falls back to server conversion | OK |
| Direct save network/API failure | UI keeps dirty draft and shows error | OK |
| Direct save stale token | API 409, UI conflict banner | Recovery issue: reload deletes local draft |
| Desktop offline/auth | Workflow pauses/retries/auth blocks | OK |
| Desktop restart | Workflow state reloads and schedules | OK |
| Workflow cancel | Marks cancelled and removes files | OK |
| Legacy stale job | Status Center blocks unsafe retry | OK |
| Existing URL reuse | API allows current batch URLs or any `/uploads/photos/` URL | Intentional per tests |
| Old photo cleanup | Deletes old `/uploads/photos` files if unreferenced | Best effort |

## Races / Stale State

| Race | Evidence | Result |
|---|---|---|
| Two apply requests with same token | Token check before update transaction; item update uses `where: { id }` only | Last writer can overwrite despite optimistic token |
| Desktop quality settings | UI sends settings to workflow payload; workflow does not store/send them | Desktop output uses backend defaults |
| Edits during active workflow | Add/save guarded, but sort/assignment/remove/replace/hotkeys are not; completion clears draft/reloads | Local edits can be lost |
| Conflict reload | Stale banner says draft saved; `restoreDraftState` clears token-mismatched draft | Local photos/assignments can be lost |
| Rapid desktop double-save | `handleSave` has no in-function saving guard; duplicate workflow check happens after staging | Extra staged files can be orphaned/wasted |
| Draft file persistence | IndexedDB sync async and ignored on failure | Reload can restore metadata without some local files |
| Workflow progress | Snapshot `completed` stays 0 until completed | Progress row can look stuck |
| Pre-normalized checksum | Safe manifest checks only string type; parser can drop invalid checksum | API contract says checksum but may not enforce it |

## Tests / Docs

| Source | Status |
|---|---|
| API ACL/manifest/stale tests | Active |
| Desktop workflow settings payload test | Active but stops at renderer-to-desktop payload |
| Hotkey test | Active |
| Main browser UI save test | `test.skip` |
| Draft restore + stale UI test | `test.skip` |
| Docs | Mostly current; `media queue` wording does not distinguish new workflow vs legacy queue |
