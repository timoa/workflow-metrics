import { error, json } from '@sveltejs/kit';
import { generateOptimizedYaml } from '$lib/server/mistral';
import { Octokit } from '@octokit/rest';
import type { RequestHandler } from './$types';
import type { OptimizationItem } from '$lib/types/metrics';

/** Extract a human-readable message from a GitHub API error. */
function githubErrorMessage(e: unknown): string {
	if (e == null || typeof e !== 'object') return String(e);
	const err = e as Record<string, unknown>;
	const status = typeof err.status === 'number' ? err.status : null;
	const data = err.response != null && typeof err.response === 'object'
		? (err.response as Record<string, unknown>).data as Record<string, unknown> | undefined
		: undefined;
	const msg: string = typeof data?.message === 'string'
		? data.message
		: typeof err.message === 'string' ? err.message : 'Unknown GitHub error';

	if (status === 403 || status === 401) {
		return `GitHub permission denied (${status}): ${msg}. Go to Settings → Grant write access to reconnect with the required "repo" scope.`;
	}
	if (status === 404) {
		// GitHub returns 404 (not 403) for write operations when the token lacks push access.
		return `GitHub API error (404): ${msg}. This usually means the connected GitHub account doesn't have push access to this repository. If the repo belongs to an organization, an admin may need to approve the OAuth App first — or use a Personal Access Token (PAT) instead in Settings, which bypasses that requirement.`;
	}
	if (status === 422) {
		return `GitHub rejected the request (422): ${msg}. The branch may already exist or the file content is invalid.`;
	}
	if (status != null) {
		return `GitHub API error (${status}): ${msg}`;
	}
	return msg;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const body = await request.json();
	const { workflowId, workflowPath, owner, repo, workflowName, selectedOptimizations } = body as {
		workflowId: number;
		workflowPath: string;
		owner: string;
		repo: string;
		workflowName: string;
		selectedOptimizations: OptimizationItem[];
	};

	if (!owner || !repo || !workflowPath || !selectedOptimizations?.length) {
		throw error(400, 'Missing required fields');
	}

	// Get Mistral API key and optional write token in one query
	const { data: settings } = await locals.supabase
		.from('user_settings')
		.select('mistral_api_key, github_write_token')
		.eq('user_id', user.id)
		.single();

	if (!settings?.mistral_api_key) {
		throw error(400, 'Mistral API key not configured. Add it in Settings.');
	}

	// Get GitHub connection (OAuth token fallback)
	const { data: connection } = await locals.supabase
		.from('github_connections')
		.select('access_token')
		.eq('user_id', user.id)
		.single();

	if (!connection) throw error(401, 'GitHub connection not found');

	// Prefer the dedicated write PAT; fall back to the OAuth token
	const githubToken = settings.github_write_token || connection.access_token;
	const octokit = new Octokit({ auth: githubToken });
	const normalizedPath = workflowPath.startsWith('/') ? workflowPath.slice(1) : workflowPath;

	// Fetch the original workflow YAML and file SHA
	let originalYaml = '';
	let fileSha = '';
	try {
		const { data: fileContent } = await octokit.rest.repos.getContent({ owner, repo, path: normalizedPath });
		if ('content' in fileContent && fileContent.content) {
			originalYaml = atob(fileContent.content.replace(/\n/g, ''));
			fileSha = fileContent.sha;
		}
	} catch (e) {
		throw error(500, githubErrorMessage(e));
	}

	if (!originalYaml) throw error(500, 'Empty workflow YAML fetched from GitHub');

	// Generate optimized YAML via Mistral
	let optimizedYaml: string;
	try {
		optimizedYaml = await generateOptimizedYaml(
			settings.mistral_api_key,
			workflowName,
			originalYaml,
			selectedOptimizations
		);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(500, `Mistral failed to generate optimized YAML: ${msg}`);
	}

	// Encode UTF-8 YAML to base64 using Web APIs (Cloudflare Workers compatible)
	const yamlBytes = new TextEncoder().encode(optimizedYaml);
	let yamlBinary = '';
	for (const byte of yamlBytes) yamlBinary += String.fromCharCode(byte);
	const yamlBase64 = btoa(yamlBinary);

	// Get the default branch HEAD SHA
	let defaultBranch: string;
	let baseSha: string;
	try {
		const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
		defaultBranch = repoData.default_branch;
		const { data: refData } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` });
		baseSha = refData.object.sha;
	} catch (e) {
		throw error(500, githubErrorMessage(e));
	}

	// Create branch
	const timestamp = Date.now();
	const branchName = `workflow-optimize-${workflowId}-${timestamp}`;
	try {
		await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha: baseSha });
	} catch (e) {
		throw error(500, `Failed to create branch: ${githubErrorMessage(e)}`);
	}

	// Commit the optimized YAML
	const optimizationTitles = selectedOptimizations.map((o) => `- ${o.title}`).join('\n');
	const commitMessage = `chore: optimize ${workflowName} workflow\n\nApplied optimizations:\n${optimizationTitles}`;
	try {
		await octokit.rest.repos.createOrUpdateFileContents({
			owner, repo, path: normalizedPath,
			message: commitMessage,
			content: yamlBase64,
			sha: fileSha,
			branch: branchName
		});
	} catch (e) {
		throw error(500, `Failed to commit file: ${githubErrorMessage(e)}`);
	}

	// Build PR body
	const prBodyLines = [
		`## Workflow Optimizations for \`${workflowName}\``,
		'',
		'This PR applies the following AI-suggested optimizations:',
		'',
		...selectedOptimizations.map(
			(o) =>
				`### ${o.title}\n**Category:** ${o.category} · **Effort:** ${o.effort}${o.estimatedImpact ? ` · **Expected impact:** ${o.estimatedImpact}` : ''}\n\n${o.explanation}`
		),
		'',
		'---',
		'*Generated by [Workflow Metrics](https://github.com) AI Optimization*'
	];

	// Create the PR
	let prUrl: string;
	try {
		const { data: pr } = await octokit.rest.pulls.create({
			owner, repo,
			title: `chore: optimize ${workflowName} workflow (${selectedOptimizations.length} improvement${selectedOptimizations.length > 1 ? 's' : ''})`,
			body: prBodyLines.join('\n'),
			head: branchName,
			base: defaultBranch
		});
		prUrl = pr.html_url;
	} catch (e) {
		throw error(500, `Failed to create PR: ${githubErrorMessage(e)}`);
	}

	return json({ prUrl, branchName });
};
