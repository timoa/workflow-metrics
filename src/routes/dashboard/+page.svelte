<script lang="ts">
	import type { PageData } from './$types';
	import type { DashboardData } from '$lib/types/metrics';
	import { goto } from '$app/navigation';
	import MetricCard from '$lib/components/dashboard/MetricCard.svelte';
	import RunHistoryChart from '$lib/components/dashboard/RunHistoryChart.svelte';
	import DurationChart from '$lib/components/dashboard/DurationChart.svelte';
	import RecentRuns from '$lib/components/dashboard/RecentRuns.svelte';
	import WorkflowList from '$lib/components/dashboard/WorkflowList.svelte';
	import { formatDuration, successRateColor, failureRateColor } from '$lib/utils';

	let { data }: { data: PageData } = $props();

	let dashboardData = $state<DashboardData | null>(null);
	let loading = $state(true);
	let errorMessage = $state<string | null>(null);

	$effect(() => {
		const owner = data.selectedRepo.owner;
		const name = data.selectedRepo.name;
		loading = true;
		errorMessage = null;
		dashboardData = null;

		const url = `/api/dashboard/data?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`;
		const ac = new AbortController();

		fetch(url, { signal: ac.signal })
			.then(async (res) => {
				if (res.status === 401) {
					goto('/auth/login?error=' + encodeURIComponent('Session expired. Please sign in again.'));
					return null;
				}
				if (!res.ok) {
					let msg = res.statusText;
					try {
						const body = await res.json();
						msg = (body as { message?: string })?.message ?? msg;
					} catch {
						// ignore non-JSON response
					}
					throw new Error(msg);
				}
				return res.json() as Promise<DashboardData>;
			})
			.then((d) => {
				if (d != null) dashboardData = d;
			})
			.catch((e: unknown) => {
				if ((e as { name?: string }).name === 'AbortError') return;
				errorMessage = e instanceof Error ? e.message : 'Failed to load dashboard data.';
			})
			.finally(() => {
				// Only clear loading if this fetch is still for the current repo (avoid race when switching repo)
				if (data.selectedRepo.owner === owner && data.selectedRepo.name === name) {
					loading = false;
				}
			});

		return () => ac.abort();
	});

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
	<!-- Repo selector + header (always visible) -->
	<div class="flex items-center justify-between">
		<div class="space-y-1">
			<h1 class="text-xl font-semibold text-foreground">{data.selectedRepo.full_name}</h1>
			<p class="text-sm text-muted-foreground">GitHub Actions · Last 30 days</p>
		</div>
		<div class="flex items-center gap-3">
			<div class="relative inline-block">
				<select
					value={data.selectedRepo.full_name}
					onchange={(e) => switchRepo((e.target as HTMLSelectElement).value)}
					class="text-sm bg-card border border-border rounded-lg pl-3 pr-10 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer min-w-[12rem]"
				>
					{#each data.repos as repo}
						<option value={repo.full_name}>{repo.full_name}</option>
					{/each}
				</select>
				<span
					class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</span>
			</div>
		</div>
	</div>

	{#if errorMessage}
		<div
			class="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
			role="alert"
		>
			{errorMessage}
		</div>
	{:else if loading || !dashboardData}
		<!-- Loading skeleton -->
		<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
			{#each [1, 2, 3, 4] as _}
				<div class="h-24 rounded-lg bg-muted/60 animate-pulse" />
			{/each}
		</div>
		<div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
			<div class="lg:col-span-3 h-64 rounded-lg bg-muted/60 animate-pulse" />
			<div class="lg:col-span-2 h-64 rounded-lg bg-muted/60 animate-pulse" />
		</div>
		<div class="flex items-center gap-2 text-sm text-muted-foreground">
			<svg
				class="size-4 animate-spin"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<circle
					class="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					stroke-width="4"
				></circle>
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				></path>
			</svg>
			<span>Loading workflow data…</span>
		</div>
	{:else}
		<!-- Metric cards -->
		<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
			<MetricCard
				title="Total Runs"
				value={dashboardData.totalRuns.toLocaleString()}
				subtitle="last 30 days"
				help="Total number of workflow runs that were triggered in the last 30 days, including success, failure, and cancelled."
				icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
			/>
			<MetricCard
				title="Success Rate"
				value="{dashboardData.successRate.toFixed(1)}%"
				subtitle="of completed runs"
				valueClass={successRateColor(dashboardData.successRate)}
				help="Percentage of completed runs that finished successfully. Cancelled and in-progress runs are not counted."
				icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 5 5L20 7"/></svg>'
			/>
			<MetricCard
				title="Avg Duration"
				value={formatDuration(dashboardData.avgDurationMs)}
				subtitle="per run"
				help="Average time from when a run started until it completed, across all completed runs in the last 30 days."
				icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
			/>
			<MetricCard
				title="Active Workflows"
				value={dashboardData.activeWorkflows.toString()}
				subtitle="total workflows"
				help="Number of workflow files in this repo that are currently active (not disabled). Each .yml workflow in .github/workflows counts as one."
				icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>'
			/>
		</div>

		<!-- DORA metrics (30-day window) -->
		{#if dashboardData.dora}
			<div class="space-y-3">
				<div class="flex items-center gap-2">
					<p class="text-sm font-medium text-muted-foreground">DORA metrics (30-day window)</p>
					<span class="group relative inline-flex flex-shrink-0">
						<button
							type="button"
							class="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
							aria-label="What are DORA metrics?"
						>
							<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
								<circle cx="12" cy="12" r="10"/>
								<path d="M12 16v-4m0-4h.01"/>
							</svg>
						</button>
						<span
							class="absolute left-full top-1/2 z-10 ml-1.5 w-72 -translate-y-1/2 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto"
							role="tooltip"
						>
							Four key DevOps Research and Assessment (DORA) metrics that measure delivery performance: how often you ship, how fast changes go live, how often deployments fail, and how quickly you recover from failures.
						</span>
					</span>
				</div>
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
					<MetricCard
						title="Deployment Frequency"
						value="{dashboardData.dora.deploymentFrequency.perWeek.toFixed(1)} / week"
						subtitle="successful runs"
						help="How often successful workflow runs complete per week. Higher values indicate more frequent delivery. One of four DORA metrics."
						icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>'
					/>
					<MetricCard
						title="Lead Time for Changes"
						value={formatDuration(dashboardData.dora.leadTimeForChangesMs)}
						subtitle={dashboardData.dora.leadTimeFromCommit
							? 'median commit → run end'
							: 'median trigger → run end'}
						help="Median time from code commit (or workflow trigger) to run completion. Shorter is better. Shown as commit→end when GitHub provides commit time; otherwise trigger→end."
						icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
					/>
					<MetricCard
						title="Change Failure Rate"
						value="{dashboardData.dora.changeFailureRate.toFixed(1)}%"
						subtitle="of completed runs"
						valueClass={failureRateColor(dashboardData.dora.changeFailureRate)}
						help="Percentage of completed runs that failed (excluding cancelled/skipped). Lower is better. DORA elite teams typically keep this under 15%."
						icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6m0-6 6 6"/></svg>'
					/>
					<MetricCard
						title="Mean Time to Recovery"
						value={formatDuration(dashboardData.dora.meanTimeToRecoveryMs)}
						subtitle={dashboardData.dora.meanTimeToRecoveryMs != null
							? 'avg time to next success after failure'
							: 'no failures'}
						help="Average time from a failed run finishing until the next successful run completes. Shorter is better. Shown only when there are failures followed by a success."
						icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>'
					/>
				</div>
			</div>
		{/if}

		<!-- Charts row -->
		<div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
			<div class="lg:col-span-3">
				<RunHistoryChart
					data={dashboardData.runTrend}
					commits={dashboardData.workflowFileCommits ?? []}
				/>
			</div>
			<div class="lg:col-span-2">
				<DurationChart metrics={dashboardData.workflowMetrics} />
			</div>
		</div>

		<!-- Workflows list -->
		<WorkflowList
			metrics={dashboardData.workflowMetrics}
			owner={dashboardData.owner}
			repo={dashboardData.repo}
		/>

		<!-- Recent runs -->
		<RecentRuns
			runs={dashboardData.recentRuns}
			owner={dashboardData.owner}
			repo={dashboardData.repo}
		/>
	{/if}
</div>
