import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Allow only same-origin paths (no protocol-relative or external URLs). */
function safeNext(next: string | null): string | null {
	if (!next || typeof next !== 'string') return null;
	const trimmed = next.trim();
	if (trimmed === '' || !trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
	return trimmed;
}

const AUTH_NEXT_COOKIE = 'auth_next';

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const code = url.searchParams.get('code');
	const errorDesc = url.searchParams.get('error_description') ?? url.searchParams.get('error');

	if (!code) {
		// GitHub may send error params; forward them. No code usually means wrong app type
		// (GitHub App instead of OAuth App) or wrong callback URL in the OAuth App.
		const message =
			errorDesc != null
				? decodeURIComponent(String(errorDesc))
				: 'missing_code';
		throw redirect(303, `/auth/login?error=${encodeURIComponent(message)}`);
	}

	const {
		data: { session, user },
		error: authError
	} = await locals.supabase.auth.exchangeCodeForSession(code);

	if (authError || !session || !user) {
		console.error('Auth callback error:', authError);
		throw redirect(303, '/auth/login?error=auth_failed');
	}

	// Store the GitHub access token in our github_connections table
	const providerToken = session.provider_token;
	if (providerToken) {
		// Get GitHub user info from the token
		try {
			const githubResponse = await fetch('https://api.github.com/user', {
				headers: {
					Authorization: `Bearer ${providerToken}`,
					Accept: 'application/vnd.github.v3+json'
				}
			});

			if (githubResponse.ok) {
				const githubUser = await githubResponse.json();

				// Upsert github connection
				await locals.supabase.from('github_connections').upsert(
					{
						user_id: user.id,
						github_user_id: githubUser.id,
						github_username: githubUser.login,
						avatar_url: githubUser.avatar_url,
						access_token: providerToken,
						updated_at: new Date().toISOString()
					},
					{ onConflict: 'user_id,github_user_id' }
				);
			}
		} catch (e) {
			console.error('Failed to store GitHub connection:', e);
		}
	}

	// Redirect to requested path (e.g. after "Update GitHub permissions") and clear cookie
	const nextPath = safeNext(cookies.get(AUTH_NEXT_COOKIE));
	if (nextPath) {
		cookies.delete(AUTH_NEXT_COOKIE, { path: '/' });
		throw redirect(303, nextPath);
	}

	// Check if user has any repositories configured
	const { data: repos } = await locals.supabase
		.from('repositories')
		.select('id')
		.eq('user_id', user.id)
		.limit(1);

	// First time user - redirect to onboarding
	if (!repos || repos.length === 0) {
		throw redirect(303, '/onboarding');
	}

	throw redirect(303, '/dashboard');
};
