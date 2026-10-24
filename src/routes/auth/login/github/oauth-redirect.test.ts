import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_SUPABASE_URL } from '$app/env/public';
import { GET } from './+server';

describe('GET /auth/login/github', () => {
	it('redirects to the Supabase OAuth URL', async () => {
		const oauthUrl = `${PUBLIC_SUPABASE_URL}/auth/v1/authorize?provider=github`;
		const signInWithOAuth = vi.fn().mockResolvedValue({ data: { url: oauthUrl }, error: null });

		const response = Promise.resolve(
			GET({
				url: new URL('http://localhost:5173/auth/login/github'),
				locals: { supabase: { auth: { signInWithOAuth } } },
				cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
			} as never)
		);

		// SvelteKit 3 throws unless the external origin is explicitly allowed
		await expect(response).rejects.toMatchObject({ status: 302, location: oauthUrl });
	});
});
