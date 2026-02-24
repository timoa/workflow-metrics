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
		const msg = authError?.message ?? 'auth_failed';
		throw redirect(303, `/auth/login?error=${encodeURIComponent(msg)}`);
	}

	// Store the GitHub access token in our github_connections table.
	// With PKCE flow, session.provider_token may be null — fall back to user metadata.
	const providerToken = session.provider_token;
	const githubIdentity = user.identities?.find((i) => i.provider === 'github');
	const githubMeta = user.user_metadata;
	const githubUserId = githubIdentity?.identity_data?.sub ?? githubMeta?.provider_id;
	const githubUsername = githubMeta?.user_name ?? githubMeta?.preferred_username;
	const avatarUrl = githubMeta?.avatar_url;

	if (providerToken && githubUserId && githubUsername) {
		try {
			const { error: upsertError } = await locals.supabase.from('github_connections').upsert(
				{
					user_id: user.id,
					github_user_id: Number(githubUserId),
					github_username: githubUsername,
					avatar_url: avatarUrl ?? null,
					access_token: providerToken,
					updated_at: new Date().toISOString()
				},
				{ onConflict: 'user_id,github_user_id' }
			);
			if (upsertError) {
				console.error('Failed to upsert GitHub connection:', upsertError);
			}
		} catch (e) {
			console.error('Failed to store GitHub connection:', e);
		}
	} else if (!providerToken) {
		// PKCE flow didn't return a provider token — check if a connection already exists
		const { data: existing } = await locals.supabase
			.from('github_connections')
			.select('id')
			.eq('user_id', user.id)
			.limit(1)
			.single();

		if (!existing) {
			throw redirect(
				303,
				'/auth/login?error=' +
					encodeURIComponent(
						'GitHub token was not returned. Please try signing in again. If the issue persists, revoke the app in GitHub Settings > Applications and retry.'
					)
			);
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
