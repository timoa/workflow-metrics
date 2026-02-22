export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
	public: {
		Tables: {
			github_connections: {
				Row: {
					id: string;
					user_id: string;
					github_user_id: number;
					github_username: string;
					avatar_url: string | null;
					access_token: string;
					scopes: string[] | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					github_user_id: number;
					github_username: string;
					avatar_url?: string | null;
					access_token: string;
					scopes?: string[] | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					github_user_id?: number;
					github_username?: string;
					avatar_url?: string | null;
					access_token?: string;
					scopes?: string[] | null;
					updated_at?: string;
				};
			};
			repositories: {
				Row: {
					id: string;
					user_id: string;
					connection_id: string;
					github_repo_id: number;
					owner: string;
					name: string;
					full_name: string;
					is_private: boolean;
					is_active: boolean;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					connection_id: string;
					github_repo_id: number;
					owner: string;
					name: string;
					full_name: string;
					is_private?: boolean;
					is_active?: boolean;
					created_at?: string;
				};
				Update: {
					id?: string;
					is_active?: boolean;
				};
			};
			user_settings: {
				Row: {
					id: string;
					user_id: string;
					mistral_api_key: string | null;
					theme: 'dark' | 'light' | 'system';
					default_repo_id: string | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					mistral_api_key?: string | null;
					theme?: 'dark' | 'light' | 'system';
					default_repo_id?: string | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					mistral_api_key?: string | null;
					theme?: 'dark' | 'light' | 'system';
					default_repo_id?: string | null;
					updated_at?: string;
				};
			};
		};
		Views: Record<string, never>;
		Functions: Record<string, never>;
		Enums: Record<string, never>;
	};
}
