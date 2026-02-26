<script lang="ts">
	import type { RecentRun } from '$lib/types/metrics';
	import { formatDuration, formatRelativeTime, statusLabel, conclusionColor } from '$lib/utils';

	const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

	let { runs, owner, repo }: { runs: RecentRun[]; owner: string; repo: string } = $props();

	let pageSize = $state(20);
	let page = $state(1);

	const totalPages = $derived(Math.max(1, Math.ceil(runs.length / pageSize)));
	const clampedPage = $derived(Math.min(page, totalPages));
	const paginatedRuns = $derived(
		runs.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)
	);
	const startItem = $derived(runs.length === 0 ? 0 : (clampedPage - 1) * pageSize + 1);
	const endItem = $derived(Math.min(clampedPage * pageSize, runs.length));

	$effect(() => {
		if (page > totalPages) page = totalPages;
	});

	function setPageSize(size: number) {
		pageSize = size;
		page = 1;
	}
</script>

<div class="bg-card border border-border rounded-xl overflow-hidden">
	<div class="p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
		<h3 class="text-sm font-semibold text-foreground">Recent Runs</h3>
		{#if runs.length > 0}
			<div class="flex flex-wrap items-center gap-3">
				<span class="text-xs text-muted-foreground">Show</span>
				<div class="flex rounded-md border border-border bg-muted/30 p-0.5" role="group" aria-label="Items per page">
					{#each PAGE_SIZE_OPTIONS as size}
						<button
							type="button"
							class="px-2.5 py-1 text-xs font-medium rounded transition-colors {pageSize === size
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
							onclick={() => setPageSize(size)}
						>
							{size}
						</button>
					{/each}
				</div>
				<span class="text-xs text-muted-foreground">per page</span>
			</div>
		{/if}
	</div>

	{#if runs.length === 0}
		<div class="flex items-center justify-center h-24 text-muted-foreground text-sm">
			No recent runs
		</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border">
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Workflow</th>
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Status</th>
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Branch</th>
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Duration</th>
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Started</th>
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Triggered by</th>
					</tr>
				</thead>
				<tbody>
					{#each paginatedRuns as run}
						<tr class="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
							<td class="px-5 py-3">
								<div class="flex items-center gap-2">
									<a
										href="/dashboard/workflow/{run.workflowId}?owner={owner}&repo={repo}"
										class="font-medium text-foreground hover:text-primary transition-colors truncate max-w-48"
										title={run.workflowName}
									>
										{run.workflowName}
									</a>
									<span class="text-xs text-muted-foreground flex-shrink-0">#{run.runNumber}</span>
								</div>
							</td>
							<td class="px-5 py-3">
								<span class="flex items-center gap-1.5 {conclusionColor(run.conclusion)}">
									{#if run.status === 'in_progress'}
										<svg class="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
											<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
											<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
										</svg>
									{:else if run.conclusion === 'success'}
										<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
											<path d="m5 12 5 5L20 7"/>
										</svg>
									{:else if run.conclusion === 'failure'}
										<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
											<path d="M18 6 6 18M6 6l12 12"/>
										</svg>
									{:else}
										<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/>
											<line x1="12" x2="12.01" y1="16" y2="16"/>
										</svg>
									{/if}
									<span class="text-xs font-medium">
										{statusLabel(run.status, run.conclusion)}
									</span>
								</span>
							</td>
							<td class="px-5 py-3">
								<span class="text-xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 font-mono">
									{run.branch ?? '—'}
								</span>
							</td>
							<td class="px-5 py-3 text-xs text-muted-foreground">
								{formatDuration(run.durationMs)}
							</td>
							<td class="px-5 py-3 text-xs text-muted-foreground">
								{formatRelativeTime(run.startedAt)}
							</td>
							<td class="px-5 py-3">
								{#if run.actor}
									<div class="flex items-center gap-1.5">
										<img
											src={run.actorAvatar ?? undefined}
											alt={run.actor}
											class="size-5 rounded-full"
										/>
										<span class="text-xs text-muted-foreground">{run.actor}</span>
									</div>
								{:else}
									<span class="text-xs text-muted-foreground">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		{#if runs.length > pageSize}
			<div class="px-5 py-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
				<p class="text-xs text-muted-foreground">
					Showing {startItem}–{endItem} of {runs.length}
				</p>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="px-2.5 py-1.5 text-xs font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
						disabled={clampedPage <= 1}
						onclick={() => (page = clampedPage - 1)}
						aria-label="Previous page"
					>
						Previous
					</button>
					<span class="text-xs text-muted-foreground px-2">
						Page {clampedPage} of {totalPages}
					</span>
					<button
						type="button"
						class="px-2.5 py-1.5 text-xs font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:pointer-events-none transition-colors"
						disabled={clampedPage >= totalPages}
						onclick={() => (page = clampedPage + 1)}
						aria-label="Next page"
					>
						Next
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>
