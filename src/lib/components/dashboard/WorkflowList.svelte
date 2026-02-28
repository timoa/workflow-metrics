<script lang="ts">
	import type { WorkflowMetrics } from '$lib/types/metrics';
	import { formatDuration, formatRelativeTime, successRateColor } from '$lib/utils';

	let { metrics, owner, repo }: { metrics: WorkflowMetrics[]; owner: string; repo: string } = $props();
</script>

<div class="space-y-3">
	<h2 class="text-sm font-medium text-muted-foreground">Workflows</h2>

	{#if metrics.length === 0}
		<div class="bg-card border border-border rounded-xl overflow-hidden">
			<div class="flex items-center justify-center h-24 text-muted-foreground text-sm">
				No workflows found
			</div>
		</div>
	{:else}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			{#each metrics as m}
				<a
					href="/dashboard/workflow/{m.workflowId}?owner={owner}&repo={repo}"
					class="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:bg-muted/30 transition-colors h-full"
				>
					<div class="flex items-start gap-3">
						<!-- Status indicator -->
						<div class="size-2 rounded-full flex-shrink-0 mt-1.5
							{m.lastConclusion === 'success' ? 'bg-green-500' :
							 m.lastConclusion === 'failure' ? 'bg-red-500' :
							 'bg-muted-foreground'}">
						</div>

						<!-- Workflow name -->
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium text-foreground truncate">{m.workflowName}</p>
							<p class="text-xs text-muted-foreground truncate font-mono">{m.workflowPath}</p>
						</div>

						<!-- Arrow -->
						<svg class="size-4 text-muted-foreground flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="9 18 15 12 9 6"/>
						</svg>
					</div>

					<div class="flex items-center gap-4 mt-auto pt-2 border-t border-border/50">
						<!-- Success rate -->
						<div class="flex-1">
							{#if m.totalRuns === 0}
								<p class="text-sm font-semibold text-muted-foreground">N/A</p>
							{:else}
								<p class="text-sm font-semibold {successRateColor(m.successRate)}">
									{m.successRate.toFixed(0)}%
								</p>
							{/if}
							<p class="text-xs text-muted-foreground">success</p>
						</div>

						<!-- Avg duration -->
						<div class="flex-1 text-center">
							<p class="text-sm text-foreground">{formatDuration(m.avgDurationMs)}</p>
							<p class="text-xs text-muted-foreground">avg</p>
						</div>

						<!-- Run count -->
						<div class="flex-1 text-center">
							<p class="text-sm text-foreground">{m.totalRuns}</p>
							<p class="text-xs text-muted-foreground">runs</p>
						</div>

						<!-- Last run -->
						<div class="flex-1 text-right">
							<p class="text-xs text-muted-foreground">{formatRelativeTime(m.lastRunAt)}</p>
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
