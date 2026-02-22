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
const AUTH_NEXT_MAX_AGE = 600; // 10 minutes

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const nextParam = safeNext(url.searchParams.get('next'));
	const redirectTo = `${url.origin}/auth/callback`;

	if (nextParam) {
		cookies.set(AUTH_NEXT_COOKIE, nextParam, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: AUTH_NEXT_MAX_AGE
		});
	}

	const { data, error } = await locals.supabase.auth.signInWithOAuth({
		provider: 'github',
		options: {
			scopes: 'repo read:org',
			redirectTo
		}
	});

	if (error) {
		throw redirect(303, `/auth/login?error=${encodeURIComponent(error.message)}`);
	}

	if (data?.url) {
		throw redirect(302, data.url);
	}

	throw redirect(303, '/auth/login?error=oauth_failed');
};
