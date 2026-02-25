-- Add profile avatar and display name for GitHub App installations (User/Org).
ALTER TABLE github_app_installations
	ADD COLUMN IF NOT EXISTS account_avatar_url text,
	ADD COLUMN IF NOT EXISTS account_name text;
