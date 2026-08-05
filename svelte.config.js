import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			out: 'build',
			precompress: false
		}),
		alias: {
			$components: './src/lib/components',
			$server: './src/lib/server',
			$types: './src/lib/types'
		}
	}
};

export default config;