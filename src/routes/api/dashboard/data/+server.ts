import { error, json } from '@sveltejs/kit';
import {
	createOctokit,
	buildDashboardData,
	isGitHubUnauthorizedError
} from '$lib/server/github';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import {
	getCachedWorkflowRuns,
	setCachedWorkflowRuns
} from '$lib/server/workflow-runs-cache';
import type { RequestHandler } from './$types';

/**
 * GET /api/dashboard/data?owner=...&repo=...
 * Returns dashboard data (workflow runs, metrics, etc.) for the given repo.
 * Used so the dashboard shell can render immediately and this heavy load runs in the background.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const owner = url.searchParams.get('owner');
	const repo = url.searchParams.get('repo');
	if (!owner || !repo) throw error(400, 'Missing owner or repo');

	const { data: connection } = await locals.supabase
		.from('github_connections')
		.select('access_token')
		.eq('user_id', user.id)
		.single();

	if (!connection) throw error(401, 'GitHub connection not found');

	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const windowStart = thirtyDaysAgo.toISOString().slice(0, 10);

	const cachedRuns = await getCachedWorkflowRuns(
		locals.supabase,
		user.id,
		owner,
		repo,
		windowStart
	);

	const octokit = createOctokit(connection.access_token);

	try {
		const dashboardData = await buildDashboardData(octokit, owner, repo, {
			cachedRuns: cachedRuns ?? undefined,
			onRunsFetched: async (runs) => {
				try {
					const admin = createSupabaseAdminClient();
					const supabaseForWrite = admin ?? locals.supabase;
					await setCachedWorkflowRuns(
						supabaseForWrite,
						user.id,
						owner,
						repo,
						windowStart,
						runs
					);
				} catch (e) {
					console.error('[api/dashboard/data] Cache write error:', e);
				}
			}
		});
		return json(dashboardData);
	} catch (e: unknown) {
		if (isGitHubUnauthorizedError(e)) {
			throw error(401, 'GitHub token expired. Please sign in again.');
		}
		const err = e as Record<string, unknown>;
		console.error('[api/dashboard/data] Failed to fetch dashboard data:', err);
		throw error(500, 'Failed to fetch GitHub Actions data. Please check your permissions.');
	}
};
