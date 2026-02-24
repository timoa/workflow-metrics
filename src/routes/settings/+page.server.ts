import { redirect, fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { generateAppJWT } from '$lib/server/github-app';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const appSuccess = url.searchParams.get('appSuccess') === '1';
	const appError = url.searchParams.get('appError') ?? null;
	const hasGitHubApp = !!(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_APP_SLUG);

	const [connectionsResult, settingsResult, reposResult, installationsResult] = await Promise.all([
		locals.supabase
			.from('github_connections')
			.select('id, github_username, avatar_url, scopes, created_at')
			.eq('user_id', user.id),
		locals.supabase
			.from('user_settings')
			.select('mistral_api_key, theme, default_repo_id')
			.eq('user_id', user.id)
			.single(),
		locals.supabase
			.from('repositories')
			.select('id, full_name, owner, name, is_private, is_active')
			.eq('user_id', user.id)
			.order('full_name'),
		locals.supabase
			.from('github_app_installations')
			.select('id, installation_id, account_login, account_type, created_at')
			.eq('user_id', user.id)
			.order('account_login')
	]);

	return {
		connections: connectionsResult.data ?? [],
		settings: settingsResult.data,
		repos: reposResult.data ?? [],
		installations: installationsResult.data ?? [],
		hasGitHubApp,
		appSuccess,
		appError
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

		return { success: true, default_repo_id: defaultRepoId || null };
	},

	/**
	 * Sync GitHub App installations from the GitHub API.
	 *
	 * The GitHub App installation callback only fires when the "Setup URL" is
	 * properly configured in the GitHub App settings. This action provides a
	 * reliable fallback: it fetches all app installations via the App JWT and
	 * matches them against the user's known GitHub accounts (personal + org owners
	 * from their tracked repositories).
	 */
	syncInstallations: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const appId = env.GITHUB_APP_ID;
		const privateKey = env.GITHUB_APP_PRIVATE_KEY;
		if (!appId || !privateKey) {
			return fail(500, { syncError: 'GitHub App is not configured on this server.' });
		}

		// Build the set of GitHub account logins that belong to this user:
		// their personal account(s) + any org owners from their tracked repos.
		const [connectionsResult, reposResult] = await Promise.all([
			locals.supabase
				.from('github_connections')
				.select('github_username')
				.eq('user_id', user.id),
			locals.supabase
				.from('repositories')
				.select('owner')
				.eq('user_id', user.id)
				.eq('is_active', true)
		]);

		const knownLogins = new Set<string>();
		for (const c of connectionsResult.data ?? []) {
			if (c.github_username) knownLogins.add(c.github_username.toLowerCase());
		}
		for (const r of reposResult.data ?? []) {
			if (r.owner) knownLogins.add(r.owner.toLowerCase());
		}

		if (knownLogins.size === 0) {
			return { syncResult: { added: 0, notFound: false } };
		}

		// Fetch all installations of this GitHub App via the App JWT.
		let installations: Array<{ id: number; account: { login: string; type: string } }>;
		try {
			const jwt = await generateAppJWT(appId, privateKey);
			const res = await fetch('https://api.github.com/app/installations?per_page=100', {
				headers: {
					Authorization: `Bearer ${jwt}`,
					Accept: 'application/vnd.github.v3+json',
					'User-Agent': 'workflow-metrics'
				}
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as { message?: string };
				return fail(500, {
					syncError: `GitHub API error (${res.status}): ${err.message ?? 'unknown'}`
				});
			}
			installations = (await res.json()) as typeof installations;
		} catch (e) {
			return fail(500, { syncError: e instanceof Error ? e.message : String(e) });
		}

		// Keep only installations whose account login matches a known login.
		const matching = installations.filter((i) =>
			knownLogins.has(i.account.login.toLowerCase())
		);

		if (matching.length === 0) {
			return { syncResult: { added: 0, notFound: true } };
		}

		const { error: dbError } = await locals.supabase
			.from('github_app_installations')
			.upsert(
				matching.map((i) => ({
					user_id: user.id,
					installation_id: i.id,
					account_login: i.account.login,
					account_type: i.account.type,
					updated_at: new Date().toISOString()
				})),
				{ onConflict: 'user_id,installation_id' }
			);

		if (dbError) return fail(500, { syncError: dbError.message });

		return { syncResult: { added: matching.length, notFound: false } };
	},

	removeInstallation: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const installationRowId = formData.get('installation_id') as string;

		const { error } = await locals.supabase
			.from('github_app_installations')
			.delete()
			.eq('id', installationRowId)
			.eq('user_id', user.id);

		if (error) return fail(500, { error: error.message });

		return { success: true };
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
