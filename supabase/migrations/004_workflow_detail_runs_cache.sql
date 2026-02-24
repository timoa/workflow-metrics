-- Cache for workflow detail page: runs for a single workflow (30-day window).
-- Key: (user_id, owner, repo name, workflow_id, window_start). Same TTL/retention as workflow_runs_cache.

create table if not exists workflow_detail_runs_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  owner text not null,
  name text not null,
  workflow_id bigint not null,
  window_start date not null,
  runs jsonb not null default '[]',
  fetched_at timestamptz default now() not null,
  unique(user_id, owner, name, workflow_id, window_start)
);

create index if not exists idx_workflow_detail_runs_cache_lookup
  on workflow_detail_runs_cache(user_id, owner, name, workflow_id, window_start);

create index if not exists idx_workflow_detail_runs_cache_fetched_at
  on workflow_detail_runs_cache(fetched_at);

alter table workflow_detail_runs_cache enable row level security;

create policy "Users can manage their own workflow detail runs cache"
  on workflow_detail_runs_cache for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
