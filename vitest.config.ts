import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'node',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html', 'lcov'],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 70,
				statements: 80
			},
			include: [
				'src/lib/utils.ts',
				'src/lib/server/*.ts'
			],
			exclude: [
				'**/*.d.ts',
				'**/*.config.*',
				'**/node_modules/**',
				'**/.svelte-kit/**',
				'**/supabase/**',
				'**/scripts/**',
				'**/*.test.ts',
				'src/lib/types/**',
				'src/lib/server/*.test.ts',
				'src/lib/server/github-app.ts',
				'src/lib/server/supabase.ts'
			]
		}
	},
	resolve: {
		alias: {
			$lib: '/src/lib',
			$server: '/src/lib/server'
		}
	}
});
