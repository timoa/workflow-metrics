import { redirect, error } from '@sveltejs/kit';
import { createOctokit, buildWorkflowDetailData } from '$lib/server/github';
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

	const octokit = createOctokit(connection.access_token);

	try {
		const detailData = await buildWorkflowDetailData(octokit, ownerParam, repoParam, workflowId);
		return {
			detailData,
			owner: ownerParam,
			repo: repoParam,
			hasMistralKey
		};
	} catch (e) {
		console.error('Failed to fetch workflow detail:', e);
		throw error(500, 'Failed to fetch workflow data');
	}
};
