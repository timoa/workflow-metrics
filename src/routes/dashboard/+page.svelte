<script lang="ts">
	import type { PageData } from './$types';
	import type { DashboardData } from '$lib/types/metrics';
	import { goto } from '$app/navigation';
	import MetricCard from '$lib/components/dashboard/MetricCard.svelte';
	import RunHistoryChart from '$lib/components/dashboard/RunHistoryChart.svelte';
	import DurationChart from '$lib/components/dashboard/DurationChart.svelte';
	import MinutesDonutChart from '$lib/components/dashboard/MinutesDonutChart.svelte';
	import MinutesTrendChart from '$lib/components/dashboard/MinutesTrendChart.svelte';
	import RecentRuns from '$lib/components/dashboard/RecentRuns.svelte';
	import WorkflowList from '$lib/components/dashboard/WorkflowList.svelte';
	import { formatDuration, successRateColor, failureRateColor } from '$lib/utils';

	function formatMinutes(m: number): string {
		if (m < 60) return `${m}m`;
		const h = Math.floor(m / 60);
		const min = m % 60;
		return min > 0 ? `${h}h ${min}m` : `${h}h`;
	}

	let { data }: { data: PageData } = $props();

	// Dashboard data — may hold 7-day data while 30-day loads in background
	let dashboardData = $state<DashboardData | null>(null);
	// True only during the initial load (before we have any data to show)
	let initialLoading = $state(true);
	// True when a background 30-day refresh is in progress while 7-day data is already shown
	let backgroundLoading = $state(false);
	// True when the data shown is stale (served from cache older than TTL)
	let isStale = $state(false);
	let errorMessage = $state<string | null>(null);

	// Progress state for the SSE loading bar (only used during cache-miss fetches)
	type LoadPhase = 'connecting' | 'fetching' | 'computing' | null;
	let loadPhase = $state<LoadPhase>(null);
	let progressFetched = $state(0);
	let progressTotal = $state(0);

	// Derived progress percentage (clamped so bar always moves forward)
	const progressPct = $derived(
		progressTotal > 0 ? Math.min(Math.round((progressFetched / progressTotal) * 100), 99) : 0
	);

	// Delay before showing the progress UI — avoids flash for fast cache hits
	let showProgress = $state(false);
	let progressTimer: ReturnType<typeof setTimeout> | null = null;

	function startProgressTimer() {
		progressTimer = setTimeout(() => {
			showProgress = true;
		}, 300);
	}

	function clearProgressTimer() {
		if (progressTimer) {
			clearTimeout(progressTimer);
			progressTimer = null;
		}
		showProgress = false;
	}

	/**
	 * Fetch dashboard data for a given number of days.
	 * Returns { data, isStale } or throws on error.
	 */
	async function fetchDashboardData(
		owner: string,
		name: string,
		days: number,
		signal: AbortSignal,
		onProgress?: (fetched: number, total: number) => void
	): Promise<{ data: DashboardData; isStale: boolean }> {
		const endpoint = `/api/dashboard/data?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}&days=${days}`;

		// Try SSE first for cache-miss case (gives us progress events)
		const res = await fetch(endpoint, {
			signal,
			headers: { Accept: 'text/event-stream' }
		});

		if (res.status === 401) {
			goto('/auth/login?error=' + encodeURIComponent('Session expired. Please sign in again.'));
			throw new Error('Unauthorized');
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

		const stale = res.headers.get('X-Data-Stale') === 'true';
		const contentType = res.headers.get('Content-Type') ?? '';

		// JSON response (cache hit)
		if (!contentType.includes('text/event-stream')) {
			const d = (await res.json()) as DashboardData;
			return { data: d, isStale: stale };
		}

		// SSE stream (cache miss — parse progress events)
		if (!res.body) throw new Error('No response body for SSE stream');

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			// Parse complete SSE messages (separated by double newline)
			const messages = buffer.split('\n\n');
			buffer = messages.pop() ?? '';

			for (const msg of messages) {
				if (!msg.trim()) continue;
				const eventMatch = msg.match(/^event:\s*(.+)$/m);
				const dataMatch = msg.match(/^data:\s*(.+)$/m);
				if (!eventMatch || !dataMatch) continue;

				const eventName = eventMatch[1].trim();
				let payload: unknown;
				try {
					payload = JSON.parse(dataMatch[1]);
				} catch {
					continue;
				}

				if (eventName === 'progress') {
					const p = payload as { phase: string; fetched?: number; total?: number };
					if (p.phase === 'fetching' && p.fetched !== undefined && p.total !== undefined) {
						onProgress?.(p.fetched, p.total);
					} else if (p.phase === 'computing') {
						loadPhase = 'computing';
					}
				} else if (eventName === 'complete') {
					return { data: payload as DashboardData, isStale: false };
				} else if (eventName === 'error') {
					const e = payload as { message?: string };
					throw new Error(e.message ?? 'Failed to load dashboard data.');
				}
			}
		}

		throw new Error('SSE stream ended without a complete event');
	}

	$effect(() => {
		const owner = data.selectedRepo.owner;
		const name = data.selectedRepo.name;

		initialLoading = true;
		backgroundLoading = false;
		isStale = false;
		errorMessage = null;
		dashboardData = null;
		loadPhase = 'connecting';
		progressFetched = 0;
		progressTotal = 0;
		clearProgressTimer();

		const ac = new AbortController();
		startProgressTimer();

		(async () => {
			try {
				// --- Phase 1: fast 7-day fetch ---
				loadPhase = 'connecting';
				const result7 = await fetchDashboardData(owner, name, 7, ac.signal, (fetched, total) => {
					loadPhase = 'fetching';
					progressFetched = fetched;
					progressTotal = total;
				});

				// Guard against stale effect (repo changed mid-flight)
				if (data.selectedRepo.owner !== owner || data.selectedRepo.name !== name) return;

				dashboardData = result7.data;
				isStale = result7.isStale;
				initialLoading = false;
				loadPhase = null;
				clearProgressTimer();

				// --- Phase 2: background 30-day fetch (extends the dashboard) ---
				if (!ac.signal.aborted) {
					backgroundLoading = true;
					try {
						const result30 = await fetchDashboardData(owner, name, 30, ac.signal);
						if (data.selectedRepo.owner !== owner || data.selectedRepo.name !== name) return;
						dashboardData = result30.data;
						isStale = result30.isStale;
					} catch (e: unknown) {
						if ((e as { name?: string }).name === 'AbortError') return;
						// 30-day background fetch failed — keep 7-day data, don't show error
						console.warn('[dashboard] Background 30-day fetch failed, showing 7-day data:', e);
					} finally {
						backgroundLoading = false;
					}
				}
			} catch (e: unknown) {
				if ((e as { name?: string }).name === 'AbortError') return;
				if (data.selectedRepo.owner !== owner || data.selectedRepo.name !== name) return;
				errorMessage = e instanceof Error ? e.message : 'Failed to load dashboard data.';
				initialLoading = false;
				loadPhase = null;
				clearProgressTimer();
			}
		})();

		return () => {
			ac.abort();
			clearProgressTimer();
		};
	});

	function switchRepo(fullName: string) {
		const found = data.repos.find((r) => r.full_name === fullName);
		if (found) {
			goto(`/dashboard?owner=${found.owner}&repo=${found.name}`);
		}
	}

	const timeWindowLabel = $derived(
		backgroundLoading
			? 'Last 7 days'
			: `Last ${dashboardData?.timeWindowDays ?? 30} days`
	);

	const totalRunsLabel = $derived(
		dashboardData
			? `${dashboardData.totalRuns.toLocaleString()}${dashboardData.totalRunsIsCapped ? '+' : ''}`
			: ''
	);
