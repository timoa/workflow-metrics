import { sveltekit } from '@sveltejs/kit/vite';
import { kitConfig } from './kit.config.ts';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(kitConfig)],
	build: {
		target: 'es2022'
	}
});
