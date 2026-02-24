-- Add a dedicated GitHub write token (PAT) to user_settings.
-- Used by the AI optimization "Apply as PR" feature when the OAuth token
-- doesn't have repo write access (common with Supabase PKCE flow).

alter table user_settings add column if not exists github_write_token text;
