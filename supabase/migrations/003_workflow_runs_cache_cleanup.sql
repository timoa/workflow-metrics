-- Index for efficient deletion of expired workflow_runs_cache rows.
-- Automatic cleanup runs in app (see workflow-runs-cache.ts) and deletes
-- rows where fetched_at is older than the retention window (e.g. 1 hour).

create index if not exists idx_workflow_runs_cache_fetched_at
  on workflow_runs_cache(fetched_at);
