import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { generateOptimizedYaml } from '$lib/server/mistral';
import { getInstallationForOwner, getInstallationToken } from '$lib/server/github-app';
import { Octokit } from '@octokit/rest';
import type { RequestHandler } from './$types';
import type { OptimizationItem } from '$lib/types/metrics';

/** Slugify a workflow name for use in a branch name. */
function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Extract a human-readable message from a GitHub API error. */
function githubErrorMessage(e: unknown): string {
	if (e == null || typeof e !== 'object') return String(e);
	const err = e as Record<string, unknown>;
	const status = typeof err.status === 'number' ? err.status : null;
	const data =
		err.response != null && typeof err.response === 'object'
			? ((err.response as Record<string, unknown>).data as Record<string, unknown> | undefined)
			: undefined;
	const msg: string =
		typeof data?.message === 'string'
			? data.message
			: typeof err.message === 'string'
				? err.message
				: 'Unknown GitHub error';

	if (status === 403 || status === 401) {
		if (msg.includes('Resource not accessible by integration')) {
			return (
				`GitHub permission denied (${status}): ${msg}. ` +
				'This usually means: (1) the GitHub App does not have "Contents: Read & Write" and "Pull requests: Read & Write" permissions — ' +
				'check github.com → Settings → Developer settings → GitHub Apps → Permissions; or ' +
				'(2) this repository is not included in the app installation\'s repository access list — ' +
				'check github.com → Settings → Applications → Installed GitHub Apps → Configure.'
			);
		}
		return `GitHub permission denied (${status}): ${msg}. The GitHub App may not have the required permissions (Contents: Read & Write, Pull requests: Read & Write). Check the app's permission settings on GitHub.`;
	}
	if (status === 404) {
		return `GitHub API error (404): ${msg}. Make sure the GitHub App is installed on the repository owner's account and that it has access to this repository.`;
	}
	if (status === 422) {
		return `GitHub rejected the request (422): ${msg}. The branch may already exist or the file content is invalid.`;
	}
	if (status != null) {
		return `GitHub API error (${status}): ${msg}`;
	}
	return msg;
}

