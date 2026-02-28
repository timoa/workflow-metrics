<script lang="ts">
	import type { PageData } from './$types';
	import MetricCard from '$lib/components/dashboard/MetricCard.svelte';
	import RecentRuns from '$lib/components/dashboard/RecentRuns.svelte';
	import DurationTrendChart from '$lib/components/dashboard/DurationTrendChart.svelte';
	import JobBreakdownChart from '$lib/components/dashboard/JobBreakdownChart.svelte';
	import MinutesDonutChart from '$lib/components/dashboard/MinutesDonutChart.svelte';
	import MinutesTrendChart from '$lib/components/dashboard/MinutesTrendChart.svelte';
	import OptimizePanel from '$lib/components/dashboard/OptimizePanel.svelte';
	import WorkflowJobGraph from '$lib/components/dashboard/WorkflowJobGraph.svelte';
	import { formatDuration, failureRateColor, failureRateBorderColor, successRateColor, successRateBorderColor } from '$lib/utils';

	let { data }: { data: PageData } = $props();
	let { detailData, owner, repo, hasMistralKey } = $derived(data);
	let metrics = $derived(detailData.metrics);

	let showOptimize = $state(false);

	// Estimated minutes "saved" by skips (median run duration × skipped count)
	const medianDurationMs = $derived(
		detailData.durationTrend.length > 0
			? [...detailData.durationTrend]
					.sort((a, b) => a.durationMs - b.durationMs)
					[Math.floor(detailData.durationTrend.length / 2)]?.durationMs ?? 0
			: 0
	);
	const minutesSavedBySkips = $derived(
		metrics.skippedCount > 0 ? Math.round((medianDurationMs * metrics.skippedCount) / 60_000) : 0
	);

	function formatMinutes(m: number): string {
		if (m < 60) return `${m}m`;
		const h = Math.floor(m / 60);
		const min = m % 60;
		return min > 0 ? `${h}h ${min}m` : `${h}h`;
	}
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
			<p class="text-xs text-muted-foreground">
				Last 30 days: <span class="font-medium text-foreground">{metrics.totalRuns.toLocaleString()}</span> triggered
				· <span class="font-medium text-foreground">{(metrics.successCount + metrics.failureCount).toLocaleString()}</span> executed
				· <span class="font-medium text-foreground">{metrics.skippedCount.toLocaleString()}</span> skipped
			</p>
		</div>
		{#if hasMistralKey}
			<button
				onclick={() => (showOptimize = !showOptimize)}
				class="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
			>
				<i class="fa-solid fa-wand-magic-sparkles size-4 shrink-0" aria-hidden="true"></i>
				Optimize with AI
			</button>
		{:else}
			<a
				href="/settings"
				class="flex items-center gap-2 border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 rounded-lg px-4 py-2 text-sm transition-colors"
				title="Add Mistral API key in settings to enable AI optimization"
			>
				<i class="fa-solid fa-wand-magic-sparkles size-4 shrink-0" aria-hidden="true"></i>
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
	<div class="flex flex-wrap gap-4">
		<MetricCard
			class="min-w-[140px] flex-1 {metrics.totalRuns === 0 ? '' : successRateBorderColor(metrics.successRate)}"
			title="Success Rate"
			value={metrics.totalRuns === 0 ? 'N/A' : `${metrics.successRate.toFixed(1)}%`}
			subtitle={metrics.successCount + metrics.failureCount > 0
				? `${metrics.successCount} of ${metrics.successCount + metrics.failureCount} runs that executed`
				: metrics.totalRuns === 0
					? 'no runs in last 30 days'
					: `${metrics.successCount} of ${metrics.totalRuns} runs`}
			valueClass={metrics.totalRuns === 0 ? 'text-muted-foreground' : successRateColor(metrics.successRate)}
			help="Percentage of runs that actually executed (success or failure). Skipped and cancelled runs are excluded."
		/>
		<MetricCard
			class="min-w-[140px] flex-1"
			title="Avg Duration"
			value={formatDuration(metrics.avgDurationMs)}
			subtitle="P95: {formatDuration(metrics.p95DurationMs)}"
		/>
		<MetricCard
			class="min-w-[140px] flex-1"
			title="Total Runs"
			value={metrics.totalRuns.toLocaleString()}
			subtitle="last 30 days"
		/>
		<MetricCard
			class="min-w-[140px] flex-1 {failureRateBorderColor(metrics.failureRate)}"
			title="Failures"
			value={metrics.failureCount.toLocaleString()}
			subtitle={metrics.skippedCount > 0
				? `${metrics.failureRate.toFixed(1)}% failure rate · ${metrics.skippedCount.toLocaleString()} skipped`
				: `${metrics.failureRate.toFixed(1)}% failure rate`}
			valueClass={failureRateColor(metrics.failureRate)}
			help="Runs that ended in failure. Skipped runs (e.g. condition not met) are not counted as failures."
		/>
		<MetricCard
			class="min-w-[140px] flex-1"
			title="Build Minutes"
			value={formatMinutes(detailData.totalMinutes30d)}
			subtitle={`${formatMinutes(detailData.billableMinutes30d)} billable${
				detailData.billableMinutes30d !== detailData.totalMinutes30d ? ' (mixed runners)' : ' (Linux ×1)'
			}`}
			help="Raw minutes consumed in the last 30 days. Billable minutes are estimated by applying the runner OS multiplier (Linux ×1, Windows ×2, macOS ×10) from the last 5 sampled runs."
			icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
		/>
		<MetricCard
			class="min-w-[140px] flex-1"
			title="Skip Rate"
			value={`${metrics.skipRate.toFixed(1)}%`}
			subtitle={`${metrics.skippedCount.toLocaleString()} skipped`}
			help="Percentage of triggered runs that were skipped (e.g. condition not met). High skip rate can mean useful conditional logic or overly broad triggers."
			icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>'
		/>
	</div>

	<!-- Workflow Structure - Full Width -->
	{#if detailData.jobGraphNodes.length > 0}
		<WorkflowJobGraph nodes={detailData.jobGraphNodes} edges={detailData.jobGraphEdges} />
	{/if}

	<!-- Duration Trend - Full Width -->
	<DurationTrendChart data={detailData.durationTrend} />

	<!-- Job Breakdown + Cost Efficiency - Half Width Pair -->
	{#if detailData.totalMinutes30d > 0}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<JobBreakdownChart jobs={detailData.jobBreakdown} />

			<!-- Failure cost card (Cost Efficiency) -->
			<div class="bg-card border border-border rounded-xl p-5 space-y-4">
				<div>
					<h3 class="text-sm font-semibold text-foreground">Cost Efficiency</h3>
					<p class="text-xs text-muted-foreground mt-0.5">Where build time is going (last 30 days)</p>
				</div>
				<div class="space-y-3">
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Total raw minutes</span>
						<div class="text-right">
							<span class="font-semibold text-foreground tabular-nums">{formatMinutes(detailData.totalMinutes30d)}</span>
							{#if detailData.billableMinutes30d !== detailData.totalMinutes30d}
								<p class="text-xs text-muted-foreground tabular-nums">{formatMinutes(detailData.billableMinutes30d)} billable</p>
							{/if}
						</div>
					</div>
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Wasted on failures</span>
						<span class="font-semibold tabular-nums {detailData.wastedMinutes > 0 ? 'text-destructive' : 'text-green-500'}">
							{formatMinutes(detailData.wastedMinutes)}
							{#if detailData.totalMinutes30d > 0}
								<span class="text-xs font-normal text-muted-foreground ml-1">
									({Math.round((detailData.wastedMinutes / detailData.totalMinutes30d) * 100)}%)
								</span>
							{/if}
						</span>
					</div>
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Successful runs</span>
						<span class="font-semibold text-green-500 tabular-nums">
							{formatMinutes(detailData.totalMinutes30d - detailData.wastedMinutes)}
							{#if detailData.totalMinutes30d > 0}
								<span class="text-xs font-normal text-muted-foreground ml-1">
									({100 - Math.round((detailData.wastedMinutes / detailData.totalMinutes30d) * 100)}%)
								</span>
							{/if}
						</span>
					</div>
					{#if minutesSavedBySkips > 0}
						<div class="flex items-center justify-between text-sm">
							<span class="text-muted-foreground">Avoided by skips (est.)</span>
							<span class="font-semibold text-muted-foreground tabular-nums" title="Median run duration × skipped count">
								{formatMinutes(minutesSavedBySkips)}
							</span>
						</div>
					{/if}
					<div class="pt-2 border-t border-border">
						<!-- Waste bar -->
						<div class="h-2 bg-muted rounded-full overflow-hidden">
							<div
								class="h-full rounded-full bg-destructive transition-all"
								style="width: {detailData.totalMinutes30d > 0 ? (detailData.wastedMinutes / detailData.totalMinutes30d) * 100 : 0}%"
							></div>
						</div>
						<p class="text-xs text-muted-foreground mt-1.5">
							{detailData.wastedMinutes === 0
								? 'No minutes wasted on failures — excellent!'
								: 'Reducing failure rate would save these minutes.'}
						</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Minutes by Job + Daily Build Minutes - Half Width Pair -->
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<MinutesDonutChart
				data={detailData.minutesByJob}
				title="Minutes by Job"
				subtitle="Based on last 5 completed runs"
				totalMinutes={detailData.minutesByJob.reduce((s, j) => s + j.minutes, 0)}
				totalBillableMinutes={detailData.minutesByJob.reduce((s, j) => s + j.billableMinutes, 0)}
				totalLabel="sampled"
				billableIsEstimate={false}
			/>
			<MinutesTrendChart
				data={detailData.minutesTrend}
				title="Daily Build Minutes"
				subtitle="Raw minutes consumed per day for this workflow"
			/>
		</div>

		<!-- Step breakdown for slowest job - Half Width (paired if present) -->
		{#if detailData.stepBreakdown.length > 0 && detailData.slowestJobName}
			{@const maxStepMs = Math.max(...detailData.stepBreakdown.map((s) => s.avgDurationMs), 1)}
			<div class="bg-card border border-border rounded-xl p-5 space-y-4 lg:max-w-[50%] lg:min-w-[50%]">
				<div>
					<h3 class="text-sm font-semibold text-foreground">Step Breakdown</h3>
					<p class="text-xs text-muted-foreground mt-0.5">
						Slowest job: <span class="font-mono">{detailData.slowestJobName}</span> · based on last 5 runs
					</p>
				</div>
				<div class="space-y-3">
					{#each detailData.stepBreakdown as step}
						<div class="space-y-1">
							<div class="flex items-center justify-between text-xs">
								<span class="text-foreground font-medium truncate max-w-52" title={step.stepName}>
									{step.stepName}
								</span>
								<span class="text-muted-foreground ml-2 flex-shrink-0 tabular-nums">
									{formatDuration(step.avgDurationMs)} avg
								</span>
							</div>
							<div class="h-2 bg-muted rounded-full overflow-hidden">
								<div
									class="h-full rounded-full bg-primary transition-all"
									style="width: {(step.avgDurationMs / maxStepMs) * 100}%"
								></div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}

	<!-- Recent runs -->
	<RecentRuns runs={detailData.recentRuns} {owner} {repo} />
</div>
