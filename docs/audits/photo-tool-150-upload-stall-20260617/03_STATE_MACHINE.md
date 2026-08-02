# State Machine

- Активные фазы: `queued`, `converting`, `uploading`, `applying`, `staging_complete`, `paused_offline`, `auth_required`.
- Терминальные фазы: `completed`, `failed`, `cancelled`, `stale`.
- Наблюдаемое зависание: UI видит активную фазу и блокирует редактирование, но прогресс не растет.

