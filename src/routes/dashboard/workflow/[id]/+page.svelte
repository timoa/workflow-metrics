<script lang="ts">
	import type { PageData } from './$types';
	import MetricCard from '$lib/components/dashboard/MetricCard.svelte';
	import RecentRuns from '$lib/components/dashboard/RecentRuns.svelte';
	import DurationTrendChart from '$lib/components/dashboard/DurationTrendChart.svelte';
	import JobBreakdownChart from '$lib/components/dashboard/JobBreakdownChart.svelte';
	import OptimizePanel from '$lib/components/dashboard/OptimizePanel.svelte';
	import { formatDuration } from '$lib/utils';

	let { data }: { data: PageData } = $props();
	let { detailData, owner, repo, hasMistralKey } = $derived(data);
	let metrics = $derived(detailData.metrics);

	let showOptimize = $state(false);
</script>

<svelte:head>
	<title>{detailData.workflowName} · {owner}/{repo} · Workflow Metrics</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="space-y-1">
			<h1 class="text-xl font-semibold text-foreground">{detailData.workflowName}</h1>
			<p class="text-xs font-mono text-muted-foreground">{detailData.workflowPath}</p>
		</div>
		{#if hasMistralKey}
			<button
				onclick={() => (showOptimize = !showOptimize)}
				class="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
					<path d="M12 8v4l3 3"/>
				</svg>
				Optimize with AI
			</button>
		{:else}
			<a
				href="/settings"
				class="flex items-center gap-2 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 rounded-lg px-4 py-2 text-sm transition-colors"
				title="Add Mistral API key in settings to enable AI optimization"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
					<path d="M12 8v4l3 3"/>
				</svg>
				Optimize with AI
			</a>
		{/if}
	</div>

	<!-- AI Optimization Panel -->
	{#if showOptimize && hasMistralKey}
		<OptimizePanel
			workflowId={detailData.workflowId}
			workflowName={detailData.workflowName}
			workflowPath={detailData.workflowPath}
			{metrics}
			{owner}
			{repo}
			onclose={() => (showOptimize = false)}
		/>
	{/if}

	<!-- Metric cards -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
		<MetricCard
			title="Success Rate"
			value="{metrics.successRate.toFixed(1)}%"
			subtitle="{metrics.successCount} of {metrics.totalRuns} runs"
		/>
		<MetricCard
			title="Avg Duration"
			value={formatDuration(metrics.avgDurationMs)}
			subtitle="P95: {formatDuration(metrics.p95DurationMs)}"
		/>
		<MetricCard
			title="Total Runs"
			value={metrics.totalRuns.toLocaleString()}
			subtitle="last 30 days"
		/>
		<MetricCard
			title="Failures"
			value={metrics.failureCount.toLocaleString()}
			subtitle="{(100 - metrics.successRate).toFixed(1)}% failure rate"
		/>
	</div>

	<!-- Charts -->
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
		<DurationTrendChart data={detailData.durationTrend} />
		<JobBreakdownChart jobs={detailData.jobBreakdown} />
	</div>

	<!-- Recent runs -->
	<RecentRuns runs={detailData.recentRuns} {owner} {repo} />
</div>
