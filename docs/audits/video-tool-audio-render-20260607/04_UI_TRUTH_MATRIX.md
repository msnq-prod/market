# UI Truth Matrix

| UI element | UI says | Real source | Match |
|---|---|---|---|
| Export render | Final item video is rendered | `export_items.output_path` | Broken before fix: file had no audio stream. |
| Preview video | Source preview plays prepared file | `source_assets.prepared_path` | Broken before fix: prepared file had no audio stream. |

