# UI Truth Matrix

| UI element | UI says | Based on | Real source of truth | Match |
|---|---|---|---|---|
| `Render 100/100` | render complete | `export_items.render_status` | local SQLite | yes |
| `Upload 0/100` | no uploads complete | `export_items.upload_status` | local SQLite/backend after upload | yes |
| `Jobs: 0` | no runnable jobs | queued/running `jobs` only | local SQLite queue | yes |
| Item upload badge `В очереди` | upload should run | `export_items.upload_status = QUEUED` | missing `UPLOAD_ITEM` job blocked execution | no |

