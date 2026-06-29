import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Liveness / readiness probe.
 *
 * Intentionally has no dependencies:
 *   - no DB call (Postgres might be slow to come up after the app)
 *   - no auth (Kubernetes probes don't carry cookies)
 *   - no `platform.env` reads (the Node adapter doesn't expose those)
 *
 * If the Node process can serve this response it is alive and the HTTP
 * listener is healthy. Use a separate readiness check (e.g. hitting
 * `/api/dashboard/data` for a logged-in probe target) when you need to
 * gate on downstream dependencies.
 */
export const GET: RequestHandler = async () => {
	return json({ ok: true });
};