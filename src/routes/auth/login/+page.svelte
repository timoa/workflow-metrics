<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data } = $props();
	let loading = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		if (data.user) goto('/dashboard');
		// Show error from query string (e.g. /auth/login?error=...)
		const err = new URL(page.url).searchParams.get('error');
		if (err) error = decodeURIComponent(err);
	});

	function signInWithGitHub() {
		loading = true;
		error = null;
		// OAuth is initiated by the server; full navigation so server handles redirect
		window.location.href = '/auth/login/github';
	}
</script>

<div class="min-h-screen bg-background flex flex-col items-center justify-center p-4">
	<div class="w-full max-w-md space-y-8">
		<!-- Logo & Brand -->
		<div class="text-center space-y-3">
			<div class="flex items-center justify-center gap-2">
				<img src="/logo.svg" alt="" class="size-10 h-10 w-10 object-contain" />
				<span class="text-2xl font-bold text-foreground">Workflow Metrics</span>
			</div>
			<p class="text-muted-foreground text-sm">
				GitHub Actions analytics and AI-powered optimization
			</p>
		</div>

		<!-- Login Card -->
		<div class="bg-card border border-border rounded-xl p-8 shadow-sm space-y-6">
			<div class="space-y-1">
				<h1 class="text-xl font-semibold text-foreground">Welcome back</h1>
				<p class="text-sm text-muted-foreground">Sign in with GitHub to access your dashboards</p>
			</div>

			{#if error}
				<div class="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg px-4 py-3 text-sm">
					{error}
				</div>
			{/if}

			<button
				onclick={signInWithGitHub}
				disabled={loading}
				class="w-full flex items-center justify-center gap-3 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-4 py-3 text-sm font-medium transition-colors"
			>
				{#if loading}
					<svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
					</svg>
					Connecting to GitHub...
				{:else}
					<svg class="size-5" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
					</svg>
					Continue with GitHub
				{/if}
			</button>

			<p class="text-xs text-center text-muted-foreground">
				We request <strong>repo</strong> and <strong>read:org</strong> permissions to access
				your workflows and organizations.
			</p>
		</div>

		<!-- Features -->
		<div class="grid grid-cols-3 gap-4 text-center">
			{#each [
				{ icon: '📊', label: 'Run analytics' },
				{ icon: '⚡', label: 'Duration trends' },
				{ icon: '🤖', label: 'AI optimization' }
			] as feature}
				<div class="space-y-1">
					<div class="text-2xl">{feature.icon}</div>
					<p class="text-xs text-muted-foreground">{feature.label}</p>
				</div>
			{/each}
		</div>
	</div>
</div>
