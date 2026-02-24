import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

const STATE_COOKIE = 'github_write_state';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const errorParam = url.searchParams.get('error');

	if (errorParam) {
		const desc = url.searchParams.get('error_description') ?? errorParam;
		throw redirect(303, `/settings?writeError=${encodeURIComponent(desc)}`);
	}

	if (!code) throw redirect(303, '/settings?writeError=missing_code');

	// Validate CSRF state
	const savedState = cookies.get(STATE_COOKIE);
	cookies.delete(STATE_COOKIE, { path: '/' });
	if (!savedState || savedState !== state) {
		throw redirect(303, '/settings?writeError=invalid_state');
	}

	const clientId = env.GITHUB_WRITE_CLIENT_ID;
	const clientSecret = env.GITHUB_WRITE_CLIENT_SECRET;
	if (!clientId || !clientSecret) throw error(500, 'GitHub write OAuth app is not configured.');

	const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
	const baseUrl = isLocalhost
		? url.origin
		: (publicEnv.PUBLIC_APP_URL?.replace(/\/$/, '') ?? url.origin);
	const callbackUrl = `${baseUrl}/auth/github-write/callback`;

	// Exchange the code for an access token directly with GitHub
	const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: callbackUrl
		})
	});

	if (!tokenResponse.ok) {
		throw redirect(303, `/settings?writeError=${encodeURIComponent('Failed to exchange code with GitHub')}`);
	}

	const tokenData = await tokenResponse.json() as {
		access_token?: string;
		scope?: string;
		token_type?: string;
		error?: string;
		error_description?: string;
	};

	if (tokenData.error || !tokenData.access_token) {
		const msg = tokenData.error_description ?? tokenData.error ?? 'No token returned';
		throw redirect(303, `/settings?writeError=${encodeURIComponent(msg)}`);
	}

	// Verify the token has repo scope
	const grantedScopes = (tokenData.scope ?? '').split(',').map((s) => s.trim());
	if (!grantedScopes.includes('repo')) {
		throw redirect(
			303,
			`/settings?writeError=${encodeURIComponent(`Token is missing "repo" scope. Granted: ${grantedScopes.join(', ') || 'none'}`)}`
		);
	}

	// Store the token in user_settings
	const { error: dbError } = await locals.supabase
		.from('user_settings')
		.upsert(
			{ user_id: user.id, github_write_token: tokenData.access_token, updated_at: new Date().toISOString() },
			{ onConflict: 'user_id' }
		);

	if (dbError) {
		throw redirect(303, `/settings?writeError=${encodeURIComponent(dbError.message)}`);
	}

	throw redirect(303, '/settings?writeSuccess=1');
};
