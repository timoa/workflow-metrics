import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { session, user } = await locals.safeGetSession();
	let githubUser: { username: string; avatarUrl: string | null } | null = null;
	if (user) {
		const { data: conn } = await locals.supabase
			.from('github_connections')
			.select('github_username, avatar_url')
			.eq('user_id', user.id)
			.limit(1)
			.single();
		if (conn) {
			githubUser = { username: conn.github_username, avatarUrl: conn.avatar_url ?? null };
		}
	}
	return { session, user, githubUser };
};
