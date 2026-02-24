import type { GitHubWorkflowRun } from '$lib/types/github';
import type { SupabaseClient } from '@supabase/supabase-js';

/** How long a cache entry is considered fresh (we refetch from GitHub after this). */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Max age of cache rows before automatic deletion (data retention). */
const CACHE_RETENTION_MS = 60 * 60 * 1000; // 1 hour

export interface WorkflowRunsCacheRow {
	runs: unknown;
	fetched_at: string;
}

/** Deletes cache rows older than CACHE_RETENTION_MS. Call periodically (e.g. on cache read). */
export async function deleteExpiredWorkflowRunsCache(
	supabase: SupabaseClient
): Promise<void> {
	const cutoff = new Date(Date.now() - CACHE_RETENTION_MS).toISOString();
	await supabase.from('workflow_runs_cache').delete().lt('fetched_at', cutoff);
}

export async function deleteExpiredWorkflowDetailRunsCache(
	supabase: SupabaseClient
): Promise<void> {
	const cutoff = new Date(Date.now() - CACHE_RETENTION_MS).toISOString();
	await supabase.from('workflow_detail_runs_cache').delete().lt('fetched_at', cutoff);
}

/** Returns cached runs if present and not stale; otherwise null. */
export async function getCachedWorkflowRuns(
	supabase: SupabaseClient,
	userId: string,
	owner: string,
	repo: string,
	windowStart: string
): Promise<GitHubWorkflowRun[] | null> {
	// Fire-and-forget cleanup of expired rows (limited retention)
	deleteExpiredWorkflowRunsCache(supabase).catch((err) =>
		console.warn('Workflow runs cache cleanup failed:', err)
	);

	const { data, error } = await supabase
		.from('workflow_runs_cache')
		.select('runs, fetched_at')
		.eq('user_id', userId)
		.eq('owner', owner)
		.eq('name', repo)
		.eq('window_start', windowStart)
		.maybeSingle();

	if (error) {
		console.warn('[workflow-runs-cache] getCachedWorkflowRuns error:', error.message, {
			code: error.code,
			hint: error.details
		});
		return null;
	}
	if (!data) return null;

	const row = data as WorkflowRunsCacheRow;
	const fetchedAt = new Date(row.fetched_at).getTime();
	if (Date.now() - fetchedAt > CACHE_TTL_MS) return null;

	const runs = Array.isArray(row.runs) ? (row.runs as GitHubWorkflowRun[]) : null;
	return runs;
}

/** Stores workflow runs in the cache for the given repo and 30-day window. */
export async function setCachedWorkflowRuns(
	supabase: SupabaseClient,
	userId: string,
	owner: string,
	repo: string,
	windowStart: string,
	runs: GitHubWorkflowRun[]
): Promise<{ ok: boolean; error?: string }> {
	const row = {
		user_id: userId,
		owner,
		name: repo,
		window_start: windowStart,
		runs: runs as unknown as Record<string, unknown>[],
		fetched_at: new Date().toISOString()
	};
	const { data, error } = await supabase
		.from('workflow_runs_cache')
		.upsert(row, {
			onConflict: 'user_id,owner,name,window_start',
			ignoreDuplicates: false
		})
		.select('id')
		.limit(1);

	if (error) {
		console.warn('[workflow-runs-cache] setCachedWorkflowRuns failed:', error.message, {
			code: error.code,
			details: error.details,
			owner,
			name: repo,
			window_start: windowStart
		});
		return { ok: false, error: error.message };
	}
	return { ok: true };
}

// --- Workflow detail page cache (runs for a single workflow) ---

/** Returns cached runs for a single workflow if present and not stale; otherwise null. */
export async function getCachedWorkflowDetailRuns(
	supabase: SupabaseClient,
	userId: string,
	owner: string,
	repo: string,
	workflowId: number,
	windowStart: string
): Promise<GitHubWorkflowRun[] | null> {
	deleteExpiredWorkflowDetailRunsCache(supabase).catch((err) =>
		console.warn('Workflow detail runs cache cleanup failed:', err)
	);

	const { data, error } = await supabase
		.from('workflow_detail_runs_cache')
		.select('runs, fetched_at')
		.eq('user_id', userId)
		.eq('owner', owner)
		.eq('name', repo)
		.eq('workflow_id', workflowId)
		.eq('window_start', windowStart)
		.maybeSingle();

	if (error) {
		console.warn('[workflow-detail-cache] getCachedWorkflowDetailRuns error:', error.message, {
			code: error.code,
			workflow_id: workflowId
		});
		return null;
	}
	if (!data) return null;

	const row = data as WorkflowRunsCacheRow;
	const fetchedAt = new Date(row.fetched_at).getTime();
	if (Date.now() - fetchedAt > CACHE_TTL_MS) return null;

	const runs = Array.isArray(row.runs) ? (row.runs as GitHubWorkflowRun[]) : null;
	return runs;
}

/** Stores workflow detail runs (single workflow) in the cache. */
export async function setCachedWorkflowDetailRuns(
	supabase: SupabaseClient,
	userId: string,
	owner: string,
	repo: string,
	workflowId: number,
	windowStart: string,
	runs: GitHubWorkflowRun[]
): Promise<{ ok: boolean; error?: string }> {
	const row = {
		user_id: userId,
		owner,
		name: repo,
		workflow_id: workflowId,
		window_start: windowStart,
		runs: runs as unknown as Record<string, unknown>[],
		fetched_at: new Date().toISOString()
	};
	const { error } = await supabase
		.from('workflow_detail_runs_cache')
		.upsert(row, {
			onConflict: 'user_id,owner,name,workflow_id,window_start',
			ignoreDuplicates: false
		})
		.select('id')
		.limit(1);

	if (error) {
		console.warn('[workflow-detail-cache] setCachedWorkflowDetailRuns failed:', error.message, {
			code: error.code,
			workflow_id: workflowId
		});
		return { ok: false, error: error.message };
	}
	return { ok: true };
}
