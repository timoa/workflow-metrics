import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

/**
 * Redirect the user to GitHub to install (or update) the Workflow Metrics
 * GitHub App on their selected repositories.
 *
 * NOTE: GitHub App installations use the "Setup URL" configured in the GitHub
 * App settings (not a redirect_uri query parameter — that only applies to the
 * OAuth authorization flow). After installation GitHub redirects to the Setup
 * URL with ?installation_id=<id>&setup_action=install.
 *
 * Configure your GitHub App's Setup URL to:
 *   https://<your-domain>/auth/github-app/callback
 *
 * Because the install page opens in a new tab, users can also click the
 * "Sync installations" button on the Settings page to import their installation
 * without relying on the callback at all.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const appSlug = env.GITHUB_APP_SLUG;
	if (!appSlug) {
		throw error(
			500,
			'GitHub App is not configured. Add GITHUB_APP_SLUG to your environment.'
		);
	}

	throw redirect(302, `https://github.com/apps/${appSlug}/installations/new`);
};
