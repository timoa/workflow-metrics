import { redirect, error } from '@sveltejs/kit';
import {
	createOctokit,
	buildDashboardData,
	isGitHubUnauthorizedError,
	type TimingCollector
} from '$lib/server/github';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import {
	getCachedWorkflowRuns,
	setCachedWorkflowRuns
} from '$lib/server/workflow-runs-cache';
import type { PageServerLoad } from './$types';

/** Debug timings: add ?debug=timings to the dashboard URL to see server-side timings in the UI and in server logs. */
export interface DebugTiming {
	label: string;
	ms: number;
	meta?: Record<string, number>;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const debugTimings = url.searchParams.get('debug') === 'timings';
	const timings: DebugTiming[] = [];
	const pushTiming: TimingCollector = (label, ms, meta) => {
		timings.push({ label, ms, meta });
		if (debugTimings) console.log(`[dashboard] ${label}: ${ms.toFixed(0)}ms`, meta ?? '');
	};

	const loadStart = typeof performance !== 'undefined' ? performance.now() : 0;

	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const supabaseStart = typeof performance !== 'undefined' ? performance.now() : 0;
	// Get GitHub connection
	const { data: connection } = await locals.supabase
		.from('github_connections')
		.select('access_token, github_username')
		.eq('user_id', user.id)
		.single();

	if (!connection) throw redirect(303, '/auth/login?error=' + encodeURIComponent('GitHub connection not found. Please sign in again.'));

	// Get the list of tracked repos for the sidebar
	const { data: repos } = await locals.supabase
		.from('repositories')
		.select('id, owner, name, full_name, is_private')
		.eq('user_id', user.id)
		.eq('is_active', true)
		.order('full_name');

	if (typeof performance !== 'undefined') {
		pushTiming('Supabase: connection + repos', performance.now() - supabaseStart, {
			repos: repos?.length ?? 0
		});
	}

	if (!repos || repos.length === 0) throw redirect(303, '/onboarding');

	// Determine which repo to show
	const ownerParam = url.searchParams.get('owner');
	const repoParam = url.searchParams.get('repo');

	let selectedRepo = repos[0];
	if (ownerParam && repoParam) {
		const found = repos.find((r) => r.owner === ownerParam && r.name === repoParam);
		if (found) selectedRepo = found;
	}

	const octokit = createOctokit(connection.access_token);

	// 30-day window start for cache key (YYYY-MM-DD)
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const windowStart = thirtyDaysAgo.toISOString().slice(0, 10);

	const cacheStart = typeof performance !== 'undefined' ? performance.now() : 0;
	const cachedRuns = await getCachedWorkflowRuns(
		locals.supabase,
		user.id,
		selectedRepo.owner,
		selectedRepo.name,
		windowStart
	);
	if (debugTimings && typeof performance !== 'undefined') {
		pushTiming('Supabase: getCachedWorkflowRuns', performance.now() - cacheStart, {
			hit: cachedRuns ? 1 : 0,
			runs: cachedRuns?.length ?? 0
		});
	}

	try {
		const dashboardStart = typeof performance !== 'undefined' ? performance.now() : 0;
		const dashboardData = await buildDashboardData(
			octokit,
			selectedRepo.owner,
			selectedRepo.name,
			{
				onTiming: debugTimings ? pushTiming : undefined,
				cachedRuns: cachedRuns ?? undefined,
				onRunsFetched: async (runs) => {
					try {
						const admin = createSupabaseAdminClient();
						const supabaseForWrite = admin ?? locals.supabase;
						console.log('[dashboard] Cache write: saving', runs.length, 'runs for', selectedRepo.owner + '/' + selectedRepo.name, 'window', windowStart, 'using', admin ? 'admin' : 'user', 'client');
						const result = await setCachedWorkflowRuns(
							supabaseForWrite,
							user.id,
							selectedRepo.owner,
							selectedRepo.name,
							windowStart,
							runs
						);
						if (result.ok) {
							console.log('[dashboard] Cache write OK');
						} else {
							console.warn('[dashboard] Cache write failed:', result.error);
						}
					} catch (e) {
						console.error('[dashboard] Cache write error:', e);
					}
				}
			}
		);
		if (typeof performance !== 'undefined') {
			pushTiming('buildDashboardData (total)', performance.now() - dashboardStart, {
				runs: dashboardData.totalRuns
			});
		}

		const out: Record<string, unknown> = {
			dashboardData,
			repos,
			selectedRepo,
			githubUsername: connection.github_username
		};
		if (debugTimings && typeof performance !== 'undefined') {
			pushTiming('load (total)', performance.now() - loadStart);
			out.debugTimings = timings;
		}

		return out;
	} catch (e: unknown) {
		if (isGitHubUnauthorizedError(e)) {
			throw redirect(303, '/auth/login?error=' + encodeURIComponent('GitHub token expired. Please sign in again to reconnect.'));
		}
		const err = e as Record<string, unknown>;
		console.error('Failed to fetch dashboard data:', {
			name: err?.name,
			message: err?.message,
			status: err?.status,
			responseStatus: (err?.response as Record<string, unknown>)?.status,
			responseMessage: ((err?.response as Record<string, unknown>)?.data as Record<string, unknown>)?.message
		});
		throw error(500, 'Failed to fetch GitHub Actions data. Please check your permissions.');
	}
};
