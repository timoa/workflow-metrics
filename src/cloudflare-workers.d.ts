/**
 * Minimal declarations for the Cloudflare Workers runtime module.
 *
 * SvelteKit 3 removed `event.platform`, so `waitUntil` now has to come from
 * `cloudflare:workers` (the adapter resolves it to the real runtime module in
 * production and to a no-op stub in `vite dev`).
 *
 * @see https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil
 */
declare module 'cloudflare:workers' {
	/** Keeps the Worker alive until the given promise settles. */
	export function waitUntil(promise: Promise<unknown>): void;
}
