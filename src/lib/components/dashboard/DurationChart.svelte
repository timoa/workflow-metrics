<script lang="ts">
	import type { WorkflowMetrics } from '$lib/types/metrics';
	import { formatDuration } from '$lib/utils';

	let {
		metrics,
		owner,
		repo
	}: {
		metrics: WorkflowMetrics[];
		owner: string;
		repo: string;
	} = $props();

	const sorted = $derived(
		[...metrics]
			.filter((m) => m.totalRuns > 0)
			.sort((a, b) => b.avgDurationMs - a.avgDurationMs)
			.slice(0, 8)
	);
	const maxDuration = $derived(Math.max(...sorted.map((m) => m.avgDurationMs), 1));
</script>

<div class="bg-card border border-border rounded-xl p-5 space-y-4">
	<h3 class="text-sm font-semibold text-foreground">Avg Duration by Workflow</h3>

	{#if sorted.length === 0}
		<div class="flex items-center justify-center h-32 text-muted-foreground text-sm">
			No workflow data available
		</div>
	{:else}
		<div class="space-y-3">
			{#each sorted as m (m.workflowId)}
				<div class="space-y-1">
					<div class="flex items-center justify-between text-xs">
						<a
							href={`/dashboard/workflow/${m.workflowId}?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`}
							class="text-foreground font-medium truncate max-w-48 hover:text-primary hover:underline transition-colors"
							title={m.workflowName}
						>
							{m.workflowName}
						</a>
						<span class="text-muted-foreground ml-2 flex-shrink-0">
							{formatDuration(m.avgDurationMs)}
						</span>
					</div>
					<div class="h-2 bg-muted rounded-full overflow-hidden">
						<div
							class="h-full rounded-full bg-primary transition-all"
							style="width: {(m.avgDurationMs / maxDuration) * 100}%"
						></div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
