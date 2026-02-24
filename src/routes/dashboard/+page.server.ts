import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Fast load: only connection, repos, and selected repo.
 * Heavy dashboard data (workflow runs, metrics) is loaded client-side via /api/dashboard/data
 * so the shell appears immediately after login instead of blocking 20–25s.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const [
		{ data: connection },
		{ data: repos },
		{ data: settings }
	] = await Promise.all([
		locals.supabase
			.from('github_connections')
			.select('access_token, github_username')
			.eq('user_id', user.id)
			.single(),
		locals.supabase
			.from('repositories')
			.select('id, owner, name, full_name, is_private')
			.eq('user_id', user.id)
			.eq('is_active', true)
			.order('full_name'),
		locals.supabase
			.from('user_settings')
			.select('default_repo_id')
			.eq('user_id', user.id)
			.single()
	]);

	if (!connection) throw redirect(303, '/auth/login?error=' + encodeURIComponent('GitHub connection not found. Please sign in again.'));

	if (!repos || repos.length === 0) throw redirect(303, '/onboarding');

	// Determine which repo to show: URL params > user default > first in list
	const ownerParam = url.searchParams.get('owner');
	const repoParam = url.searchParams.get('repo');

	let selectedRepo = repos[0];
	if (ownerParam && repoParam) {
		const found = repos.find((r) => r.owner === ownerParam && r.name === repoParam);
		if (found) selectedRepo = found;
	} else if (settings?.default_repo_id) {
		const defaultRepo = repos.find((r) => r.id === settings.default_repo_id);
		if (defaultRepo) selectedRepo = defaultRepo;
	}

	return {
		repos,
		selectedRepo,
		githubUsername: connection.github_username
	};
};
