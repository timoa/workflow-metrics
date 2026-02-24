-- Optimization history: stores AI optimization results per user/workflow
-- One latest result per (user_id, workflow_id) – upsert on conflict

create table if not exists optimization_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  workflow_id bigint not null,
  owner text not null,
  repo text not null,
  result jsonb not null,
  prompt_tokens integer,
  completion_tokens integer,
  created_at timestamptz default now() not null,
  unique(user_id, workflow_id)
);

-- Enable Row Level Security
alter table optimization_history enable row level security;

-- RLS: users can only access their own optimization history
create policy "Users can manage their own optimization history"
  on optimization_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes for performance
create index if not exists idx_optimization_history_user_id on optimization_history(user_id);
create index if not exists idx_optimization_history_user_workflow on optimization_history(user_id, workflow_id);
