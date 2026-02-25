import { redirect, fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { generateAppJWT } from '$lib/server/github-app';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PageServerLoad, Actions } from './$types';

type GhInstallation = {
	id: number;
	account: { login: string; type: string; avatar_url?: string };
};

/**
 * Full sync: fetch app installations from GitHub for the user's known accounts,
 * upsert into DB, and remove DB rows for installations no longer on GitHub.
 * Called on settings page load and by the Sync action.
 */
async function syncInstallationsFromGitHub(
	supabase: SupabaseClient,
	userId: string,
	appId: string,
	privateKey: string
): Promise<{ added: number; removed: number; notFound: boolean; error?: string }> {
	const connectionsResult = await supabase
		.from('github_connections')
		.select('github_username, access_token')
		.eq('user_id', userId);

	const connections = connectionsResult.data ?? [];

	// Start with personal account logins
	const knownLogins = new Set<string>();
	for (const c of connections) {
		if (c.github_username) knownLogins.add(c.github_username.toLowerCase());
	}

	// Expand with all org memberships via the user's OAuth token so orgs without
	// tracked repos (e.g. a freshly installed org like timoa-ai) are included
	await Promise.all(
		connections.map(async (c) => {
			if (!c.access_token) return;
			try {
				const res = await fetch('https://api.github.com/user/orgs?per_page=100', {
					headers: {
						Authorization: `token ${c.access_token}`,
						Accept: 'application/vnd.github.v3+json',
						'User-Agent': 'workflow-metrics'
					}
				});
				if (!res.ok) return;
				const orgs = (await res.json()) as Array<{ login: string }>;
				for (const org of orgs) {
					if (org.login) knownLogins.add(org.login.toLowerCase());
				}
			} catch {
				// Non-fatal: continue with what we already know
			}
		})
	);

	if (knownLogins.size === 0) {
		return { added: 0, removed: 0, notFound: false };
	}

	let installations: GhInstallation[];
	let jwt: string;
	try {
		jwt = await generateAppJWT(appId, privateKey);
		const res = await fetch('https://api.github.com/app/installations?per_page=100', {
			headers: {
				Authorization: `Bearer ${jwt}`,
				Accept: 'application/vnd.github.v3+json',
				'User-Agent': 'workflow-metrics'
			}
		});
		if (!res.ok) {
			const err = (await res.json().catch(() => ({}))) as { message?: string };
			return {
				added: 0,
				removed: 0,
				notFound: false,
				error: `GitHub API error (${res.status}): ${err.message ?? 'unknown'}`
			};
		}
		installations = (await res.json()) as GhInstallation[];
	} catch (e) {
		return {
			added: 0,
			removed: 0,
			notFound: false,
			error: e instanceof Error ? e.message : String(e)
		};
	}

	const matching = installations.filter((i) =>
		knownLogins.has(i.account.login.toLowerCase())
	);

	const authHeaders = {
		Authorization: `Bearer ${jwt}`,
		Accept: 'application/vnd.github.v3+json',
		'User-Agent': 'workflow-metrics'
	};
	const names = await Promise.all(
		matching.map(async (i) => {
			const url =
				i.account.type === 'Organization'
					? `https://api.github.com/orgs/${encodeURIComponent(i.account.login)}`
					: `https://api.github.com/users/${encodeURIComponent(i.account.login)}`;
			try {
				const r = await fetch(url, { headers: authHeaders });
				if (!r.ok) return null;
				const data = (await r.json()) as { name?: string | null };
				return data.name?.trim() || null;
			} catch {
				return null;
			}
		})
	);

	const matchingIds = new Set(matching.map((i) => i.id));
	const rows = matching.map((inst, idx) => ({
		user_id: userId,
		installation_id: inst.id,
		account_login: inst.account.login,
		account_type: inst.account.type,
		account_avatar_url: inst.account.avatar_url ?? null,
		account_name: names[idx] ?? null,
		updated_at: new Date().toISOString()
	}));

	const { error: upsertError } = await supabase
		.from('github_app_installations')
		.upsert(rows, { onConflict: 'user_id,installation_id' });

	if (upsertError) {
		return { added: 0, removed: 0, notFound: false, error: upsertError.message };
	}

	// Remove from DB any installation that is no longer on GitHub for this user's accounts
	const { data: existing } = await supabase
		.from('github_app_installations')
		.select('installation_id')
		.eq('user_id', userId);

	const toRemove = (existing ?? []).filter((row) => !matchingIds.has(row.installation_id));
	if (toRemove.length > 0) {
		await supabase
			.from('github_app_installations')
			.delete()
			.eq('user_id', userId)
			.in('installation_id', toRemove.map((r) => r.installation_id));
	}

	return {
		added: matching.length,
		removed: toRemove.length,
		notFound: matching.length === 0
	};
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const appSuccess = url.searchParams.get('appSuccess') === '1';
	const appError = url.searchParams.get('appError') ?? null;
	const appId = env.GITHUB_APP_ID;
	const privateKey = env.GITHUB_APP_PRIVATE_KEY;
	const hasGitHubApp = !!(appId && privateKey && env.GITHUB_APP_SLUG);

	// Auto-sync installations from GitHub on every load so the list reflects add/remove on GitHub
	if (hasGitHubApp && appId && privateKey) {
		await syncInstallationsFromGitHub(locals.supabase, user.id, appId, privateKey);
	}

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
			.select('id, installation_id, account_login, account_type, account_avatar_url, account_name, created_at')
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
	 * Manual refresh: sync GitHub App installations from the GitHub API and
	 * update the DB (add new, remove uninstalled). The list also syncs automatically on page load.
	 */
	syncInstallations: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const appId = env.GITHUB_APP_ID;
		const privateKey = env.GITHUB_APP_PRIVATE_KEY;
		if (!appId || !privateKey) {
			return fail(500, { syncError: 'GitHub App is not configured on this server.' });
		}

		const result = await syncInstallationsFromGitHub(
			locals.supabase,
			user.id,
			appId,
			privateKey
		);

		if (result.error) return fail(500, { syncError: result.error });

		return {
			syncResult: {
				added: result.added,
				removed: result.removed,
				notFound: result.notFound
			}
		};
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
