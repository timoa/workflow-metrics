import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
	const { session, user } = await parent();
	return { session, user };
};
