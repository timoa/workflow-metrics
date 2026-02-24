<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showMistralKey = $state(false);
	let savingSettings = $state(false);
	let savingAiSettings = $state(false);
	let removingInstallation = $state<string | null>(null);
	let syncing = $state(false);

	// Local state for default repo so the select doesn’t reset when the form re-renders before submit
	let defaultRepoId = $state('');
	let lastServerDefaultRepoId = $state<string | null>(null);
	$effect(() => {
		const v = data.settings?.default_repo_id ?? '';
		// Only sync from server when the server value actually changed (e.g. after save), so we don’t overwrite the user’s selection
		if (v !== lastServerDefaultRepoId) {
			lastServerDefaultRepoId = v;
			defaultRepoId = v;
		}
	});
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
					<div class="flex-1 min-w-0 flex flex-wrap items-center gap-2">
						<p class="text-sm font-medium text-foreground truncate">{repo.full_name}</p>
						{#if repo.is_private}
							<span class="shrink-0 rounded-md border border-border bg-muted/80 px-2 py-0.5 text-xs font-medium text-muted-foreground">Private</span>
						{/if}
						{#if !repo.is_active}
							<span class="shrink-0 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-500">Inactive</span>
						{/if}
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

	<!-- AI Optimisation -->
	<section class="bg-card border border-border rounded-xl overflow-hidden">
		<div class="p-5 border-b border-border">
			<h2 class="text-sm font-semibold text-foreground">AI Optimisation</h2>
			<p class="text-xs text-muted-foreground mt-0.5">Configure AI-powered workflow optimisation</p>
		</div>

		<!-- GitHub App — required for "Apply as PR" -->
		<div class="px-5 py-4 border-b border-border space-y-3">
			<div class="flex items-start justify-between gap-4">
				<div class="space-y-0.5">
					<p class="text-sm font-medium text-foreground">GitHub App (AI optimisation)</p>
					<p class="text-xs text-muted-foreground">
						Install the Workflow Metrics GitHub App on accounts or organizations to enable the
						"Apply as PR" feature. The app only requests write access to the repositories you choose.
					</p>
				</div>
				{#if data.installations.length > 0}
					<span class="shrink-0 flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-1">
						<svg class="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M2 6l3 3 5-5"/></svg>
						Installed
					</span>
				{:else}
					<span class="shrink-0 flex items-center gap-1.5 text-xs font-medium text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-2.5 py-1">
						<svg class="size-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="5"/><path d="M6 4v2.5M6 8h.01"/></svg>
						Not installed
					</span>
				{/if}
			</div>

			{#if data.appError}
				<p class="text-xs text-destructive">{data.appError}</p>
			{/if}
			{#if data.appSuccess}
				<p class="text-xs text-green-400">GitHub App installed successfully.</p>
			{/if}
			{#if form?.syncError}
				<p class="text-xs text-destructive">{form.syncError}</p>
			{/if}
			{#if form?.syncResult}
				{#if form.syncResult.added > 0}
					<p class="text-xs text-green-400">
						Synced {form.syncResult.added} installation{form.syncResult.added > 1 ? 's' : ''} successfully.
					</p>
				{:else if form.syncResult.notFound}
					<p class="text-xs text-yellow-400">
						No installations found on GitHub matching your accounts. Make sure you installed the app on the right account or organization.
					</p>
				{:else}
					<p class="text-xs text-muted-foreground">Already up to date — no new installations found.</p>
				{/if}
			{/if}

			<!-- List of existing installations -->
			{#if data.installations.length > 0}
				<div class="space-y-2">
					{#each data.installations as inst}
						<div class="flex items-center justify-between rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2">
							<div class="space-y-0.5">
								<p class="text-xs text-green-400 font-medium">
									<span class="font-mono">@{inst.account_login}</span>
									<span class="ml-1 text-muted-foreground font-normal">({inst.account_type})</span>
								</p>
								<p class="text-xs text-muted-foreground">
									Installed {new Date(inst.created_at).toLocaleDateString()}
								</p>
							</div>
							<form
								method="POST"
								action="?/removeInstallation"
								use:enhance={() => {
									removingInstallation = inst.id;
									return async ({ update }) => {
										await update();
										removingInstallation = null;
									};
								}}
							>
								<input type="hidden" name="installation_id" value={inst.id} />
								<button
									type="submit"
									disabled={removingInstallation === inst.id}
									class="shrink-0 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 ml-4"
								>
									{removingInstallation === inst.id ? 'Removing…' : 'Remove'}
								</button>
							</form>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Install / add more + sync -->
			{#if data.hasGitHubApp}
				<div class="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3 gap-3">
					<div class="space-y-0.5 min-w-0">
						<p class="text-xs font-medium text-foreground">
							{data.installations.length > 0 ? 'Add another account or organization' : 'Install GitHub App'}
						</p>
						<p class="text-xs text-muted-foreground">
							Opens GitHub in a new tab. Once installed, click <strong>Sync</strong> to import it here.
						</p>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<!-- Sync button: pulls installations from GitHub API -->
						<form
							method="POST"
							action="?/syncInstallations"
							use:enhance={() => {
								syncing = true;
								return async ({ update }) => {
									await update();
									syncing = false;
								};
							}}
						>
							<button
								type="submit"
								disabled={syncing}
								title="Sync installations from GitHub"
								class="flex items-center gap-1.5 text-xs border border-border text-foreground hover:bg-muted disabled:opacity-50 rounded-lg px-3 py-2 font-medium transition-colors"
							>
								<svg
									class="size-3.5 {syncing ? 'animate-spin' : ''}"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
									<path d="M21 3v5h-5"/>
								</svg>
								{syncing ? 'Syncing…' : 'Sync'}
							</button>
						</form>

						<!-- Install link — opens in new tab so the user keeps their place -->
						<a
							href="/auth/github-app"
							target="_blank"
							rel="noopener noreferrer"
							class="flex items-center gap-2 text-xs bg-foreground text-background hover:bg-foreground/90 rounded-lg px-3 py-2 font-medium transition-colors"
						>
							<svg class="size-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
							Install on GitHub
						</a>
					</div>
				</div>
			{:else}
				<p class="text-xs text-muted-foreground">
					The GitHub App is not configured on this server. Set <span class="font-mono bg-muted px-1 rounded">GITHUB_APP_ID</span>,
					<span class="font-mono bg-muted px-1 rounded">GITHUB_APP_PRIVATE_KEY</span>, and
					<span class="font-mono bg-muted px-1 rounded">GITHUB_APP_SLUG</span> to enable it.
				</p>
			{/if}
		</div>

		<form
			method="POST"
			action="?/updateSettings"
			class="p-5 space-y-6"
			use:enhance={() => {
				savingAiSettings = true;
				return async ({ update }) => {
					await update();
					savingAiSettings = false;
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
			<input type="hidden" name="theme" value={data.settings?.theme ?? 'dark'} />
			<input type="hidden" name="default_repo_id" value={data.settings?.default_repo_id ?? ''} />
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
			<div class="pt-2">
				<button
					type="submit"
					disabled={savingAiSettings}
					class="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
				>
					{savingAiSettings ? 'Saving...' : 'Save AI settings'}
				</button>
			</div>
		</form>
	</section>

	<!-- Preferences -->
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
			<input type="hidden" name="mistral_api_key" value={data.settings?.mistral_api_key ?? ''} />
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
						bind:value={defaultRepoId}
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
