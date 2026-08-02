# Function Map

- UI: `src/admin/pages/PhotoTool.tsx`
  - `handleSave`: собирает manifest/files и вызывает desktop workflow.
  - `buildWorkflowStatusText`: показывает фазу фоновой задачи.
  - `subscribeMediaWorkflows`: обновляет UI из desktop snapshot.
- Desktop: `electron/hq/mediaWorkflowManager.cjs`
  - `startPhotoApplyWorkflow`: создает локальный workflow.
  - `processWorkflow`: переключает фазы и выполняет upload/apply.
  - `processWorkflowUpload`: загружает файлы через `/api/batches/:id/photo-tool/apply`.
- Desktop v2: `electron/hq/photoToolV2WorkflowManager.cjs`
  - отдельный chunked путь `/api/photo-tool-v2`.

