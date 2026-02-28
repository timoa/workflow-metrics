<script lang="ts">
	import type { WorkflowJobNode as WorkflowJobNodeData } from '$lib/types/metrics';
	import { Handle, Position } from '@xyflow/svelte';
	import type { NodeProps, Node } from '@xyflow/svelte';

	type JobNode = Node<{ node: WorkflowJobNodeData; compact?: boolean }, 'job'>;

	let {
		data,
		sourcePosition = Position.Right,
		targetPosition = Position.Left
	}: NodeProps<JobNode> = $props();

	const node = $derived(data.node);
	const compact = $derived(data.compact ?? false);

	function formatDuration(ms: number): string {
		const seconds = Math.round(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return s > 0 ? `${m}m ${s}s` : `${m}m`;
	}
</script>

<Handle type="target" position={targetPosition} />
<div
	class="flex flex-col justify-between overflow-hidden rounded-md border border-border bg-card shadow {compact
		? 'h-[80px] w-[180px] px-2.5 py-2'
		: 'h-[100px] w-[220px] px-3 py-2.5'} text-xs"
>
	<div class="flex min-w-0 items-center justify-between gap-2">
		<p class="min-w-0 truncate font-semibold text-card-foreground {compact ? 'text-xs' : 'text-[13px]'}" title={node.jobName}>
			{node.jobName}
		</p>
		{#if node.runnerLabel}
			<span
				class="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-[10px]"
			>
				{node.runnerLabel}
			</span>
		{/if}
	</div>
	<div class="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
		<i class="fa-regular fa-circle-check shrink-0 text-[0.6rem] text-primary"></i>
		<span class="truncate">{node.stepCount} steps</span>
	</div>
	<div class="flex min-w-0 items-center justify-between gap-1 text-[10px] text-muted-foreground">
		<span class="truncate tabular-nums">avg {formatDuration(node.avgDurationMs)}</span>
		<span class="shrink-0 tabular-nums">{node.successRate.toFixed(1)}%</span>
		<span class="truncate tabular-nums">{node.runCount} runs</span>
	</div>
	{#if !compact}
		<div class="flex items-center justify-between gap-1 text-[10px] text-muted-foreground/70">
			<span class="tabular-nums"
				>min {formatDuration(node.minDurationMs)} · max {formatDuration(node.maxDurationMs)}</span
			>
			<span class="tabular-nums">{node.minutesShare.toFixed(1)}%</span>
		</div>
	{/if}
</div>
<Handle type="source" position={sourcePosition} />
