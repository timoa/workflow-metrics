import { redirect, error } from '@sveltejs/kit';
import { createOctokit, buildDashboardData } from '$lib/server/github';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	// Get GitHub connection
	const { data: connection } = await locals.supabase
		.from('github_connections')
		.select('access_token, github_username')
		.eq('user_id', user.id)
		.single();

	if (!connection) throw redirect(303, '/auth/login');

	// Get the list of tracked repos for the sidebar
	const { data: repos } = await locals.supabase
		.from('repositories')
		.select('id, owner, name, full_name, is_private')
		.eq('user_id', user.id)
		.eq('is_active', true)
		.order('full_name');

	if (!repos || repos.length === 0) throw redirect(303, '/onboarding');

	// Determine which repo to show
	const ownerParam = url.searchParams.get('owner');
	const repoParam = url.searchParams.get('repo');

	let selectedRepo = repos[0];
	if (ownerParam && repoParam) {
		const found = repos.find((r) => r.owner === ownerParam && r.name === repoParam);
		if (found) selectedRepo = found;
	}

	const octokit = createOctokit(connection.access_token);

	try {
		const dashboardData = await buildDashboardData(
			octokit,
			selectedRepo.owner,
			selectedRepo.name
		);

		return {
			dashboardData,
			repos,
			selectedRepo,
			githubUsername: connection.github_username
		};
	} catch (e) {
		console.error('Failed to fetch dashboard data:', e);
		throw error(500, 'Failed to fetch GitHub Actions data. Please check your permissions.');
	}
};
