<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	onMount(() => {
		if (page.data.user) {
			goto('/dashboard');
		} else {
			// Forward any Supabase error params (e.g. bad_oauth_callback) to the login page
			const params = new URLSearchParams(window.location.search);
			const error = params.get('error_description') ?? params.get('error');
			if (error) {
				goto('/auth/login?error=' + encodeURIComponent(error));
			} else {
				goto('/auth/login');
			}
		}
	});
</script>
