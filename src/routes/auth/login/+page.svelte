<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data } = $props();
	let loading = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		if (data.user) {
			goto('/dashboard');
			return;
		}
		const params = new URLSearchParams(window.location.search);
		const err = params.get('error_description') ?? params.get('error');
		if (err) error = decodeURIComponent(err);
	});

	function signInWithGitHub() {
		loading = true;
		error = null;
		window.location.href = '/auth/login/github';
	}
</script>

<div class="login-bg min-h-screen flex flex-col items-center justify-center p-4">
	<div class="w-full max-w-md space-y-8">
		<!-- Logo & Brand -->
		<div class="text-center space-y-3">
			<div class="flex items-center justify-center gap-2">
				<img src="/logo.svg" alt="" class="size-10 h-10 w-10 object-contain" />
				<span class="text-2xl font-bold text-white">Workflow Metrics</span>
			</div>
			<p class="text-sm" style="color: #9dafd0;">
				GitHub Actions analytics and AI-powered optimization
			</p>
		</div>

		<!-- Login Card -->
		<div class="login-card rounded-xl p-8 space-y-6">
			<div class="space-y-1">
				<h1 class="text-xl font-semibold text-white">Welcome back</h1>
				<p class="text-sm" style="color: #9dafd0;">Sign in with GitHub to access your dashboards</p>
			</div>

			{#if error}
				<div class="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg px-4 py-3 text-sm">
					{error}
				</div>
			{/if}

			<button
				onclick={signInWithGitHub}
				disabled={loading}
				class="w-full flex items-center justify-center gap-3 bg-white text-gray-900 hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-4 py-3 text-sm font-medium transition-colors"
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

			<p class="text-xs text-center" style="color: #9dafd0;">
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
			] as feature (feature.label)}
				<div class="space-y-1">
					<div class="text-2xl">{feature.icon}</div>
					<p class="text-xs" style="color: #9dafd0;">{feature.label}</p>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.login-bg {
		background:
			radial-gradient(ellipse 80% 50% at 50% 0%, rgba(50, 80, 255, 0.1), transparent),
			radial-gradient(ellipse 70% 45% at 50% 100%, rgba(255, 120, 30, 0.12), transparent),
			#080812;
	}

	.login-card {
		background: #101a34;
		box-shadow:
			0 0 0 1px rgba(126, 156, 255, 0.5),
			0 24px 68px rgba(5, 9, 20, 0.78),
			0 0 54px rgba(60, 215, 255, 0.22);
	}
</style>
