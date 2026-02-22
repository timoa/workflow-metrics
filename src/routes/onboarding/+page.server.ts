import { fail, redirect } from '@sveltejs/kit';
import { Octokit } from '@octokit/rest';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	// Get the GitHub connection
	const { data: connection } = await locals.supabase
		.from('github_connections')
		.select('*')
		.eq('user_id', user.id)
		.single();

	if (!connection) throw redirect(303, '/auth/login');

	const octokit = new Octokit({ auth: connection.access_token });

	// Fetch user's orgs and personal account
	const [userResponse, orgsResponse] = await Promise.all([
		octokit.rest.users.getAuthenticated(),
		octokit.rest.orgs.listForAuthenticatedUser({ per_page: 50 })
	]);

	const allAccounts = [
		{
			login: userResponse.data.login,
			avatarUrl: userResponse.data.avatar_url,
			type: 'user' as const
		},
		...orgsResponse.data.map((org) => ({
			login: org.login,
			avatarUrl: org.avatar_url,
			type: 'org' as const
		}))
	];

	const addOrgOnly = url.searchParams.get('add') === 'org';
	const accounts = addOrgOnly ? allAccounts.filter((a) => a.type === 'org') : allAccounts;

	return { accounts, connectionId: connection.id, addOrgOnly };
};

export const actions: Actions = {
	fetchRepos: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		const accountLogin = formData.get('account') as string;
		const accountType = (formData.get('accountType') as 'user' | 'org') ?? 'org';

		const { data: connection } = await locals.supabase
			.from('github_connections')
			.select('access_token')
			.eq('user_id', user.id)
			.single();

		if (!connection) return fail(401, { error: 'GitHub not connected', repos: [] });

		const octokit = new Octokit({ auth: connection.access_token });

		const toRepo = (r: { id: number; name: string; full_name: string; private: boolean }) => ({
			id: r.id,
			name: r.name,
			fullName: r.full_name,
			isPrivate: r.private
		});

		try {
			if (accountType === 'user') {
				const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
					per_page: 100,
					sort: 'updated'
				});
				return {
					repos: repos.filter((r) => r.owner.login === accountLogin).map(toRepo)
				};
			}

			const { data: repos } = await octokit.rest.repos.listForOrg({
				org: accountLogin,
				per_page: 100,
				sort: 'updated'
			});
			return { repos: repos.map(toRepo) };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return fail(500, { error: `GitHub API: ${message}`, repos: [] });
		}
	},

	saveRepos: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		const reposJson = formData.get('repos') as string;
		const connectionId = formData.get('connectionId') as string;

		let repos: Array<{ id: number; name: string; fullName: string; isPrivate: boolean; owner: string }> = [];
		try {
			repos = JSON.parse(reposJson);
		} catch {
			return { error: 'Invalid data' };
		}

		// Upsert repos
		const inserts = repos.map((r) => ({
			user_id: user.id,
			connection_id: connectionId,
			github_repo_id: r.id,
			owner: r.owner,
			name: r.name,
			full_name: r.fullName,
			is_private: r.isPrivate
		}));

		const { error } = await locals.supabase
			.from('repositories')
			.upsert(inserts, { onConflict: 'user_id,github_repo_id' });

		if (error) return { error: error.message };

		// Create default settings for this user pointing to first repo
		const firstRepoResult = await locals.supabase
			.from('repositories')
			.select('id')
			.eq('user_id', user.id)
			.limit(1)
			.single();

		await locals.supabase.from('user_settings').upsert(
			{
				user_id: user.id,
				default_repo_id: firstRepoResult.data?.id ?? null,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id' }
		);

		throw redirect(303, '/dashboard');
	}
};