</script>

<svelte:head>
	<title>{data.selectedRepo.full_name} · Workflow Metrics</title>
</svelte:head>

<div class="space-y-6">
	<!-- Repo selector + header (always visible) -->
	<div class="flex items-center justify-between">
		<div class="space-y-1">
			<h1 class="text-xl font-semibold text-foreground">{data.selectedRepo.full_name}</h1>
			<div class="flex items-center gap-2">
				<p class="text-sm text-muted-foreground">GitHub Actions · {timeWindowLabel}</p>
				{#if backgroundLoading}
					<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
						<svg class="size-3 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						Loading 30-day…
					</span>
				{/if}
				{#if isStale && !backgroundLoading}
					<span
						class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
					>
						<span class="size-1.5 rounded-full bg-amber-400 animate-pulse"></span>
						Updating…
					</span>
				{/if}
			</div>
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
	{:else if initialLoading || !dashboardData}
		<!-- Loading skeleton -->
		<div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
			{#each [1, 2, 3, 4, 5] as _}
				<div class="h-24 rounded-lg bg-muted/60 animate-pulse"></div>
			{/each}
		</div>
		<div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
			<div class="lg:col-span-3 h-64 rounded-lg bg-muted/60 animate-pulse"></div>
			<div class="lg:col-span-2 h-64 rounded-lg bg-muted/60 animate-pulse"></div>
		</div>
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
			<div class="h-48 rounded-lg bg-muted/60 animate-pulse"></div>
			<div class="h-48 rounded-lg bg-muted/60 animate-pulse"></div>
		</div>

		<!-- Progress indicator (shown after 300ms delay to avoid flash on fast loads) -->
		{#if showProgress && loadPhase}
			<div class="space-y-2" role="status" aria-live="polite">
				<div class="flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{#if loadPhase === 'connecting'}
							Connecting to GitHub…
						{:else if loadPhase === 'fetching'}
							Loading workflow runs · {progressFetched.toLocaleString()} / {progressTotal.toLocaleString()}
						{:else if loadPhase === 'computing'}
							Analyzing metrics…
						{/if}
					</span>
					{#if loadPhase === 'fetching' && progressTotal > 0}
						<span class="tabular-nums">{progressPct}%</span>
					{/if}
				</div>
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
					{#if loadPhase === 'fetching' && progressTotal > 0}
						<!-- Determinate progress bar -->
						<div
							class="h-full rounded-full bg-primary transition-all duration-300 ease-out"
							style="width: {progressPct}%"
							role="progressbar"
							aria-valuenow={progressPct}
							aria-valuemin={0}
							aria-valuemax={100}
						></div>
					{:else}
						<!-- Indeterminate bar for connecting / computing phases -->
						<div class="h-full w-1/3 rounded-full bg-primary animate-[shimmer_1.5s_ease-in-out_infinite]"></div>
					{/if}
				</div>
			</div>
		{:else if !showProgress}
			<!-- Minimal spinner before the 300ms delay -->
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
		{/if}
	{:else}
		<!-- Metric cards -->
		<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
			<MetricCard
				title="Total Runs"
				value={totalRunsLabel}
				subtitle="last {dashboardData.timeWindowDays} days"
				help="Total number of workflow runs that were triggered in the last {dashboardData.timeWindowDays} days, including success, failure, and cancelled.{dashboardData.totalRunsIsCapped ? ' GitHub caps filtered results at 1,000 runs, so the real total may be higher.' : ''}"
				icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
			/>
			<MetricCard
				title="Success Rate"
				value="{dashboardData.successRate.toFixed(1)}%"
				subtitle="of runs that executed"
				valueClass={successRateColor(dashboardData.successRate)}
				help="Percentage of runs that actually executed (success or failure). Skipped and cancelled runs are excluded so the rate reflects real failures, not condition-not-met skips."
				icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 5 5L20 7"/></svg>'
			/>
			<MetricCard
				title="Avg Duration"
				value={formatDuration(dashboardData.avgDurationMs)}
				subtitle="per run"
				help="Average time from when a run started until it completed, across all completed runs in the last {dashboardData.timeWindowDays} days."
				icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
			/>
			<MetricCard
				title="Active Workflows"
				value={dashboardData.activeWorkflows.toString()}
				subtitle="total workflows"
				help="Number of workflow files in this repo that are currently active (not disabled). Each .yml workflow in .github/workflows counts as one."
				icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>'
			/>
			<MetricCard
				title="Build Minutes"
				value={formatMinutes(dashboardData.totalMinutes30d)}
				subtitle="{dashboardData.billableIsEstimate ? '~' : ''}{formatMinutes(dashboardData.billableMinutes30d)} billable{dashboardData.billableIsEstimate ? ' (partial est.)' : ''}"
				help="Raw minutes consumed in the last {dashboardData.timeWindowDays} days. Billable minutes use runner types detected from your workflow YAML files (Linux ×1, Windows ×2, macOS ×10). Workflows with dynamic runner expressions are estimated as Linux ×1."
				icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
			/>
			<MetricCard
				title="Skip Rate"
				value="{dashboardData.skipRate.toFixed(1)}%"
				subtitle="of triggered runs skipped"
				help="Percentage of workflow runs that were skipped (e.g. condition not met). High skip rates can indicate overly broad triggers or useful conditional logic."
				icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>'
			/>
			<MetricCard
				title="Total Skipped"
				value={dashboardData.totalSkipped.toLocaleString()}
				subtitle="last {dashboardData.timeWindowDays} days"
				help="Total number of runs that completed with status skipped in the repo. Skipped runs did not execute jobs (e.g. path filters or condition not met)."
				icon='<svg class="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>'
			/>
		</div>

		<!-- DORA metrics -->
		{#if dashboardData.dora}
			<div class="space-y-3">
				<div class="flex items-center gap-2">
					<p class="text-sm font-medium text-muted-foreground">
						DORA metrics ({dashboardData.timeWindowDays}-day window)
					</p>
					{#if backgroundLoading}
						<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
							<svg class="size-3 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							Loading 30-day…
						</span>
					{/if}
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

		<!-- Top skipped workflows -->
		{#if dashboardData.workflowMetrics.filter((m) => m.skippedCount > 0).length > 0}
			{@const topSkipped = [...dashboardData.workflowMetrics]
				.filter((m) => m.skippedCount > 0)
				.sort((a, b) => b.skippedCount - a.skippedCount)
				.slice(0, 8)}
			<div class="bg-card border border-border rounded-xl overflow-hidden">
				<div class="px-5 py-4 border-b border-border">
					<h3 class="text-sm font-semibold text-foreground">Top Skipped Workflows</h3>
					<p class="text-xs text-muted-foreground mt-0.5">
						Workflows with the most skipped runs (condition not met, path filters, etc.)
					</p>
				</div>
				<div class="overflow-x-auto">
					<table class="w-full text-xs">
						<thead>
							<tr class="border-b border-border bg-muted/30">
								<th class="px-5 py-2.5 text-left font-medium text-muted-foreground">Workflow</th>
								<th class="px-4 py-2.5 text-right font-medium text-muted-foreground">Skip rate</th>
								<th class="px-4 py-2.5 text-right font-medium text-muted-foreground">Skipped</th>
								<th class="px-4 py-2.5 text-right font-medium text-muted-foreground">Executed</th>
							</tr>
						</thead>
						<tbody>
							{#each topSkipped as row}
								<tr class="border-b border-border/50 hover:bg-muted/30 transition-colors">
									<td class="px-5 py-2.5">
										<a
											href="/dashboard/workflow/{row.workflowId}?owner={encodeURIComponent(dashboardData.owner)}&repo={encodeURIComponent(dashboardData.repo)}"
											class="text-foreground font-medium truncate max-w-48 block hover:underline"
											title={row.workflowName}
										>
											{row.workflowName}
										</a>
									</td>
									<td class="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
										{row.skipRate.toFixed(1)}%
									</td>
									<td class="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
										{row.skippedCount.toLocaleString()}
									</td>
									<td class="px-4 py-2.5 text-right font-medium text-foreground tabular-nums">
										{(row.successCount + row.failureCount).toLocaleString()}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- Minutes charts row -->
		{#if dashboardData.totalMinutes30d > 0}
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<MinutesDonutChart
					data={dashboardData.minutesByWorkflow}
					title="Minutes by Workflow"
					subtitle="Breakdown of build time consumed per workflow"
					totalMinutes={dashboardData.totalMinutes30d}
				totalBillableMinutes={dashboardData.billableMinutes30d}
				totalLabel="raw mins"
				billableIsEstimate={dashboardData.billableIsEstimate}
				/>
				<MinutesTrendChart
					data={dashboardData.minutesTrend}
					title="Daily Build Minutes"
					subtitle="Raw minutes consumed per day over the last {dashboardData.timeWindowDays} days"
				/>
			</div>

			<!-- Efficiency insights -->
			<div class="space-y-3">
				<h2 class="text-sm font-medium text-muted-foreground">Efficiency Insights</h2>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
					<!-- Most expensive workflow -->
					{#if dashboardData.minutesByWorkflow.length > 0}
						{@const top = dashboardData.minutesByWorkflow[0]}
						<div class="bg-card border border-border rounded-xl p-4 space-y-1">
							<p class="text-xs text-muted-foreground">Most Expensive Workflow</p>
							<p class="text-sm font-semibold text-foreground truncate" title={top.workflowName}>
								{top.workflowName}
							</p>
							<p class="text-xs text-muted-foreground">
								{formatMinutes(top.minutes)} raw · {top.percentage}% of total
							</p>
						</div>
					{/if}

					<!-- Wasted minutes -->
					<div class="bg-card border border-border rounded-xl p-4 space-y-1">
						<p class="text-xs text-muted-foreground">Wasted on Failures</p>
						<p class="text-sm font-semibold {dashboardData.wastedMinutes > 0 ? 'text-destructive' : 'text-green-500'}">
							{formatMinutes(dashboardData.wastedMinutes)}
						</p>
						<p class="text-xs text-muted-foreground">
							{dashboardData.totalMinutes30d > 0
								? Math.round((dashboardData.wastedMinutes / dashboardData.totalMinutes30d) * 100)
								: 0}% of total minutes
						</p>
					</div>

					<!-- Top branch -->
					{#if dashboardData.topBranchByMinutes}
						<div class="bg-card border border-border rounded-xl p-4 space-y-1">
							<p class="text-xs text-muted-foreground">Costliest Branch</p>
							<p class="text-sm font-semibold text-foreground font-mono truncate" title={dashboardData.topBranchByMinutes.branch}>
								{dashboardData.topBranchByMinutes.branch}
							</p>
							<p class="text-xs text-muted-foreground">
								{formatMinutes(dashboardData.topBranchByMinutes.minutes)} consumed
							</p>
						</div>
					{/if}

					<!-- Avg minutes per run -->
					<div class="bg-card border border-border rounded-xl p-4 space-y-1">
						<p class="text-xs text-muted-foreground">Avg per Run</p>
						<p class="text-sm font-semibold text-foreground">
							{dashboardData.totalRuns > 0
								? formatMinutes(Math.round(dashboardData.totalMinutes30d / dashboardData.totalRuns))
								: '—'}
						</p>
						<p class="text-xs text-muted-foreground">
							across {totalRunsLabel} runs
						</p>
					</div>
				</div>

				<!-- Run frequency × duration table -->
				{#if dashboardData.workflowMetrics.filter((m) => m.totalRuns > 0).length > 0}
					<div class="bg-card border border-border rounded-xl overflow-hidden">
						<div class="px-5 py-4 border-b border-border">
							<h3 class="text-sm font-semibold text-foreground">Frequency × Duration</h3>
							<p class="text-xs text-muted-foreground mt-0.5">Workflows sorted by estimated daily minutes consumed</p>
						</div>
						<div class="overflow-x-auto">
							<table class="w-full text-xs">
								<thead>
									<tr class="border-b border-border bg-muted/30">
										<th class="px-5 py-2.5 text-left font-medium text-muted-foreground">Workflow</th>
										<th class="px-4 py-2.5 text-right font-medium text-muted-foreground">Runs / day</th>
										<th class="px-4 py-2.5 text-right font-medium text-muted-foreground">Avg duration</th>
										<th class="px-4 py-2.5 text-right font-medium text-muted-foreground">Est. daily mins</th>
									</tr>
								</thead>
								<tbody>
									{#each [...dashboardData.workflowMetrics]
										.filter((m) => m.totalRuns > 0)
										.map((m) => {
											const runsPerDay = m.totalRuns / (dashboardData?.timeWindowDays ?? 30);
											const avgMins = Math.ceil(m.avgDurationMs / 60_000);
											const dailyMins = Math.round(runsPerDay * avgMins);
											return { ...m, runsPerDay, dailyMins };
										})
										.sort((a, b) => b.dailyMins - a.dailyMins)
										.slice(0, 8) as row}
										<tr class="border-b border-border/50 hover:bg-muted/30 transition-colors">
											<td class="px-5 py-2.5 text-foreground font-medium truncate max-w-48" title={row.workflowName}>
												{row.workflowName}
											</td>
											<td class="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
												{row.runsPerDay.toFixed(1)}
											</td>
											<td class="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
												{formatDuration(row.avgDurationMs)}
											</td>
											<td class="px-4 py-2.5 text-right font-medium text-foreground tabular-nums">
												{row.dailyMins > 0 ? formatMinutes(row.dailyMins) : '<1m'}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			</div>
		{/if}

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

<style>
	@keyframes shimmer {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(400%); }
	}
</style>
