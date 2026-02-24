-- Cache for GitHub Actions workflow runs to avoid repeated slow API calls.
-- Key: (user_id, owner, repo name, 30-day window start). TTL enforced in app (e.g. 5 min).

create table if not exists workflow_runs_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  owner text not null,
  name text not null,
  window_start date not null,
  runs jsonb not null default '[]',
  fetched_at timestamptz default now() not null,
  unique(user_id, owner, name, window_start)
);

create index if not exists idx_workflow_runs_cache_lookup
  on workflow_runs_cache(user_id, owner, name, window_start);

alter table workflow_runs_cache enable row level security;

create policy "Users can manage their own workflow runs cache"
  on workflow_runs_cache for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
