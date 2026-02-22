<script lang="ts">
	import type { WorkflowMetrics } from '$lib/types/metrics';
	import { formatDuration, formatRelativeTime } from '$lib/utils';

	let { metrics, owner, repo }: { metrics: WorkflowMetrics[]; owner: string; repo: string } = $props();

	function successRateColor(rate: number): string {
		if (rate >= 90) return 'text-green-500';
		if (rate >= 70) return 'text-yellow-500';
		return 'text-red-500';
	}
</script>

<div class="bg-card border border-border rounded-xl overflow-hidden">
	<div class="p-5 border-b border-border">
		<h3 class="text-sm font-semibold text-foreground">Workflows</h3>
	</div>

	{#if metrics.length === 0}
		<div class="flex items-center justify-center h-24 text-muted-foreground text-sm">
			No workflows found
		</div>
	{:else}
		<div class="divide-y divide-border">
			{#each metrics as m}
				<a
					href="/dashboard/workflow/{m.workflowId}?owner={owner}&repo={repo}"
					class="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
				>
					<!-- Status indicator -->
					<div class="size-2 rounded-full flex-shrink-0
						{m.lastConclusion === 'success' ? 'bg-green-500' :
						 m.lastConclusion === 'failure' ? 'bg-red-500' :
						 'bg-muted-foreground'}">
					</div>

					<!-- Workflow name -->
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-foreground truncate">{m.workflowName}</p>
						<p class="text-xs text-muted-foreground truncate font-mono">{m.workflowPath}</p>
					</div>

					<!-- Success rate -->
					<div class="text-right flex-shrink-0">
						<p class="text-sm font-semibold {successRateColor(m.successRate)}">
							{m.successRate.toFixed(0)}%
						</p>
						<p class="text-xs text-muted-foreground">success</p>
					</div>

					<!-- Avg duration -->
					<div class="text-right flex-shrink-0 w-20">
						<p class="text-sm text-foreground">{formatDuration(m.avgDurationMs)}</p>
						<p class="text-xs text-muted-foreground">avg</p>
					</div>

					<!-- Run count -->
					<div class="text-right flex-shrink-0 w-16">
						<p class="text-sm text-foreground">{m.totalRuns}</p>
						<p class="text-xs text-muted-foreground">runs</p>
					</div>

					<!-- Last run -->
					<div class="text-right flex-shrink-0 w-20">
						<p class="text-xs text-muted-foreground">{formatRelativeTime(m.lastRunAt)}</p>
					</div>

					<!-- Arrow -->
					<svg class="size-4 text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="9 18 15 12 9 6"/>
					</svg>
				</a>
			{/each}
		</div>
	{/if}
</div>
