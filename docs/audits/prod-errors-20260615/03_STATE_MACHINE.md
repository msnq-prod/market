# State Machine

## Photo Tool Legacy Apply

- Batch must be `RECEIVED`.
- Request must include full manifest for all non-deleted items.
- Upload count must match manifest upload entries.
- Failure should be client-visible 4xx for invalid request shape, not 500.

## Video Tool V3

- Batch load should use v3 route.
- 404 means no compatible batch or route-level not found.
- Legacy v2 route is not part of the active state machine.
