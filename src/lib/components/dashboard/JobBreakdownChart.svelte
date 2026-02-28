<script lang="ts">
	import type { JobBreakdown } from '$lib/types/metrics';
	import { formatDuration } from '$lib/utils';
	import { keyWithIndex } from './list-keys';

	let { jobs }: { jobs: JobBreakdown[] } = $props();

	const sorted = $derived([...jobs].sort((a, b) => b.avgDurationMs - a.avgDurationMs));
	const maxDuration = $derived(Math.max(...sorted.map((j) => j.maxDurationMs), 1));
</script>

<div class="bg-card border border-border rounded-xl p-5 space-y-4">
	<h3 class="text-sm font-semibold text-foreground">Job Breakdown</h3>
	<p class="text-xs text-muted-foreground -mt-2">Based on last 5 completed runs</p>

	{#if sorted.length === 0}
		<div class="flex items-center justify-center h-32 text-muted-foreground text-sm">
			No job data available
		</div>
	{:else}
		<div class="space-y-3">
			{#each sorted as job, i (keyWithIndex('job', job.jobName, i))}
				<div class="space-y-1">
					<div class="flex items-center justify-between text-xs">
						<span class="text-foreground font-medium truncate max-w-48" title={job.jobName}>
							{job.jobName}
						</span>
						<span class="text-muted-foreground ml-2 flex-shrink-0">
							{formatDuration(job.avgDurationMs)} avg
						</span>
					</div>
					<!-- Stacked bar: min/avg/max -->
					<div class="h-2 bg-muted rounded-full overflow-hidden relative">
						<!-- Max bar (background) -->
						<div
							class="absolute inset-y-0 left-0 rounded-full bg-primary/20"
							style="width: {(job.maxDurationMs / maxDuration) * 100}%"
						></div>
						<!-- Avg bar -->
						<div
							class="absolute inset-y-0 left-0 rounded-full bg-primary"
							style="width: {(job.avgDurationMs / maxDuration) * 100}%"
						></div>
					</div>
					<div class="flex justify-between text-xs text-muted-foreground">
						<span>min: {formatDuration(job.minDurationMs)}</span>
						<span>max: {formatDuration(job.maxDurationMs)}</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
