import { error } from '@sveltejs/kit';
import { streamWorkflowOptimization } from '$lib/server/mistral';
import { Octokit } from '@octokit/rest';
import type { RequestHandler } from './$types';
import type { WorkflowMetrics } from '$lib/types/metrics';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const body = await request.json();
	const { workflowId, workflowName, workflowPath, owner, repo, metrics } = body as {
		workflowId: number;
		workflowName: string;
		workflowPath: string;
		owner: string;
		repo: string;
		metrics: WorkflowMetrics;
	};

	if (!owner || !repo || !workflowId) {
		throw error(400, 'Missing required fields');
	}

	// Get user settings with Mistral API key
	const { data: settings } = await locals.supabase
		.from('user_settings')
		.select('mistral_api_key')
		.eq('user_id', user.id)
		.single();

	if (!settings?.mistral_api_key) {
		throw error(400, 'Mistral API key not configured. Add it in Settings.');
	}

	// Get GitHub connection to fetch workflow YAML
	const { data: connection } = await locals.supabase
		.from('github_connections')
		.select('access_token')
		.eq('user_id', user.id)
		.single();

	if (!connection) throw error(401, 'GitHub connection not found');

	// Fetch the actual workflow YAML from GitHub
	let workflowYaml = '';
	try {
		const octokit = new Octokit({ auth: connection.access_token });
		const { data: fileContent } = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: workflowPath.startsWith('/') ? workflowPath.slice(1) : workflowPath
		});

		if ('content' in fileContent && fileContent.content) {
			workflowYaml = atob(fileContent.content.replace(/\n/g, ''));
		}
	} catch (e) {
		console.error('Could not fetch workflow YAML:', e);
		workflowYaml = `# Could not fetch workflow YAML for ${workflowPath}`;
	}

	// Stream the optimization
	const result = await streamWorkflowOptimization(
		settings.mistral_api_key,
		workflowName,
		workflowYaml,
		metrics
	);

	return result.toTextStreamResponse();
};
