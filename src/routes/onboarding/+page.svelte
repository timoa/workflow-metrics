<script lang="ts">
	import { enhance, deserialize, applyAction } from '$app/forms';

	let { data } = $props();

	let selectedAccount = $state<string | null>(null);
	let repos = $state<Array<{ id: number; name: string; fullName: string; isPrivate: boolean }>>([]);
	let selectedRepos = $state<Set<number>>(new Set());
	let loadingRepos = $state(false);
	let saving = $state(false);
	let repoError = $state<string | null>(null);

	async function selectAccount(account: { login: string; type: string }) {
		selectedAccount = account.login;
		loadingRepos = true;
		repos = [];
		selectedRepos = new Set();
		repoError = null;

		const formData = new FormData();
		formData.set('account', account.login);
		formData.set('accountType', account.type);

		try {
			const response = await fetch('?/fetchRepos', { method: 'POST', body: formData });
			const result = deserialize(await response.text());
			applyAction(result);

			if (result.type === 'success' && result.data && 'repos' in result.data) {
				repos = Array.isArray(result.data.repos) ? result.data.repos : [];
			} else if (result.type === 'failure' && result.data && typeof result.data === 'object' && 'error' in result.data) {
				repoError = String((result.data as { error?: unknown }).error);
			}
		} catch (e) {
			repoError = e instanceof Error ? e.message : 'Failed to load repositories';
		} finally {
			loadingRepos = false;
		}
	}

	function toggleRepo(id: number) {
		const next = new Set(selectedRepos);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedRepos = next;
	}

	function getSelectedReposData() {
		return repos
			.filter((r) => selectedRepos.has(r.id))
			.map((r) => ({ ...r, owner: selectedAccount! }));
	}
</script>

<div class="min-h-screen bg-background flex flex-col items-center justify-center p-4">
	<div class="w-full max-w-2xl space-y-8">
		{#if data.fromSettings}
			<div class="w-full flex justify-start">
				<a
					href="/settings"
					class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="15 18 9 12 15 6"/>
					</svg>
					Back to Settings
				</a>
			</div>
		{/if}
		<div class="text-center space-y-2">
			<div class="flex items-center justify-center gap-2">
				<img src="/logo.svg" alt="" class="size-8 h-8 w-8 object-contain" />
				<span class="text-xl font-bold">Workflow Metrics</span>
			</div>
			<h1 class="text-2xl font-semibold">
				{data.addOrgOnly ? 'Add repositories from an organization' : 'Select repositories to track'}
			</h1>
			<p class="text-muted-foreground text-sm">
				{data.addOrgOnly ? 'Choose an organization, then select which repositories to monitor.' : 'Choose which repositories you want to monitor'}
			</p>
		</div>

		<!-- Step 1: Select account/org -->
		<div class="bg-card border border-border rounded-xl p-6 space-y-4">
			<h2 class="font-medium text-sm text-muted-foreground uppercase tracking-wide">
				Step 1 · {data.addOrgOnly ? 'Select organization' : 'Select account or organization'}
			</h2>
			{#if data.addOrgOnly && data.accounts.length === 0}
				<p class="text-sm text-muted-foreground">You are not a member of any organizations, or we couldn't load them. Try adding repositories from your personal account via Settings → Add repository.</p>
			{/if}
			{#if data.addOrgOnly && data.accounts.length > 0}
				<p class="text-sm text-muted-foreground">
					Don't see all your organizations? GitHub only shows orgs you authorized when you signed in.
					<a
						href="/auth/login/github?next=/onboarding?add=org"
						class="text-primary hover:underline font-medium"
					>
						Update GitHub permissions
					</a>
					to grant access to more organizations.
				</p>
			{/if}
			<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
				{#each data.accounts as account}
					<button
						onclick={() => selectAccount(account)}
						class="flex items-center gap-3 p-3 rounded-lg border transition-colors text-left
							{selectedAccount === account.login
								? 'border-primary bg-primary/10'
								: 'border-border hover:border-muted-foreground/40'}"
					>
						<img src={account.avatarUrl} alt={account.login} class="size-8 rounded-full" />
						<div class="min-w-0">
							<p class="text-sm font-medium truncate">{account.login}</p>
							<p class="text-xs text-muted-foreground capitalize">{account.type}</p>
						</div>
					</button>
				{/each}
			</div>
		</div>

		<!-- Step 2: Select repos -->
		{#if selectedAccount}
			<div class="bg-card border border-border rounded-xl p-6 space-y-4">
				<div class="flex items-center justify-between">
					<h2 class="font-medium text-sm text-muted-foreground uppercase tracking-wide">
						Step 2 · Select repositories
					</h2>
					{#if selectedRepos.size > 0}
						<span class="text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5">
							{selectedRepos.size} selected
						</span>
					{/if}
				</div>

				{#if loadingRepos}
					<div class="flex items-center justify-center py-8 text-muted-foreground">
						<svg class="size-5 animate-spin mr-2" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
						</svg>
						Loading repositories...
					</div>
				{:else if repoError}
					<p class="text-center text-destructive py-6 text-sm">{repoError}</p>
				{:else if repos.length === 0}
					<p class="text-center text-muted-foreground py-6 text-sm">No repositories found</p>
				{:else}
					<div class="space-y-2 max-h-80 overflow-y-auto">
						{#each repos as repo}
							<label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
								{selectedRepos.has(repo.id)
									? 'border-primary bg-primary/5'
									: 'border-border hover:border-muted-foreground/30'}">
								<input
									type="checkbox"
									checked={selectedRepos.has(repo.id)}
									onchange={() => toggleRepo(repo.id)}
									class="rounded border-border accent-primary"
								/>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium truncate">{repo.name}</p>
									<p class="text-xs text-muted-foreground">{repo.fullName}</p>
								</div>
								{#if repo.isPrivate}
									<span class="text-xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5">
										Private
									</span>
								{/if}
							</label>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Step 3: Save -->
		{#if selectedRepos.size > 0}
			<form
				method="POST"
				action="?/saveRepos"
				use:enhance={() => {
					saving = true;
					return async ({ update }) => {
						await update();
						saving = false;
					};
				}}
			>
				<input type="hidden" name="connectionId" value={data.connectionId} />
				<input type="hidden" name="repos" value={JSON.stringify(getSelectedReposData())} />
				<button
					type="submit"
					disabled={saving}
					class="w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-lg px-4 py-3 text-sm font-medium transition-colors"
				>
					{saving ? 'Setting up...' : `Track ${selectedRepos.size} ${selectedRepos.size === 1 ? 'repository' : 'repositories'} →`}
				</button>
			</form>
		{/if}
	</div>
</div>
