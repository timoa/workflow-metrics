<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	onMount(() => {
		if (page.data.user) {
			goto('/dashboard');
		} else {
			goto('/auth/login');
		}
	});
</script>
