import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$app/env/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$app/env/private';
import type { RequestEvent } from '@sveltejs/kit';

/** Admin client (bypasses RLS). Use only for server-side cache writes. Returns null if SUPABASE_SERVICE_ROLE_KEY is not set. */
export function createSupabaseAdminClient(): ReturnType<typeof createClient> | null {
	const key = SUPABASE_SERVICE_ROLE_KEY;
	if (!key) return null;
	return createClient(PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false } });
}

export function createSupabaseServerClient(event: RequestEvent) {
	return createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll() {
				return event.cookies.getAll();
			},
			setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof event.cookies.set>[2] }>) {
				cookiesToSet.forEach(({ name, value, options }) =>
					event.cookies.set(name, value, { ...options, path: '/' })
				);
			}
		}
	});
}