/** Return the HTTP status code from an Octokit error, or null. */
function githubErrorStatus(e: unknown): number | null {
	if (e != null && typeof e === 'object' && 'status' in e && typeof (e as Record<string, unknown>).status === 'number') {
		return (e as Record<string, unknown>).status as number;
	}
	return null;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const body = await request.json();
	const { workflowPath, owner, repo, workflowName, selectedOptimizations } = body as {
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

	const { data: settings } = await locals.supabase
		.from('user_settings')
		.select('mistral_api_key')
		.eq('user_id', user.id)
		.single();

	if (!settings?.mistral_api_key) {
		throw error(400, 'Mistral API key not configured. Add it in Settings.');
	}

	const appId = env.GITHUB_APP_ID;
	const privateKey = env.GITHUB_APP_PRIVATE_KEY;

	if (!appId || !privateKey) {
		throw error(
			500,
			'GitHub App is not configured on this server (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY).'
		);
	}

	const installationId = await getInstallationForOwner(locals.supabase, user.id, owner);

	if (installationId === null) {
		throw error(
			400,
			`GitHub App not installed for "${owner}". Go to Settings and install the Workflow Metrics GitHub App on this account or organization.`
		);
	}

	let githubToken: string;
	let tokenPermissions: Record<string, string> = {};
	try {
		const result = await getInstallationToken(appId, privateKey, installationId, {
			permissions: {
				contents: 'write',
				pull_requests: 'write',
				workflows: 'write'
			}
		});

		githubToken = result.token;
		tokenPermissions = result.permissions;

		const missingPerms: string[] = [];
		if (tokenPermissions.contents !== 'write') missingPerms.push(`contents (got: ${tokenPermissions.contents ?? 'none'})`);
		if (tokenPermissions.pull_requests !== 'write') missingPerms.push(`pull_requests (got: ${tokenPermissions.pull_requests ?? 'none'})`);
		if (tokenPermissions.workflows !== 'write') missingPerms.push(`workflows (got: ${tokenPermissions.workflows ?? 'none'})`);

		if (missingPerms.length > 0) {
			throw error(
				403,
				`GitHub App token is missing required write permissions: ${missingPerms.join(', ')}. ` +
					`All permissions returned: ${JSON.stringify(tokenPermissions)}. Installation ID: ${installationId}. ` +
					'Go to github.com → Settings → Developer settings → GitHub Apps → Permissions & events, ' +
					'set Contents to "Read & Write", Pull requests to "Read & Write", and Workflows to "Read & Write", then accept the updated permissions on each installation.'
			);
		}
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		const msg = e instanceof Error ? e.message : String(e);
		throw error(500, `Could not obtain GitHub App token: ${msg}`);
	}

	const octokit = new Octokit({ auth: githubToken });
	const normalizedPath = workflowPath.startsWith('/') ? workflowPath.slice(1) : workflowPath;

	// Fetch the original workflow YAML from the default branch
	let originalYaml = '';
	try {
		const { data: fileContent } = await octokit.rest.repos.getContent({
			owner,
			repo,
			path: normalizedPath
		});
		if ('content' in fileContent && fileContent.content) {
			originalYaml = atob(fileContent.content.replace(/\n/g, ''));
		}
	} catch (e) {
		throw error(500, githubErrorMessage(e));
	}

	if (!originalYaml) throw error(500, 'Empty workflow YAML fetched from GitHub');

	// Get the default branch HEAD SHA for branching
	let defaultBranch: string;
	let baseSha: string;
	try {
		const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
		defaultBranch = repoData.default_branch;
		const { data: refData } = await octokit.rest.git.getRef({
			owner,
			repo,
			ref: `heads/${defaultBranch}`
		});
		baseSha = refData.object.sha;
	} catch (e) {
		throw error(500, githubErrorMessage(e));
	}

	// Create branch — if it already exists from a previous attempt, delete and recreate.
	const branchName = `fix/workflow-metrics/${slugify(workflowName)}-ai-optimization`;
	try {
		await octokit.rest.git.createRef({
			owner,
			repo,
			ref: `refs/heads/${branchName}`,
			sha: baseSha
		});
	} catch (e) {
		if (githubErrorStatus(e) === 422) {
			try {
				await octokit.rest.git.deleteRef({ owner, repo, ref: `heads/${branchName}` });
				await octokit.rest.git.createRef({
					owner,
					repo,
					ref: `refs/heads/${branchName}`,
					sha: baseSha
				});
			} catch (e2) {
				throw error(500, `Failed to recreate branch: ${githubErrorMessage(e2)}`);
			}
		} else {
			throw error(500, `Failed to create branch: ${githubErrorMessage(e)}`);
		}
	}

	// -----------------------------------------------------------------------
	// Commit each optimization using the low-level Git Data API.
	//
	// The high-level Contents API (createOrUpdateFileContents) requires the
	// special "workflows" permission to modify files under .github/workflows/.
	// The Git Data API (blob → tree → commit → updateRef) does NOT have this
	// restriction and works with just "contents: write".
	// -----------------------------------------------------------------------
	let currentYaml = originalYaml;
	let currentCommitSha = baseSha;
	const commitTitle = `fix(cicd): optimize the ${workflowName} workflow with Workflow Metrics`;

	for (const optimization of selectedOptimizations) {
		let stepYaml: string;
		try {
			stepYaml = await generateOptimizedYaml(
				settings.mistral_api_key,
				workflowName,
				currentYaml,
				[optimization]
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw error(500, `Mistral failed for "${optimization.title}": ${msg}`);
		}

		const commitBodyLines = [
			optimization.title,
			'',
			optimization.explanation,
			...(optimization.estimatedImpact
				? ['', `Expected impact: ${optimization.estimatedImpact}`]
				: []),
			...(optimization.effort ? [`Effort: ${optimization.effort}`] : [])
		];

		let stepName = '';
		try {
			stepName = 'createBlob';
			const { data: blob } = await octokit.rest.git.createBlob({
				owner,
				repo,
				content: stepYaml,
				encoding: 'utf-8'
			});

			stepName = 'getCommit';
			const { data: baseCommit } = await octokit.rest.git.getCommit({
				owner,
				repo,
				commit_sha: currentCommitSha
			});

			stepName = 'createTree';
			const { data: newTree } = await octokit.rest.git.createTree({
				owner,
				repo,
				base_tree: baseCommit.tree.sha,
				tree: [
					{
						path: normalizedPath,
						mode: '100644',
						type: 'blob',
						sha: blob.sha
					}
				]
			});

			stepName = 'createCommit';
			const { data: newCommit } = await octokit.rest.git.createCommit({
				owner,
				repo,
				message: `${commitTitle}\n\n${commitBodyLines.join('\n')}`,
				tree: newTree.sha,
				parents: [currentCommitSha]
			});

			stepName = 'updateRef';
			await octokit.rest.git.updateRef({
				owner,
				repo,
				ref: `heads/${branchName}`,
				sha: newCommit.sha
			});

			currentCommitSha = newCommit.sha;
		} catch (e) {
			throw error(
				500,
				`Failed at step "${stepName}" for "${optimization.title}" [installation=${installationId}, owner=${owner}, repo=${repo}]: ${githubErrorMessage(e)}`
			);
		}

		currentYaml = stepYaml;
	}

	// Create the Pull Request
	const prTitle = `fix(cicd): optimize the ${workflowName} workflow with Workflow Metrics`;
	const prBodyLines = [
		`## AI Optimizations for \`${workflowName}\``,
		'',
		`This PR applies ${selectedOptimizations.length} AI-suggested optimization${selectedOptimizations.length > 1 ? 's' : ''}, each as a separate commit:`,
		'',
		...selectedOptimizations.map((o, i) =>
			[
				`### ${i + 1}. ${o.title}`,
				`**Category:** ${o.category} · **Effort:** ${o.effort}${o.estimatedImpact ? ` · **Expected impact:** ${o.estimatedImpact}` : ''}`,
				'',
				o.explanation
			].join('\n')
		),
		'',
		'---',
		'*Generated by [Workflow Metrics](https://github.com) AI Optimization*'
	];

	let prUrl: string;
	try {
		const { data: pr } = await octokit.rest.pulls.create({
			owner,
			repo,
			title: prTitle,
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
