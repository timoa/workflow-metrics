import type { GitHubWorkflowRun } from '$lib/types/github';
import type { SupabaseClient } from '@supabase/supabase-js';

/** How long a cache entry is considered fresh (we serve immediately, no refetch needed). */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * How long a stale cache entry is still usable for stale-while-revalidate.
 * Data older than CACHE_TTL_MS but within STALE_TTL_MS is served instantly with
 * a background refresh triggered in parallel.
 */
const STALE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Max age of cache rows before automatic deletion (data retention). */
const CACHE_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface WorkflowRunsCacheRow {
	runs: unknown;
	fetched_at: string;
}

export interface CachedRunsResult {
	runs: GitHubWorkflowRun[];
	/** True when data is older than CACHE_TTL_MS but within STALE_TTL_MS. */
	isStale: boolean;
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

/**
 * Returns cached runs if present and not too old.
 *
 * - Fresh (< CACHE_TTL_MS): returns { runs, isStale: false }
 * - Stale (CACHE_TTL_MS–STALE_TTL_MS): returns { runs, isStale: true } — serve immediately, refresh in background
 * - Too old (> STALE_TTL_MS) or missing: returns null — full refetch required
 */
export async function getCachedWorkflowRuns(
	supabase: SupabaseClient,
	userId: string,
	owner: string,
	repo: string,
	windowStart: string
): Promise<CachedRunsResult | null> {
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
	const ageMs = Date.now() - fetchedAt;

	// Too old — caller must do a full refetch
	if (ageMs > STALE_TTL_MS) return null;

	const runs = Array.isArray(row.runs) ? (row.runs as GitHubWorkflowRun[]) : null;
	if (!runs) return null;

	return { runs, isStale: ageMs > CACHE_TTL_MS };
}

/** Stores workflow runs in the cache for the given repo and window. */
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
	// suppress unused variable warning
	void data;
	return { ok: true };
}

// --- Workflow detail page cache (runs for a single workflow) ---

/**
 * Returns cached runs for a single workflow if present and not too old.
 *
 * Same stale-while-revalidate semantics as getCachedWorkflowRuns.
 */
export async function getCachedWorkflowDetailRuns(
	supabase: SupabaseClient,
	userId: string,
	owner: string,
	repo: string,
	workflowId: number,
	windowStart: string
): Promise<CachedRunsResult | null> {
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
	const ageMs = Date.now() - fetchedAt;

	if (ageMs > STALE_TTL_MS) return null;

	const runs = Array.isArray(row.runs) ? (row.runs as GitHubWorkflowRun[]) : null;
	if (!runs) return null;

	return { runs, isStale: ageMs > CACHE_TTL_MS };
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
