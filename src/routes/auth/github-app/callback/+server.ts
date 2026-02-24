import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { fetchInstallationDetails } from '$lib/server/github-app';
import type { RequestHandler } from './$types';

/**
 * GitHub App installation callback.
 *
 * GitHub redirects here after the user installs (or updates) the app.
 * Query parameters from GitHub:
 *   installation_id  – numeric ID of the installation
 *   setup_action     – "install" | "update" | "delete"
 *
 * We look up the account details via the GitHub App API, then upsert a row
 * in github_app_installations and redirect to Settings with a success toast.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const setupAction = url.searchParams.get('setup_action');
	const installationIdStr = url.searchParams.get('installation_id');

	// If the user cancelled or GitHub sent an error, go back to settings quietly.
	if (!installationIdStr || setupAction === 'delete') {
		throw redirect(303, '/settings');
	}

	const installationId = parseInt(installationIdStr, 10);
	if (isNaN(installationId)) {
		throw redirect(303, '/settings?appError=invalid_installation_id');
	}

	const appId = env.GITHUB_APP_ID;
	const privateKey = env.GITHUB_APP_PRIVATE_KEY;

	if (!appId || !privateKey) {
		throw error(500, 'GitHub App credentials are not configured (GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY).');
	}

	// Fetch account details from GitHub using the App JWT.
	let accountLogin: string;
	let accountType: string;
	try {
		({ accountLogin, accountType } = await fetchInstallationDetails(appId, privateKey, installationId));
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw redirect(303, `/settings?appError=${encodeURIComponent(msg)}`);
	}

	// Upsert the installation record for this user.
	const { error: dbError } = await locals.supabase
		.from('github_app_installations')
		.upsert(
			{
				user_id: user.id,
				installation_id: installationId,
				account_login: accountLogin,
				account_type: accountType,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,installation_id' }
		);

	if (dbError) {
		throw redirect(303, `/settings?appError=${encodeURIComponent(dbError.message)}`);
	}

	throw redirect(303, '/settings?appSuccess=1');
};
