import { redirect, fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad, Actions } from './$types';

/** Call GitHub API and return the OAuth scopes granted to the stored token. */
async function fetchTokenScopes(accessToken: string): Promise<string[]> {
	try {
		const res = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: `token ${accessToken}`,
				'User-Agent': 'workflow-metrics'
			}
		});
		const raw = res.headers.get('X-OAuth-Scopes') ?? '';
		return raw.split(',').map((s) => s.trim()).filter(Boolean);
	} catch {
		return [];
	}
}

/** Call GitHub API and return both scopes and the authenticated username. */
async function fetchTokenInfo(accessToken: string): Promise<{ scopes: string[]; username: string | null }> {
	try {
		const res = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: `token ${accessToken}`,
				'User-Agent': 'workflow-metrics'
			}
		});
		const raw = res.headers.get('X-OAuth-Scopes') ?? '';
		const scopes = raw.split(',').map((s) => s.trim()).filter(Boolean);
		const body = await res.json() as { login?: string };
		return { scopes, username: body.login ?? null };
	} catch {
		return { scopes: [], username: null };
	}
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const writeSuccess = url.searchParams.get('writeSuccess') === '1';
	const writeError = url.searchParams.get('writeError') ?? null;
	const hasWriteOAuthApp = !!env.GITHUB_WRITE_CLIENT_ID;

	const [connectionsResult, settingsResult, reposResult] = await Promise.all([
		locals.supabase
			.from('github_connections')
			.select('id, github_username, avatar_url, scopes, created_at, access_token')
			.eq('user_id', user.id),
		locals.supabase
			.from('user_settings')
			.select('mistral_api_key, theme, default_repo_id, github_write_token')
			.eq('user_id', user.id)
			.single(),
		locals.supabase
			.from('repositories')
			.select('id, full_name, owner, name, is_private, is_active')
			.eq('user_id', user.id)
			.order('full_name')
	]);

	// Check actual scopes of the stored OAuth token
	const oauthToken = connectionsResult.data?.[0]?.access_token ?? '';
	const oauthScopes = oauthToken ? await fetchTokenScopes(oauthToken) : [];
	const oauthHasRepoScope = oauthScopes.includes('repo');

	// Check scopes and username of the write token if one is set
	const pat = settingsResult.data?.github_write_token ?? '';
	const patInfo = pat ? await fetchTokenInfo(pat) : { scopes: [], username: null };
	const patScopes = patInfo.scopes;
	const patHasRepoScope = patScopes.includes('repo');
	const patUsername = patInfo.username;

	// Strip access_token before sending to client
	const connections = (connectionsResult.data ?? []).map(({ access_token: _, ...rest }) => rest);

	return {
		connections,
		settings: settingsResult.data,
		repos: reposResult.data ?? [],
		oauthHasRepoScope,
		oauthScopes,
		patHasRepoScope,
		patScopes,
		patUsername,
		hasWriteAccess: oauthHasRepoScope || patHasRepoScope,
		hasWriteOAuthApp,
		writeSuccess,
		writeError
	};
};

export const actions: Actions = {
	updateSettings: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const mistralApiKey = formData.get('mistral_api_key') as string | null;
		const theme = formData.get('theme') as 'dark' | 'light' | 'system';
		const defaultRepoId = formData.get('default_repo_id') as string | null;

		const { error } = await locals.supabase.from('user_settings').upsert(
			{
				user_id: user.id,
				mistral_api_key: mistralApiKey || null,
				theme: theme || 'dark',
				default_repo_id: defaultRepoId || null,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id' }
		);

		if (error) return fail(500, { error: error.message });

		return { success: true };
	},

	saveWriteToken: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const token = (formData.get('github_write_token') as string | null)?.trim() ?? '';

		if (!token) return fail(400, { writeTokenError: 'Token cannot be empty.' });

		// Validate the token has repo scope
		const scopes = await fetchTokenScopes(token);
		if (!scopes.includes('repo')) {
			return fail(400, {
				writeTokenError: `This token has scopes: [${scopes.join(', ') || 'none'}]. It needs the "repo" scope to create branches and PRs.`
			});
		}

		const { error } = await locals.supabase.from('user_settings').upsert(
			{ user_id: user.id, github_write_token: token, updated_at: new Date().toISOString() },
			{ onConflict: 'user_id' }
		);

		if (error) return fail(500, { writeTokenError: error.message });

		return { writeTokenSuccess: true };
	},

	removeWriteToken: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const { error } = await locals.supabase.from('user_settings').upsert(
			{ user_id: user.id, github_write_token: null, updated_at: new Date().toISOString() },
			{ onConflict: 'user_id' }
		);

		if (error) return fail(500, { error: error.message });

		return { writeTokenSuccess: true };
	},

	removeRepo: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const repoId = formData.get('repo_id') as string;

		const { error } = await locals.supabase
			.from('repositories')
			.update({ is_active: false })
			.eq('id', repoId)
			.eq('user_id', user.id);

		if (error) return fail(500, { error: error.message });

		return { success: true };
	},

	addRepo: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		throw redirect(303, '/onboarding?from=settings');
	},

	addOrg: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		throw redirect(303, '/onboarding?add=org&from=settings');
	}
};
