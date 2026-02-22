<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import MetricCard from '$lib/components/dashboard/MetricCard.svelte';
	import RunHistoryChart from '$lib/components/dashboard/RunHistoryChart.svelte';
	import DurationChart from '$lib/components/dashboard/DurationChart.svelte';
	import RecentRuns from '$lib/components/dashboard/RecentRuns.svelte';
	import WorkflowList from '$lib/components/dashboard/WorkflowList.svelte';
	import { formatDuration } from '$lib/utils';

	let { data }: { data: PageData } = $props();

	function switchRepo(fullName: string) {
		const found = data.repos.find((r) => r.full_name === fullName);
		if (found) {
			goto(`/dashboard?owner=${found.owner}&repo=${found.name}`);
		}
	}
</script>

<svelte:head>
	<title>{data.selectedRepo.full_name} · Workflow Metrics</title>
</svelte:head>

<div class="space-y-6">
	<!-- Repo selector + header -->
	<div class="flex items-center justify-between">
		<div class="space-y-1">
			<h1 class="text-xl font-semibold text-foreground">{data.selectedRepo.full_name}</h1>
			<p class="text-sm text-muted-foreground">GitHub Actions · Last 30 days</p>
		</div>
		<div class="flex items-center gap-3">
			<select
				value={data.selectedRepo.full_name}
				onchange={(e) => switchRepo((e.target as HTMLSelectElement).value)}
				class="text-sm bg-card border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			>
				{#each data.repos as repo}
					<option value={repo.full_name}>{repo.full_name}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Metric cards -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
		<MetricCard
			title="Total Runs"
			value={data.dashboardData.totalRuns.toLocaleString()}
			subtitle="last 30 days"
			icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
		/>
		<MetricCard
			title="Success Rate"
			value="{data.dashboardData.successRate.toFixed(1)}%"
			subtitle="of completed runs"
			icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 5 5L20 7"/></svg>'
		/>
		<MetricCard
			title="Avg Duration"
			value={formatDuration(data.dashboardData.avgDurationMs)}
			subtitle="per run"
			icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
		/>
		<MetricCard
			title="Active Workflows"
			value={data.dashboardData.activeWorkflows.toString()}
			subtitle="total workflows"
			icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>'
		/>
	</div>

	<!-- Charts row -->
	<div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
		<div class="lg:col-span-3">
			<RunHistoryChart data={data.dashboardData.runTrend} />
		</div>
		<div class="lg:col-span-2">
			<DurationChart metrics={data.dashboardData.workflowMetrics} />
		</div>
	</div>

	<!-- Workflows list -->
	<WorkflowList
		metrics={data.dashboardData.workflowMetrics}
		owner={data.dashboardData.owner}
		repo={data.dashboardData.repo}
	/>

	<!-- Recent runs -->
	<RecentRuns
		runs={data.dashboardData.recentRuns}
		owner={data.dashboardData.owner}
		repo={data.dashboardData.repo}
	/>
</div>
