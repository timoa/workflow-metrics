-- Workflow Metrics - Initial Schema

-- GitHub connections (stores OAuth tokens per user)
create table if not exists github_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  github_user_id bigint not null,
  github_username text not null,
  avatar_url text,
  access_token text not null,
  scopes text[],
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(user_id, github_user_id)
);

-- Tracked repositories
create table if not exists repositories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  connection_id uuid references github_connections(id) on delete cascade not null,
  github_repo_id bigint not null,
  owner text not null,
  name text not null,
  full_name text not null,
  is_private boolean default false not null,
  is_active boolean default true not null,
  created_at timestamptz default now() not null,
  unique(user_id, github_repo_id)
);

-- User settings
create table if not exists user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  mistral_api_key text,
  theme text default 'dark' check (theme in ('dark', 'light', 'system')) not null,
  default_repo_id uuid references repositories(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Enable Row Level Security
alter table github_connections enable row level security;
alter table repositories enable row level security;
alter table user_settings enable row level security;

-- RLS Policies: users can only access their own data
create policy "Users can manage their own GitHub connections"
  on github_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own repositories"
  on repositories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their own settings"
  on user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes for performance
create index if not exists idx_github_connections_user_id on github_connections(user_id);
create index if not exists idx_repositories_user_id on repositories(user_id);
create index if not exists idx_repositories_user_owner_repo on repositories(user_id, owner, name);
create index if not exists idx_user_settings_user_id on user_settings(user_id);

-- Auto-update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_github_connections_updated_at
  before update on github_connections
  for each row execute function update_updated_at_column();

create trigger update_user_settings_updated_at
  before update on user_settings
  for each row execute function update_updated_at_column();
