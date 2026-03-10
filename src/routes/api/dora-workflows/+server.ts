import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/types/database';

type DoraWorkflowInsert = Database['public']['Tables']['dora_workflows']['Insert'];

/**
 * GET /api/dora-workflows?repository_id=...
 *
 * Returns the list of workflows selected for DORA metrics for the given repository.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const repositoryId = url.searchParams.get('repository_id');
	if (!repositoryId) throw error(400, 'Missing repository_id parameter');

	const { data: workflows, error: dbError } = await locals.supabase
		.from('dora_workflows')
		.select('*')
		.eq('user_id', user.id)
		.eq('repository_id', repositoryId)
		.order('workflow_name');

	if (dbError) {
		console.error('Error fetching DORA workflows:', dbError);
		throw error(500, 'Failed to fetch DORA workflows');
	}

	return json({ workflows: workflows ?? [] });
};

/**
 * POST /api/dora-workflows
 *
 * Saves the user's selection of workflows for DORA metrics.
 * Replaces existing selections for the repository.
 *
 * Body: {
 *   repository_id: string,
 *   workflows: Array<{ workflow_id: number, workflow_name: string, workflow_path: string }>
 * }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const body = await request.json();
	const { repository_id, workflows } = body as {
		repository_id?: string;
		workflows?: Array<{ workflow_id: number; workflow_name: string; workflow_path: string }>;
	};

	if (!repository_id) throw error(400, 'Missing repository_id');
	if (!workflows || !Array.isArray(workflows)) throw error(400, 'Missing or invalid workflows array');

	// Verify the repository belongs to the user
	const { data: repo } = await locals.supabase
		.from('repositories')
		.select('id')
		.eq('id', repository_id)
		.eq('user_id', user.id)
		.single();

	if (!repo) throw error(404, 'Repository not found');

	// Delete existing DORA workflow selections for this repository
	const { error: deleteError } = await locals.supabase
		.from('dora_workflows')
		.delete()
		.eq('user_id', user.id)
		.eq('repository_id', repository_id);

	if (deleteError) {
		console.error('Error deleting existing DORA workflows:', deleteError);
		throw error(500, 'Failed to delete existing DORA workflows');
	}

	// If workflows array is empty, we're done (user cleared all selections)
	if (workflows.length === 0) {
		return json({ success: true, count: 0 });
	}

	// Insert new selections
	const inserts: DoraWorkflowInsert[] = workflows.map((w) => ({
		user_id: user.id,
		repository_id,
		workflow_id: w.workflow_id,
		workflow_name: w.workflow_name,
		workflow_path: w.workflow_path
	}));

	const { data: inserted, error: insertError } = await locals.supabase
		.from('dora_workflows')
		.insert(inserts)
		.select();

	if (insertError) {
		console.error('Error inserting DORA workflows:', insertError);
		throw error(500, 'Failed to save DORA workflows');
	}

	return json({ success: true, count: inserted?.length ?? 0 });
};
