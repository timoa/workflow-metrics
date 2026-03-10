import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/types/database';

type DoraWorkflowInsert = Database['public']['Tables']['dora_workflows']['Insert'];
const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseRepositoryId(input: unknown): string {
	if (typeof input !== 'string' || input.trim().length === 0) {
		throw error(400, 'Missing repository_id');
	}
	const repositoryId = input.trim();
	if (!UUID_REGEX.test(repositoryId)) {
		throw error(400, 'Invalid repository_id');
	}
	return repositoryId;
}

/**
 * GET /api/dora-workflows?repository_id=...
 *
 * Returns the list of workflows selected for DORA metrics for the given repository.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const repositoryId = parseRepositoryId(url.searchParams.get('repository_id'));

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

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid request payload');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw error(400, 'Invalid request payload');
	}

	const { repository_id, workflows } = body as {
		repository_id?: unknown;
		workflows?: unknown;
	};
	const repository_id_validated = parseRepositoryId(repository_id);

	if (!Array.isArray(workflows)) {
		throw error(400, 'Missing or invalid workflows array');
	}

	const normalizedWorkflows = workflows.map((item) => {
		if (!item || typeof item !== 'object') {
			throw error(400, 'Missing or invalid workflows array/item');
		}

		const candidate = item as {
			workflow_id?: unknown;
			workflow_name?: unknown;
			workflow_path?: unknown;
		};
		const workflowId = Number(candidate.workflow_id);
		const workflowName =
			typeof candidate.workflow_name === 'string' ? candidate.workflow_name.trim() : '';
		const workflowPath =
			typeof candidate.workflow_path === 'string' ? candidate.workflow_path.trim() : '';

		if (!Number.isFinite(workflowId) || workflowName.length === 0 || workflowPath.length === 0) {
			throw error(400, 'Missing or invalid workflows array/item');
		}

		return {
			workflow_id: workflowId,
			workflow_name: workflowName,
			workflow_path: workflowPath
		};
	});

	// Verify the repository belongs to the user
	const { data: repo, error: repoQueryError } = await locals.supabase
		.from('repositories')
		.select('id')
		.eq('id', repository_id_validated)
		.eq('user_id', user.id)
		.maybeSingle();

	if (repoQueryError) {
		console.error('Error checking repository ownership:', repoQueryError);
		throw error(500, 'Failed to validate repository');
	}
	if (!repo) throw error(404, 'Repository not found');

	const inserts: DoraWorkflowInsert[] = normalizedWorkflows.map((w) => ({
		user_id: user.id,
		repository_id: repository_id_validated,
		workflow_id: w.workflow_id,
		workflow_name: w.workflow_name,
		workflow_path: w.workflow_path
	}));

	let finalCount = 0;
	if (inserts.length > 0) {
		const { data: upserted, error: upsertError } = await locals.supabase
			.from('dora_workflows')
			.upsert(inserts, { onConflict: 'user_id,repository_id,workflow_id' })
			.select();

		if (upsertError) {
			console.error('Error upserting DORA workflows:', upsertError);
			throw error(500, 'Failed to save DORA workflows');
		}
		finalCount = upserted?.length ?? 0;
	}

	const selectedWorkflowIds = inserts.map((w) => w.workflow_id);
	const cleanupQuery = locals.supabase
		.from('dora_workflows')
		.delete()
		.eq('user_id', user.id)
		.eq('repository_id', repository_id_validated);

	const { error: cleanupError } =
		selectedWorkflowIds.length > 0
			? await cleanupQuery.not('workflow_id', 'in', `(${selectedWorkflowIds.join(',')})`)
			: await cleanupQuery;

	if (cleanupError) {
		console.error('Error deleting stale DORA workflows:', cleanupError);
		throw error(500, 'Failed to clean up DORA workflows');
	}

	return json({ success: true, count: finalCount });
};
