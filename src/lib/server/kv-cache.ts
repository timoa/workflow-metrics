/**
 * Cloudflare KV cache for computed DashboardData.
 *
 * KV reads are ~1ms at the edge vs ~10–50ms for Supabase PostgreSQL, so this
 * is the fastest possible cache layer. It stores the final computed JSON (not
 * raw GitHub runs), keyed per user/repo/days/window.
 *
 * HOW TO ENABLE:
 * 1. Create a KV namespace in the Cloudflare dashboard.
 * 2. Uncomment the [[kv_namespaces]] section in wrangler.toml and set the id.
 * 3. In src/routes/api/dashboard/data/+server.ts:
 *    - Import getKvDashboardData / setKvDashboardData
 *    - Check KV before getCachedWorkflowRuns (Supabase)
 *    - Write to KV after setCachedWorkflowRuns
 *
 * KEY FORMAT:
 *   dashboard:{userId}:{owner}/{repo}:{days}:{windowStart}
 *
 * KV TTL matches CACHE_TTL_MS (1 hour). Cloudflare handles expiry natively.
 */

import type { DashboardData } from '$lib/types/metrics';

type KVNamespace = {
	get(key: string, type: 'text'): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

/** How long the computed DashboardData is cached in KV. */
const KV_TTL_SECONDS = 60 * 60; // 1 hour

function makeKey(userId: string, owner: string, repo: string, days: number, windowStart: string): string {
	return `dashboard:${userId}:${owner}/${repo}:${days}:${windowStart}`;
}

/**
 * Returns the cached DashboardData from KV, or null if not found / expired.
 * Pass the KV binding from `platform.env.CACHE`.
 */
export async function getKvDashboardData(
	kv: KVNamespace,
	userId: string,
	owner: string,
	repo: string,
	days: number,
	windowStart: string
): Promise<DashboardData | null> {
	try {
		const raw = await kv.get(makeKey(userId, owner, repo, days, windowStart), 'text');
		if (!raw) return null;
		return JSON.parse(raw) as DashboardData;
	} catch (e) {
		console.warn('[kv-cache] getKvDashboardData error:', e);
		return null;
	}
}

/**
 * Stores computed DashboardData in KV with a 1-hour TTL.
 * Pass the KV binding from `platform.env.CACHE`.
 */
export async function setKvDashboardData(
	kv: KVNamespace,
	userId: string,
	owner: string,
	repo: string,
	days: number,
	windowStart: string,
	data: DashboardData
): Promise<void> {
	try {
		await kv.put(
			makeKey(userId, owner, repo, days, windowStart),
			JSON.stringify(data),
			{ expirationTtl: KV_TTL_SECONDS }
		);
	} catch (e) {
		console.warn('[kv-cache] setKvDashboardData error:', e);
	}
}
