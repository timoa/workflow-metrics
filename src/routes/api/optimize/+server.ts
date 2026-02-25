import { error } from '@sveltejs/kit';
import { generateOptimizationReport } from '$lib/server/mistral';
import { Octokit } from '@octokit/rest';
import type { RequestHandler } from './$types';
import type { WorkflowMetrics } from '$lib/types/metrics';

type SseEvent =
	| { event: 'phase'; data: { step: string; message: string } }
	| { event: 'complete'; data: unknown }
	| { event: 'error'; data: { message: string } };

function encodeSse(ev: SseEvent): string {
	return `event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`;
}

/**
 * POST /api/optimize
 *
 * Streams progress events via SSE so the UI can show meaningful step messages
 * while Mistral AI generates the optimization report.
 *
 * Events:
 *   phase   — { step, message } — a server-side phase started
 *   complete — full OptimizationHistoryEntry (cached or fresh)
 *   error    — { message }
 */
export const POST: RequestHandler = async ({ request, url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const force = url.searchParams.get('force') === 'true';

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

	// Capture locals before streaming (avoids request-scope issues in async context)
	const supabase = locals.supabase;

	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const writer = writable.getWriter();
	const encoder = new TextEncoder();

	const send = (ev: SseEvent) => {
		writer.write(encoder.encode(encodeSse(ev))).catch(() => {});
	};

	(async () => {
		try {
			// ── Phase 1: Cache check ──────────────────────────────────────────────
			send({ event: 'phase', data: { step: 'checking-cache', message: 'Checking optimization cache…' } });

			if (!force) {
				const { data: existing } = await supabase
					.from('optimization_history')
					.select('result, prompt_tokens, completion_tokens, created_at')
					.eq('user_id', user.id)
					.eq('workflow_id', workflowId)
					.single();

				if (existing) {
					send({
						event: 'complete',
						data: {
							cached: true,
							result: existing.result,
							createdAt: existing.created_at,
							promptTokens: existing.prompt_tokens,
							completionTokens: existing.completion_tokens
						}
					});
					return;
				}
			}

			// Validate settings
			const { data: settings } = await supabase
				.from('user_settings')
				.select('mistral_api_key')
				.eq('user_id', user.id)
				.single();

			if (!settings?.mistral_api_key) {
				send({ event: 'error', data: { message: 'Mistral API key not configured. Add it in Settings.' } });
				return;
			}

			// ── Phase 2: Fetch workflow YAML from GitHub ──────────────────────────
			send({ event: 'phase', data: { step: 'fetching-yaml', message: 'Fetching workflow YAML from GitHub…' } });

			const { data: connection } = await supabase
				.from('github_connections')
				.select('access_token')
				.eq('user_id', user.id)
				.single();

			if (!connection) {
				send({ event: 'error', data: { message: 'GitHub connection not found' } });
				return;
			}

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

			// ── Phase 3: AI analysis ──────────────────────────────────────────────
			// The client will cycle through category-specific messages during this phase.
			send({ event: 'phase', data: { step: 'ai-analyzing', message: 'Analyzing your workflow with Mistral AI…' } });

			const { result, usage } = await generateOptimizationReport(
				settings.mistral_api_key,
				workflowName,
				workflowYaml,
				metrics
			);

			// ── Phase 4: Save ─────────────────────────────────────────────────────
			send({ event: 'phase', data: { step: 'saving', message: 'Saving recommendations…' } });

			const now = new Date().toISOString();
			await supabase
				.from('optimization_history')
				.upsert(
					{
						user_id: user.id,
						workflow_id: workflowId,
						owner,
						repo,
						result,
						prompt_tokens: usage.promptTokens,
						completion_tokens: usage.completionTokens,
						created_at: now
					},
					{ onConflict: 'user_id,workflow_id' }
				);

			send({
				event: 'complete',
				data: {
					cached: false,
					result,
					createdAt: now,
					promptTokens: usage.promptTokens,
					completionTokens: usage.completionTokens
				}
			});
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : 'Optimization failed';
			send({ event: 'error', data: { message: msg } });
		} finally {
			writer.close().catch(() => {});
		}
	})();

	return new Response(readable, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
