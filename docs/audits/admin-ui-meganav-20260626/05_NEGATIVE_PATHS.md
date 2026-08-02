# Negative Paths

## UI Edge Cases

| Case | Risk | Status |
|---|---|---|
| Small laptop height | Header band pushes work below fold | Confirmed from screenshots. |
| Many second-row items | Horizontal nav hides later functions | Confirmed by goods/system groups. |
| Empty ready route | Large empty panels look broken | Confirmed from prior smoke. |
| Batch with long product/location | Current cards can grow unevenly | Needs live check after compact layout. |
| Sales manager direct access to system routes | Redirects in `AdminLayout` | Previously smoke-tested. |
| Browser back with legacy query routes | `match` supports legacy paths | Acceptable. |
| API failure in acceptance | Error shown, but below shell | Improve with compact toolbar. |
| Duplicate receive click | Button disabled by `updatingBatchId`, modal count gate | Acceptable. |

## Navigation Risks

- Second-row tabs became a mix of real workspaces and low-level modes.
- Some routes are functionally useful but should be grouped under one dropdown/section later, not as equal tabs.
