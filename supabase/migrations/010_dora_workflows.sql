-- DORA Workflows - Track which workflows are used for DORA metrics calculation

-- Table to store user's selected workflows for DORA metrics
create table if not exists dora_workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  repository_id uuid references repositories(id) on delete cascade not null,
  workflow_id bigint not null,
  workflow_name text not null,
  workflow_path text not null,
  created_at timestamptz default now() not null,
  unique(user_id, repository_id, workflow_id)
);

-- Enable Row Level Security
alter table dora_workflows enable row level security;

-- RLS Policy: users can only access their own DORA workflow selections
create policy "Users can manage their own DORA workflows"
  on dora_workflows for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for performance (querying by user and repository)
create index if not exists idx_dora_workflows_user_repo 
  on dora_workflows(user_id, repository_id);

-- Index for querying by repository alone
create index if not exists idx_dora_workflows_repo 
  on dora_workflows(repository_id);

-- Comments for documentation
comment on table dora_workflows is 'Stores user-selected workflows that should be included in DORA metrics calculations';
comment on column dora_workflows.workflow_id is 'GitHub workflow ID (from GitHub API)';
comment on column dora_workflows.workflow_name is 'Display name of the workflow';
comment on column dora_workflows.workflow_path is 'File path in repository (e.g., .github/workflows/deploy.yml)';
