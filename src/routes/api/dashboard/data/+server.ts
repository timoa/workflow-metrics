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
 * GET /api/dashboard/data?owner=...&repo=...&days=7
 *
 * Returns dashboard data for the given repo. Supports:
 *
 * - ?days=7  (default: 30) — tiered loading: client fetches 7-day data first (fast),
 *   then requests 30-day data in the background.
 *
 * - Cache-hit (fresh):   returns JSON immediately.
 * - Cache-hit (stale):   returns stale JSON immediately with `X-Data-Stale: true` header,
 *   then refreshes the cache in the background (stale-while-revalidate).
 * - Cache-miss:          if client sends `Accept: text/event-stream`, streams progress
 *   events via SSE so the UI can show a live progress bar; otherwise returns JSON
 *   once all data has been fetched.
 */
export const GET: RequestHandler = async ({ url, locals, request, platform }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw error(401, 'Unauthorized');

	const owner = url.searchParams.get('owner');
	const repo = url.searchParams.get('repo');
	if (!owner || !repo) throw error(400, 'Missing owner or repo');

	const daysParam = url.searchParams.get('days');
	const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10) || 30, 1), 90) : 30;

	const { data: connection } = await locals.supabase
		.from('github_connections')
		.select('access_token')
		.eq('user_id', user.id)
		.single();

	if (!connection) throw error(401, 'GitHub connection not found');

	const windowStart = (() => {
		const d = new Date();
		d.setDate(d.getDate() - days);
		return d.toISOString().slice(0, 10);
	})();

	const cachedResult = await getCachedWorkflowRuns(
		locals.supabase,
		user.id,
		owner,
		repo,
		windowStart
	);

	const octokit = createOctokit(connection.access_token);

	// --- Cache hit (fresh) ---
	if (cachedResult && !cachedResult.isStale) {
		try {
			const dashboardData = await buildDashboardData(octokit, owner, repo, {
				cachedRuns: cachedResult.runs,
				days
			});
			return json(dashboardData);
		} catch (e: unknown) {
			return handleGitHubError(e);
		}
	}

	// --- Cache hit (stale): return stale data immediately, refresh in background ---
	if (cachedResult && cachedResult.isStale) {
		let staleResponseData: ReturnType<typeof json> | null = null;
		try {
			const staleData = await buildDashboardData(octokit, owner, repo, {
				cachedRuns: cachedResult.runs,
				days
			});
			staleResponseData = json(staleData, {
				headers: { 'X-Data-Stale': 'true' }
			});
		} catch (e: unknown) {
			return handleGitHubError(e);
		}

		// Fire background refresh — update the cache without blocking the response
		const refreshTask = (async () => {
			try {
				const admin = createSupabaseAdminClient();
				const supabaseForWrite = admin ?? locals.supabase;
				await buildDashboardData(octokit, owner, repo, {
					days,
					onRunsFetched: async (runs) => {
						await setCachedWorkflowRuns(
							supabaseForWrite,
							user.id,
							owner,
							repo,
							windowStart,
							runs
						);
					}
				});
			} catch (e) {
				console.warn('[api/dashboard/data] Background SWR refresh failed:', e);
			}
		})();

		// On Cloudflare Workers, use waitUntil so the worker stays alive for the background task
		const ctx = platform?.env ? (platform as { context?: { waitUntil?: (p: Promise<unknown>) => void } }).context : undefined;
		if (ctx?.waitUntil) {
			ctx.waitUntil(refreshTask);
		}
		// In Node.js the promise runs fire-and-forget

		return staleResponseData!;
	}

	// --- Cache miss ---
	// If client requests SSE, stream progress events for a better UX during long fetches
	const acceptsSSE = request.headers.get('Accept') === 'text/event-stream';

	if (acceptsSSE) {
		return streamDashboardData(octokit, owner, repo, days, windowStart, user.id, locals);
	}

	// Plain JSON fallback (no SSE support, or client didn't request it)
	try {
		const admin = createSupabaseAdminClient();
		const supabaseForWrite = admin ?? locals.supabase;

		const dashboardData = await buildDashboardData(octokit, owner, repo, {
			days,
			onRunsFetched: async (runs) => {
				try {
					await setCachedWorkflowRuns(supabaseForWrite, user.id, owner, repo, windowStart, runs);
				} catch (e) {
					console.error('[api/dashboard/data] Cache write error:', e);
				}
			}
		});
		return json(dashboardData);
	} catch (e: unknown) {
		return handleGitHubError(e);
	}
};

// ---------------------------------------------------------------------------
// SSE streaming helper
// ---------------------------------------------------------------------------

type SseEvent =
	| { event: 'progress'; data: { phase: 'fetching'; fetched: number; total: number; page: number } }
	| { event: 'progress'; data: { phase: 'computing' } }
	| { event: 'complete'; data: unknown }
	| { event: 'error'; data: { message: string } };

function encodeSse(ev: SseEvent): string {
	return `event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`;
}

function streamDashboardData(
	octokit: ReturnType<typeof createOctokit>,
	owner: string,
	repo: string,
	days: number,
	windowStart: string,
	userId: string,
	locals: App.Locals
): Response {
	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const writer = writable.getWriter();
	const encoder = new TextEncoder();

	const write = (ev: SseEvent) => {
		writer.write(encoder.encode(encodeSse(ev))).catch(() => {});
	};

	(async () => {
		try {
			const admin = createSupabaseAdminClient();
			const supabaseForWrite = admin ?? locals.supabase;

			const dashboardData = await buildDashboardData(octokit, owner, repo, {
				days,
				onProgress: (fetched, total, page) => {
					write({
						event: 'progress',
						data: { phase: 'fetching', fetched, total, page }
					});
				},
				onRunsFetched: async (runs) => {
					write({ event: 'progress', data: { phase: 'computing' } });
					try {
						await setCachedWorkflowRuns(supabaseForWrite, userId, owner, repo, windowStart, runs);
					} catch (e) {
						console.error('[api/dashboard/data] Cache write error (SSE):', e);
					}
				}
			});

			write({ event: 'complete', data: dashboardData });
		} catch (e: unknown) {
			const message = isGitHubUnauthorizedError(e)
				? 'GitHub token expired. Please sign in again.'
				: 'Failed to fetch GitHub Actions data. Please check your permissions.';
			write({ event: 'error', data: { message } });
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
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function handleGitHubError(e: unknown): never {
	if (isGitHubUnauthorizedError(e)) {
		throw error(401, 'GitHub token expired. Please sign in again.');
	}
	const err = e as Record<string, unknown>;
	console.error('[api/dashboard/data] Failed to fetch dashboard data:', err);
	throw error(500, 'Failed to fetch GitHub Actions data. Please check your permissions.');
}
