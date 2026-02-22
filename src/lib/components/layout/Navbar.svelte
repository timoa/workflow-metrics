<script lang="ts">
	import { page } from '$app/state';
	import ThemeToggle from './ThemeToggle.svelte';

	const isWorkflowDetail = $derived(page.url.pathname.startsWith('/dashboard/workflow'));
	const owner = $derived(page.url.searchParams.get('owner'));
	const repo = $derived(page.url.searchParams.get('repo'));
	const repoLabel = $derived(owner && repo ? `${owner}/${repo}` : null);
	const dashboardHref = $derived(repoLabel ? `/dashboard?owner=${owner}&repo=${repo}` : '/dashboard');
</script>

<header class="h-14 border-b border-border bg-card flex items-center gap-4 px-6 flex-shrink-0">
	<!-- Breadcrumb / page title -->
	<div class="flex-1">
		{#if isWorkflowDetail}
			<nav class="flex items-center gap-1 text-sm">
				<a href={dashboardHref} class="text-muted-foreground hover:text-foreground transition-colors">
					Dashboard
				</a>
				{#if repoLabel}
					<svg class="size-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="9 18 15 12 9 6"/>
					</svg>
					<a href={dashboardHref} class="text-muted-foreground hover:text-foreground transition-colors">
						{repoLabel}
					</a>
				{/if}
				<svg class="size-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 18 15 12 9 6"/>
				</svg>
				<span class="text-foreground font-medium">Workflow Detail</span>
			</nav>
		{:else if page.url.pathname === '/dashboard'}
			<span class="text-sm font-medium text-foreground">Repository Overview</span>
		{:else if page.url.pathname === '/settings'}
			<span class="text-sm font-medium text-foreground">Settings</span>
		{/if}
	</div>

	<!-- Right controls -->
	<div class="flex items-center gap-2">
		<ThemeToggle />
	</div>
</header>
