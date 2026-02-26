<script lang="ts">
	import '../app.css';
	import { page, navigating } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import Navbar from '$lib/components/layout/Navbar.svelte';

	let { children, data } = $props();
	let mainEl: HTMLElement | null = $state(null);

	afterNavigate(() => {
		mainEl?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
	});

	// Pages that should not show the app shell
	const isAuthPage = $derived(
		page.url.pathname.startsWith('/auth') || page.url.pathname === '/onboarding'
	);

	// In $app/state, navigating is always an object; when idle, navigating.to is null
	const showLoading = $derived(
		!isAuthPage && !!data.user && navigating?.to != null
	);
</script>

{#if isAuthPage || !data.user}
	{@render children()}
{:else}
	<div class="flex h-screen overflow-hidden bg-background">
		<Sidebar user={data.user!} githubUser={data.githubUser ?? null} />
		<div class="flex-1 flex flex-col overflow-hidden relative">
			{#if showLoading}
				<div
					class="absolute top-0 left-0 right-0 z-50 h-1 bg-primary/20 overflow-hidden"
					aria-label="Loading"
					role="progressbar"
					aria-valuetext="Loading..."
				>
					<div
						class="loading-bar-thumb h-full w-1/3 min-w-[120px] bg-primary"
					></div>
				</div>
			{/if}
			<Navbar />
			<main bind:this={mainEl} class="flex-1 overflow-y-auto p-6">
				{@render children()}
			</main>
		</div>
	</div>
{/if}
