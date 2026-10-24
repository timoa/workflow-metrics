import { defineEnvVars } from '@sveltejs/kit/env';

/** Treats a missing variable as `undefined` instead of failing the build/runtime. */
const optional = (value: string | undefined) => value;

/**
 * SvelteKit 3 requires environment variables to be declared explicitly; they are
 * then exposed through `$app/env/public` and `$app/env/private`.
 */
export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: { public: true, static: true },
	PUBLIC_SUPABASE_ANON_KEY: { public: true, static: true },
	// the remaining variables are optional: the app degrades gracefully without them
	PUBLIC_APP_URL: { public: true, schema: optional },
	SUPABASE_SERVICE_ROLE_KEY: { schema: optional },
	GITHUB_APP_ID: { schema: optional },
	GITHUB_APP_PRIVATE_KEY: { schema: optional },
	GITHUB_APP_SLUG: { schema: optional },
	AI_OPTIMIZATION_MODEL: { schema: optional }
});
