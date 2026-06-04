CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  batch_status TEXT NOT NULL,
  expected_output_count INTEGER NOT NULL,
  quality_preset TEXT NOT NULL,
  active_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_batch_id ON projects(batch_id);

CREATE TABLE IF NOT EXISTS project_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_seq INTEGER,
  serial_number TEXT NOT NULL,
  existing_video_url TEXT,
  clone_url TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_items_project_item
  ON project_items(project_id, item_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_items_project_position
  ON project_items(project_id, position);

CREATE TABLE IF NOT EXISTS source_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  original_external_path TEXT,
  original_size_bytes INTEGER NOT NULL,
  original_last_modified INTEGER NOT NULL,
  prepared_path TEXT,
  prepared_checksum_sha256 TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_source_assets_project
  ON source_assets(project_id, position);

CREATE INDEX IF NOT EXISTS idx_source_assets_status
  ON source_assets(status);

CREATE TABLE IF NOT EXISTS timeline_segments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(source_id) REFERENCES source_assets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_timeline_segments_project
  ON timeline_segments(project_id, position);

CREATE TABLE IF NOT EXISTS export_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  server_run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  quality_preset TEXT NOT NULL,
  replace_existing INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_export_runs_project
  ON export_runs(project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_export_runs_status
  ON export_runs(status);

CREATE TABLE IF NOT EXISTS export_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  project_item_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  segment_id TEXT NOT NULL,
  render_status TEXT NOT NULL,
  upload_status TEXT NOT NULL,
  render_progress INTEGER NOT NULL DEFAULT 0,
  upload_progress INTEGER NOT NULL DEFAULT 0,
  output_path TEXT,
  output_checksum_sha256 TEXT,
  output_size_bytes INTEGER,
  server_file_url TEXT,
  clone_url TEXT NOT NULL,
  retry_count_render INTEGER NOT NULL DEFAULT 0,
  retry_count_upload INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES export_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(project_item_id) REFERENCES project_items(id),
  FOREIGN KEY(segment_id) REFERENCES timeline_segments(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_export_items_run_item
  ON export_items(run_id, item_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_export_items_run_serial
  ON export_items(run_id, serial_number);

CREATE INDEX IF NOT EXISTS idx_export_items_render_status
  ON export_items(render_status);

CREATE INDEX IF NOT EXISTS idx_export_items_upload_status
  ON export_items(upload_status);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  run_id TEXT,
  export_item_id TEXT,
  source_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TEXT NOT NULL,
  locked_at TEXT,
  locked_by TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_runnable
  ON jobs(status, run_after, priority);

CREATE INDEX IF NOT EXISTS idx_jobs_type_status
  ON jobs(type, status);

CREATE TABLE IF NOT EXISTS upload_attempts (
  id TEXT PRIMARY KEY,
  export_item_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  bytes_total INTEGER NOT NULL,
  bytes_uploaded INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 TEXT NOT NULL,
  upload_id TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error_message TEXT,
  FOREIGN KEY(export_item_id) REFERENCES export_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_upload_attempts_item
  ON upload_attempts(export_item_id, attempt_number);
