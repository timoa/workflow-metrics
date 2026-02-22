<script lang="ts">
	import type { WorkflowMetrics } from '$lib/types/metrics';
	import { formatDuration } from '$lib/utils';

	let { metrics }: { metrics: WorkflowMetrics[] } = $props();

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
			{#each sorted as m}
				<div class="space-y-1">
					<div class="flex items-center justify-between text-xs">
						<span class="text-foreground font-medium truncate max-w-48" title={m.workflowName}>
							{m.workflowName}
						</span>
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
