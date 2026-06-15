# UI Truth Matrix

| UI element | UI says | Based on | Real source of truth | Match? | Evidence |
|---|---|---|---|---|---|
| Photo apply | Save photo assignments | Legacy multipart apply | Multer limit + manifest | No for batches over 100 upload files | Prod `Too many files` |
| Video Tool load | Load v3 tool data | v3 API then legacy fallback | v3 API only | No | Prod 404 on legacy fallback |
| Clone page | Load public passport | public item API | Public API/network | Unknown | Only browser network failure observed |
