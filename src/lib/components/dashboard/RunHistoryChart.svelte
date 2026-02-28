<script lang="ts">
	import type { RunDataPoint, WorkflowFileCommit } from '$lib/types/metrics';

	let { data, commits = [] }: { data: RunDataPoint[]; commits?: WorkflowFileCommit[] } = $props();

	// Hover state: index into data for tooltip
	let hoveredIndex = $state<number | null>(null);
	let chartRef = $state<HTMLDivElement | null>(null);

	// Simple SVG chart - no external chart library needed for MVP
	const width = 600;
	const height = 160;
	const padding = { top: 16, right: 16, bottom: 24, left: 32 };
	const chartWidth = $derived(width - padding.left - padding.right);
	const chartHeight = $derived(height - padding.top - padding.bottom);

	const maxTotal = $derived(Math.max(...data.map((d) => d.total), 1));

	function x(i: number) {
		return padding.left + (i / Math.max(data.length - 1, 1)) * chartWidth;
	}
	function y(val: number) {
		return padding.top + chartHeight - (val / maxTotal) * chartHeight;
	}

	// Stacked: failure at bottom, skipped in middle, success on top (drawn last)
	const failurePath = $derived(
		data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.failure)}`).join(' ')
	);
	const skippedPath = $derived(
		data
			.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.failure + d.skipped)}`)
			.join(' ')
	);
	const successPath = $derived(
		data
			.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.failure + d.skipped + d.success)}`)
			.join(' ')
	);
	// Reversed paths for stacked band fills — all 'L' so they continue from the forward path
	const failurePathReversed = $derived(
		data
			.map((_, i) => {
				const j = data.length - 1 - i;
				return `L ${x(j)} ${y(data[j].failure)}`;
			})
			.join(' ')
	);
	const skippedPathReversed = $derived(
		data
			.map((_, i) => {
				const j = data.length - 1 - i;
				const d = data[j];
				return `L ${x(j)} ${y(d.failure + d.skipped)}`;
			})
			.join(' ')
	);

	// Format x-axis dates to show only a few labels
	const xLabels = $derived(
		data
			.filter((_, i) => i % Math.ceil(data.length / 7) === 0 || i === data.length - 1)
			.map((d) => ({
				date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
				x: x(data.indexOf(d))
			}))
	);

	const hoveredPoint = $derived(hoveredIndex != null ? data[hoveredIndex] : null);
	const hoveredX = $derived(hoveredIndex != null ? x(hoveredIndex) : 0);

	// Commit markers: group by date, compute x from date (only for dates in chart range)
	const commitMarkers = $derived.by(() => {
		if (!commits.length || !data.length) return [];
		const minDate = data[0].date;
		const maxDate = data[data.length - 1].date;
		const dateToIndex = new Map<string, number>();
		data.forEach((d, i) => dateToIndex.set(d.date, i));
		const byDate = new Map<string, WorkflowFileCommit[]>();
		for (const c of commits) {
			if (c.date < minDate || c.date > maxDate) continue;
			if (!byDate.has(c.date)) byDate.set(c.date, []);
			byDate.get(c.date)!.push(c);
		}
		return Array.from(byDate.entries()).map(([date, list]) => {
			const xi = dateToIndex.get(date) ?? data.length - 1;
			return { x: x(xi), date, commits: list };
		});
	});

	const hoveredMarker = $derived(
		hoveredIndex != null && commitMarkers.length
			? commitMarkers.find((m) => m.date === data[hoveredIndex]?.date) ?? null
			: null
	);

	function handleChartMouseMove(e: MouseEvent) {
		const el = chartRef;
		if (!el || data.length === 0) return;
		const rect = el.getBoundingClientRect();
		const viewX = (e.clientX - rect.left) / rect.width;
		const viewBoxX = viewX * width;
		const dataIndex = Math.round(
			Math.max(0, Math.min(data.length - 1, ((viewBoxX - padding.left) / chartWidth) * (data.length - 1)))
		);
		hoveredIndex = dataIndex;
	}

	function handleChartMouseLeave() {
		hoveredIndex = null;
	}

	function formatDate(dateStr: string) {
		return new Date(dateStr).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="bg-card border border-border rounded-xl p-5 space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-semibold text-foreground">Run History (30 days)</h3>
		<div class="flex items-center gap-4 text-xs text-muted-foreground">
			<span class="flex items-center gap-1.5">
				<span class="size-2 rounded-full bg-success inline-block"></span> Success
			</span>
			<span class="flex items-center gap-1.5">
				<span class="size-2 rounded-full bg-destructive inline-block"></span> Failure
			</span>
			<span class="flex items-center gap-1.5">
				<span class="size-2 rounded-full bg-muted-foreground inline-block"></span> Skipped
			</span>
			{#if commits.length > 0}
				<span class="flex items-center gap-1.5" title="Commits that changed .github/workflows">
					<span
						class="inline-block w-3 h-0.5 rounded-full bg-[var(--color-chart-2)] shadow-[0_0_6px_var(--color-chart-2)]"
					></span> Workflow changes
				</span>
			{/if}
		</div>
	</div>

	{#if data.every((d) => d.total === 0)}
		<div class="flex items-center justify-center h-32 text-muted-foreground text-sm">
			No runs in the last 30 days
		</div>
	{:else}
		<div
			class="relative w-full cursor-crosshair"
			bind:this={chartRef}
			onmousemove={handleChartMouseMove}
			onmouseleave={handleChartMouseLeave}
			role="img"
			aria-label="Run history chart. Hover over the chart to see daily counts."
		>
			<svg viewBox="0 0 {width} {height}" class="w-full block" preserveAspectRatio="none">
				<defs>
					<linearGradient id="run-history-success" x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%" stop-color="var(--color-success)" stop-opacity="0.4" />
						<stop offset="100%" stop-color="var(--color-success)" stop-opacity="0" />
					</linearGradient>
					<linearGradient id="run-history-failure" x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%" stop-color="var(--color-destructive)" stop-opacity="0.4" />
						<stop offset="100%" stop-color="var(--color-destructive)" stop-opacity="0" />
					</linearGradient>
					<linearGradient id="run-history-skipped" x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%" stop-color="hsl(var(--muted-foreground))" stop-opacity="0.4" />
						<stop offset="100%" stop-color="hsl(var(--muted-foreground))" stop-opacity="0" />
					</linearGradient>
				</defs>
				<!-- Grid lines -->
				{#each [0, 0.25, 0.5, 0.75, 1] as pct}
					<line
						x1={padding.left}
						y1={padding.top + chartHeight * (1 - pct)}
						x2={width - padding.right}
						y2={padding.top + chartHeight * (1 - pct)}
						stroke="currentColor"
						class="text-border"
						stroke-width="0.5"
						stroke-dasharray="4 4"
					/>
				{/each}

			<!-- Stacked areas: failure (bottom), skipped band, success band (top) -->
			<path
				d="{failurePath} L {x(data.length - 1)} {y(0)} L {x(0)} {y(0)} Z"
				fill="url(#run-history-failure)"
			/>
			<path
				d="{skippedPath} {failurePathReversed} Z"
				fill="url(#run-history-skipped)"
			/>
			<path
				d="{successPath} {skippedPathReversed} Z"
				fill="url(#run-history-success)"
			/>
			<!-- Lines drawn in stacking order; success last so it renders on top -->
			<path d={failurePath} fill="none" stroke="var(--color-destructive)" stroke-width="2" />
			<path
				d={skippedPath}
				fill="none"
				stroke="hsl(var(--muted-foreground))"
				stroke-width="2"
			/>
			<path d={successPath} fill="none" stroke="var(--color-success)" stroke-width="2" />

				<!-- Commit markers (workflow file changes): dashed vertical line so it’s clearly visible -->
				{#each commitMarkers as marker}
					<line
						x1={marker.x}
						y1={padding.top}
						x2={marker.x}
						y2={padding.top + chartHeight}
						stroke="var(--color-chart-2)"
						stroke-width="2"
						stroke-dasharray="6 4"
						stroke-linecap="round"
						stroke-opacity="0.9"
					/>
				{/each}

				<!-- Hover vertical reference line -->
				{#if hoveredIndex != null}
					<line
						x1={hoveredX}
						y1={padding.top}
						x2={hoveredX}
						y2={padding.top + chartHeight}
						stroke="currentColor"
						class="text-foreground/40"
						stroke-width="1"
						stroke-dasharray="3 3"
					/>
				{/if}

				<!-- X-axis labels -->
				{#each xLabels as label}
					<text
						x={label.x}
						y={height - 4}
						text-anchor="middle"
						font-size="9"
						class="fill-muted-foreground"
					>
						{label.date}
					</text>
				{/each}
			</svg>

			<!-- Tooltip (horizontal position matches SVG viewBox so it stays aligned) -->
			{#if hoveredPoint && chartRef}
				<div
					class="pointer-events-none absolute left-0 top-0 z-10 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg"
					style="
						left: {(hoveredX / width) * 100}%;
						transform: translate(-50%, calc(-100% - 8px));
					"
				>
					<div class="font-medium text-foreground">{formatDate(hoveredPoint.date)}</div>
					<div class="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
						<span class="flex items-center gap-1.5">
							<span class="size-2 rounded-full bg-success"></span>
							Success: {hoveredPoint.success}
						</span>
						<span class="flex items-center gap-1.5">
							<span class="size-2 rounded-full bg-destructive"></span>
							Failure: {hoveredPoint.failure}
						</span>
						{#if hoveredPoint.skipped > 0}
							<span class="flex items-center gap-1.5">
								<span class="size-2 rounded-full bg-muted-foreground"></span>
								Skipped: {hoveredPoint.skipped}
							</span>
						{/if}
						{#if hoveredPoint.cancelled > 0}
							<span class="col-span-2 flex items-center gap-1.5">
								<span class="size-2 rounded-full bg-muted-foreground"></span>
								Cancelled: {hoveredPoint.cancelled}
							</span>
						{/if}
						<span class="col-span-2 border-t border-border pt-1 mt-0.5 font-medium text-foreground">
							Total: {hoveredPoint.total} run{hoveredPoint.total !== 1 ? 's' : ''}
						</span>
						{#if hoveredMarker}
							<div class="col-span-2 border-t border-border pt-1 mt-0.5 space-y-1">
								<span class="text-primary font-medium">Workflow file changes</span>
								{#each hoveredMarker.commits as commit}
									<div class="text-muted-foreground">
										<span class="font-mono text-foreground">{commit.sha}</span>
										{commit.message ? ` — ${commit.message}` : ''}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
