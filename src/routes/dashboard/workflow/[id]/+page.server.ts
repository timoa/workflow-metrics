import { redirect, error } from '@sveltejs/kit';
import { createOctokit, buildWorkflowDetailData, isGitHubUnauthorizedError } from '$lib/server/github';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import {
	getCachedWorkflowDetailRuns,
	setCachedWorkflowDetailRuns
} from '$lib/server/workflow-runs-cache';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const workflowId = parseInt(params.id, 10);
	if (isNaN(workflowId)) throw error(400, 'Invalid workflow ID');

	const ownerParam = url.searchParams.get('owner');
	const repoParam = url.searchParams.get('repo');
	if (!ownerParam || !repoParam) throw redirect(303, '/dashboard');

	const { data: connection } = await locals.supabase
		.from('github_connections')
		.select('access_token')
		.eq('user_id', user.id)
		.single();

	if (!connection) throw redirect(303, '/auth/login');

	// Check user has access to this repo
	const { data: repo } = await locals.supabase
		.from('repositories')
		.select('id')
		.eq('user_id', user.id)
		.eq('owner', ownerParam)
		.eq('name', repoParam)
		.single();

	if (!repo) throw error(403, 'Repository not found or access denied');

	// Get Mistral API key if configured
	const { data: settings } = await locals.supabase
		.from('user_settings')
		.select('mistral_api_key')
		.eq('user_id', user.id)
		.single();

	const hasMistralKey = !!settings?.mistral_api_key;

	// 30-day window for cache key
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const windowStart = thirtyDaysAgo.toISOString().slice(0, 10);

	const cachedResult = await getCachedWorkflowDetailRuns(
		locals.supabase,
		user.id,
		ownerParam,
		repoParam,
		workflowId,
		windowStart
	);

	const octokit = createOctokit(connection.access_token);

	try {
		const detailData = await buildWorkflowDetailData(
			octokit,
			ownerParam,
			repoParam,
			workflowId,
			{
				cachedRuns: cachedResult?.runs,
				onRunsFetched: async (runs) => {
					try {
						const admin = createSupabaseAdminClient();
						const supabaseForWrite = admin ?? locals.supabase;
						const result = await setCachedWorkflowDetailRuns(
							supabaseForWrite,
							user.id,
							ownerParam,
							repoParam,
							workflowId,
							windowStart,
							runs
						);
						if (!result.ok) {
							console.warn('[workflow-detail] Cache write failed:', result.error);
						}
					} catch (e) {
						console.error('[workflow-detail] Cache write error:', e);
					}
				}
			}
		);
		return {
			detailData,
			owner: ownerParam,
			repo: repoParam,
			hasMistralKey
		};
	} catch (e: unknown) {
		if (isGitHubUnauthorizedError(e)) {
			throw redirect(303, '/auth/login?error=' + encodeURIComponent('GitHub token expired. Please sign in again to reconnect.'));
		}
		console.error('Failed to fetch workflow detail:', e);
		throw error(500, 'Failed to fetch workflow data');
	}
};
