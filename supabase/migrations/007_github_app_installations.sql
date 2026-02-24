-- GitHub App installations: stores one row per (user, GitHub account/org) pair
-- where the user has installed the Workflow Metrics GitHub App.
CREATE TABLE IF NOT EXISTS github_app_installations (
	id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	installation_id bigint NOT NULL,
	account_login text NOT NULL,
	account_type text NOT NULL CHECK (account_type IN ('User', 'Organization')),
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	UNIQUE (user_id, installation_id)
);

ALTER TABLE github_app_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own app installations"
	ON github_app_installations FOR SELECT
	USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own app installations"
	ON github_app_installations FOR INSERT
	WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own app installations"
	ON github_app_installations FOR UPDATE
	USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own app installations"
	ON github_app_installations FOR DELETE
	USING (auth.uid() = user_id);
