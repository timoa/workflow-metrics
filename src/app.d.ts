import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

declare global {
	namespace App {
		interface Locals {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			supabase: SupabaseClient<any>;
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			session: Session | null;
			user: User | null;
		}
		interface PageData {
			session: Session | null;
			user: User | null;
		}
		interface Platform {
			env: {
				PUBLIC_SUPABASE_URL: string;
				PUBLIC_SUPABASE_ANON_KEY: string;
				SUPABASE_SERVICE_ROLE_KEY: string;
			};
		}
	}
}

export {};
