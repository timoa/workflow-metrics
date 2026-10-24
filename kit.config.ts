import adapter from '@sveltejs/adapter-cloudflare';
import type { Config } from '@sveltejs/kit/vite';

/**
 * SvelteKit 3 no longer reads `svelte.config.js`; the options live on the
 * `sveltekit()` Vite plugin instead. Both `vite.config.ts` and
 * `vitest.config.ts` import this object so the two stay in sync.
 */
export const kitConfig: Config = {
	adapter: adapter({
		platformProxy: {
			persist: { path: '.wrangler/state/v3' }
		}
	}),
	alias: {
		// `$lib` was removed in SvelteKit 3; re-adding it here keeps the
		// existing imports working until they move to subpath imports.
		$lib: './src/lib',
		$types: './src/lib/types'
	}
};
