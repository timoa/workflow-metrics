import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const [connectionsResult, settingsResult, reposResult] = await Promise.all([
		locals.supabase
			.from('github_connections')
			.select('id, github_username, avatar_url, scopes, created_at')
			.eq('user_id', user.id),
		locals.supabase
			.from('user_settings')
			.select('mistral_api_key, theme, default_repo_id')
			.eq('user_id', user.id)
			.single(),
		locals.supabase
			.from('repositories')
			.select('id, full_name, owner, name, is_private, is_active')
			.eq('user_id', user.id)
			.order('full_name')
	]);

	return {
		connections: connectionsResult.data ?? [],
		settings: settingsResult.data,
		repos: reposResult.data ?? []
	};
};

export const actions: Actions = {
	updateSettings: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const mistralApiKey = formData.get('mistral_api_key') as string | null;
		const theme = formData.get('theme') as 'dark' | 'light' | 'system';
		const defaultRepoId = formData.get('default_repo_id') as string | null;

		const { error } = await locals.supabase.from('user_settings').upsert(
			{
				user_id: user.id,
				mistral_api_key: mistralApiKey || null,
				theme: theme || 'dark',
				default_repo_id: defaultRepoId || null,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id' }
		);

		if (error) return fail(500, { error: error.message });

		return { success: true };
	},

	removeRepo: async ({ request, locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const repoId = formData.get('repo_id') as string;

		const { error } = await locals.supabase
			.from('repositories')
			.update({ is_active: false })
			.eq('id', repoId)
			.eq('user_id', user.id);

		if (error) return fail(500, { error: error.message });

		return { success: true };
	},

	addRepo: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		// Redirect to onboarding to add more repos (user or org)
		throw redirect(303, '/onboarding?from=settings');
	},

	addOrg: async ({ locals }) => {
		const { user } = await locals.safeGetSession();
		if (!user) return fail(401, { error: 'Unauthorized' });

		// Redirect to onboarding to add repos from an organization
		throw redirect(303, '/onboarding?add=org&from=settings');
	}
};
