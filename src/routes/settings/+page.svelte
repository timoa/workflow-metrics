<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showMistralKey = $state(false);
	let savingSettings = $state(false);
</script>

<svelte:head>
	<title>Settings · Workflow Metrics</title>
</svelte:head>

<div class="max-w-2xl space-y-8">
	<div>
		<h1 class="text-xl font-semibold text-foreground">Settings</h1>
		<p class="text-sm text-muted-foreground mt-1">Manage your account, integrations, and preferences</p>
	</div>

	<!-- GitHub Connections -->
	<section class="bg-card border border-border rounded-xl overflow-hidden">
		<div class="p-5 border-b border-border">
			<h2 class="text-sm font-semibold text-foreground">GitHub Account</h2>
			<p class="text-xs text-muted-foreground mt-0.5">Connected GitHub accounts</p>
		</div>
		<div class="divide-y divide-border">
			{#each data.connections as conn}
				<div class="flex items-center gap-4 px-5 py-4">
					<div class="size-9 rounded-full bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
						{#if conn.avatar_url}
							<img src={conn.avatar_url} alt={conn.github_username} class="size-full" />
						{:else}
							<svg class="size-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
							</svg>
						{/if}
					</div>
					<div class="flex-1">
						<p class="text-sm font-medium text-foreground">{conn.github_username}</p>
						<p class="text-xs text-muted-foreground">
							Connected {new Date(conn.created_at).toLocaleDateString()}
						</p>
					</div>
					<span class="text-xs bg-success/10 text-success border border-success/20 rounded-full px-2 py-0.5">
						Active
					</span>
				</div>
			{/each}

			{#if data.connections.length === 0}
				<div class="px-5 py-6 text-center text-sm text-muted-foreground">
					No GitHub account connected
				</div>
			{/if}
			<div class="px-5 py-3 border-t border-border bg-muted/30">
				<p class="text-xs text-muted-foreground">
					Missing an organization? GitHub only shows orgs you authorized at sign-in.
					<a
						href="/auth/login/github?next=/onboarding?add=org"
						class="text-primary hover:underline font-medium"
					>
						Update GitHub permissions
					</a>
					to grant access to more organizations.
				</p>
			</div>
		</div>
	</section>

	<!-- Repositories -->
	<section class="bg-card border border-border rounded-xl overflow-hidden">
		<div class="flex items-center justify-between p-5 border-b border-border">
			<div>
				<h2 class="text-sm font-semibold text-foreground">Tracked Repositories</h2>
				<p class="text-xs text-muted-foreground mt-0.5">Repositories you're monitoring</p>
			</div>
			<div class="flex items-center gap-2">
				<form method="POST" action="?/addOrg">
					<button
						type="submit"
						class="text-xs border border-border text-foreground hover:bg-muted rounded-md px-3 py-1.5 transition-colors"
					>
						Add organization
					</button>
				</form>
				<form method="POST" action="?/addRepo">
					<button
						type="submit"
						class="text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1.5 transition-colors"
					>
						Add repository
					</button>
				</form>
			</div>
		</div>
		<div class="divide-y divide-border">
			{#each data.repos as repo}
				<div class="flex items-center gap-4 px-5 py-3">
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-foreground truncate">{repo.full_name}</p>
						<div class="flex items-center gap-2 mt-0.5">
							{#if repo.is_private}
								<span class="text-xs text-muted-foreground">Private</span>
							{/if}
							{#if !repo.is_active}
								<span class="text-xs text-yellow-500">Inactive</span>
							{/if}
						</div>
					</div>
					{#if repo.is_active}
						<form method="POST" action="?/removeRepo" use:enhance>
							<input type="hidden" name="repo_id" value={repo.id} />
							<button
								type="submit"
								class="text-xs text-muted-foreground hover:text-destructive transition-colors"
							>
								Remove
							</button>
						</form>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<!-- App Settings -->
	<section class="bg-card border border-border rounded-xl overflow-hidden">
		<div class="p-5 border-b border-border">
			<h2 class="text-sm font-semibold text-foreground">Preferences</h2>
			<p class="text-xs text-muted-foreground mt-0.5">Configure your Workflow Metrics experience</p>
		</div>
		<form
			method="POST"
			action="?/updateSettings"
			class="p-5 space-y-6"
			use:enhance={() => {
				savingSettings = true;
				return async ({ update }) => {
					await update();
					savingSettings = false;
				};
			}}
		>
			{#if form?.error}
				<div class="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg px-4 py-3 text-sm">
					{form.error}
				</div>
			{/if}
			{#if form?.success}
				<div class="bg-green-500/10 border border-green-500/20 text-green-500 rounded-lg px-4 py-3 text-sm">
					Settings saved successfully.
				</div>
			{/if}

			<!-- Mistral API Key -->
			<div class="space-y-2">
				<label class="block text-sm font-medium text-foreground" for="mistral_api_key">
					Mistral AI API Key
					<span class="ml-1 text-xs text-muted-foreground font-normal">(optional)</span>
				</label>
				<p class="text-xs text-muted-foreground">
					Required to use the "Optimize with AI" feature. Get your key at
					<a href="https://console.mistral.ai" target="_blank" class="text-primary hover:underline">
						console.mistral.ai
					</a>
				</p>
				<div class="flex gap-2">
					<input
						id="mistral_api_key"
						name="mistral_api_key"
						type={showMistralKey ? 'text' : 'password'}
						value={data.settings?.mistral_api_key ?? ''}
						placeholder="Enter your Mistral API key..."
						class="flex-1 bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					/>
					<button
						type="button"
						onclick={() => (showMistralKey = !showMistralKey)}
						class="px-3 py-2 border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
					>
						{#if showMistralKey}
							<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
								<line x1="1" x2="23" y1="1" y2="23"/>
							</svg>
						{:else}
							<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
								<circle cx="12" cy="12" r="3"/>
							</svg>
						{/if}
					</button>
				</div>
			</div>

			<!-- Theme -->
			<div class="space-y-2">
				<label class="block text-sm font-medium text-foreground" for="theme">Theme</label>
				<select
					id="theme"
					name="theme"
					value={data.settings?.theme ?? 'dark'}
					class="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<option value="dark">Dark (default)</option>
					<option value="light">Light</option>
					<option value="system">System</option>
				</select>
			</div>

			<!-- Default repo -->
			{#if data.repos.length > 0}
				<div class="space-y-2">
					<label class="block text-sm font-medium text-foreground" for="default_repo_id">
						Default Repository
					</label>
					<select
						id="default_repo_id"
						name="default_repo_id"
						value={data.settings?.default_repo_id ?? ''}
						class="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					>
						{#each data.repos.filter((r) => r.is_active) as repo}
							<option value={repo.id}>{repo.full_name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<div class="pt-2">
				<button
					type="submit"
					disabled={savingSettings}
					class="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
				>
					{savingSettings ? 'Saving...' : 'Save settings'}
				</button>
			</div>
		</form>
	</section>

	<!-- Danger zone -->
	<section class="bg-card border border-destructive/20 rounded-xl overflow-hidden">
		<div class="p-5 border-b border-destructive/20">
			<h2 class="text-sm font-semibold text-foreground">Account</h2>
		</div>
		<div class="p-5 flex items-center justify-between">
			<div>
				<p class="text-sm font-medium text-foreground">Sign out</p>
				<p class="text-xs text-muted-foreground">Sign out of your Workflow Metrics account</p>
			</div>
			<form method="POST" action="/auth/logout">
				<button
					type="submit"
					class="text-sm border border-border text-foreground hover:bg-muted rounded-lg px-4 py-2 transition-colors"
				>
					Sign out
				</button>
			</form>
		</div>
	</section>
</div>
