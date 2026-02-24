import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

const STATE_COOKIE = 'github_write_state';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const clientId = env.GITHUB_WRITE_CLIENT_ID;
	if (!clientId) throw error(500, 'GitHub write OAuth app is not configured. Add GITHUB_WRITE_CLIENT_ID to your environment.');

	// Generate a random state value to prevent CSRF
	const stateBytes = crypto.getRandomValues(new Uint8Array(16));
	const state = Array.from(stateBytes, (b) => b.toString(16).padStart(2, '0')).join('');

	cookies.set(STATE_COOKIE, state, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 600 // 10 minutes
	});

	const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
	const baseUrl = isLocalhost
		? url.origin
		: (publicEnv.PUBLIC_APP_URL?.replace(/\/$/, '') ?? url.origin);

	const callbackUrl = `${baseUrl}/auth/github-write/callback`;

	const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
	githubAuthUrl.searchParams.set('client_id', clientId);
	githubAuthUrl.searchParams.set('redirect_uri', callbackUrl);
	githubAuthUrl.searchParams.set('scope', 'repo read:org');
	githubAuthUrl.searchParams.set('state', state);

	throw redirect(302, githubAuthUrl.toString());
};
