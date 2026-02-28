<script lang="ts">
	import type { WorkflowMinutesShare, JobMinutesShare, RunnerType } from '$lib/types/metrics';

	type Segment = {
		name: string;
		minutes: number;
		billableMinutes: number;
		percentage: number;
		/** Only present for workflow segments where runner info was parsed from YAML. */
		runnerType?: RunnerType;
		runnerDetected?: boolean;
	};

	let {
		data,
		title,
		subtitle = '',
		totalMinutes,
		totalBillableMinutes,
		totalLabel = 'total',
		billableIsEstimate = false
	}: {
		data: WorkflowMinutesShare[] | JobMinutesShare[];
		title: string;
		subtitle?: string;
		totalMinutes: number;
		/** Total billable minutes — shown in centre and legend when provided. */
		totalBillableMinutes?: number;
		totalLabel?: string;
		/** When true, marks billable figures with ~ to indicate they are estimates. */
		billableIsEstimate?: boolean;
	} = $props();

	// Helper to get display name with fallback
	function getDisplayName(d: WorkflowMinutesShare | JobMinutesShare): string {
		if ('jobName' in d) return d.jobName;

		// For workflows, check if name looks like a numeric ID
		const name = d.workflowName;
		const isNumericId = /^Workflow\s+\d+$/.test(name);

		if (isNumericId && d.workflowPath) {
			// Extract filename from path
			const filename = d.workflowPath.split('/').pop();
			if (filename) return filename;
		}

		// Fallback if numeric ID but no path, or if name is empty
		if (isNumericId || !name) {
			if (d.workflowPath) {
				const filename = d.workflowPath.split('/').pop();
				if (filename) return filename;
			}
			return 'Unknown Workflow';
		}

		return name;
	}

	// Normalise union type to a common shape
	const segments = $derived<Segment[]>(
		(data as Array<WorkflowMinutesShare | JobMinutesShare>).map((d) => ({
			name: getDisplayName(d),
			minutes: d.minutes,
			billableMinutes: d.billableMinutes,
			percentage: d.percentage,
			runnerType: 'runnerType' in d ? d.runnerType : undefined,
			runnerDetected: 'runnerDetected' in d ? d.runnerDetected : undefined
		}))
	);

	// Count how many workflow segments have confirmed runner detection
	const detectedCount = $derived(segments.filter((s) => s.runnerDetected === true).length);
	const workflowSegmentCount = $derived(segments.filter((s) => s.runnerDetected !== undefined).length);

	function runnerLabel(rt: RunnerType, detected: boolean): string {
		if (!detected) return '~linux ×1';
		switch (rt) {
			case 'ubuntu': return 'linux ×1';
			case 'windows': return 'win ×2';
			case 'macos': return 'macos ×10';
			case 'mixed': return 'mixed';
			default: return '~linux ×1';
		}
	}

	function runnerBadgeClass(rt: RunnerType, detected: boolean): string {
		if (!detected) return 'bg-sky-100/50 text-sky-600/70 dark:bg-sky-900/20 dark:text-sky-400/60';
		switch (rt) {
			case 'ubuntu': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
			case 'windows': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
			case 'macos': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
			case 'mixed': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
			default: return 'bg-sky-100/50 text-sky-600/70 dark:bg-sky-900/20 dark:text-sky-400/60';
		}
	}

	const showBillable = $derived(
		totalBillableMinutes !== undefined && totalBillableMinutes !== totalMinutes
	);

	// A palette of distinct, theme-friendly colours
	const COLORS = [
		'#3b82f6', // blue
		'#22c55e', // green
		'#f59e0b', // amber
		'#a855f7', // purple
		'#ef4444', // red
		'#06b6d4', // cyan
		'#ec4899', // pink
		'#14b8a6', // teal
		'#f97316', // orange
		'#84cc16'  // lime
	];

	// SVG donut parameters
	const CX = 80;
	const CY = 80;
	const R = 60;
	const STROKE_WIDTH = 24;
	const CIRCUMFERENCE = 2 * Math.PI * R;
	const GAP = 2; // gap between segments in degrees

	type DonutSegment = {
		name: string;
		minutes: number;
		billableMinutes: number;
		percentage: number;
		color: string;
		dashArray: string;
		dashOffset: number;
		runnerType?: RunnerType;
		runnerDetected?: boolean;
	};

	const donutSegments = $derived(buildDonutSegments(segments));

	function buildDonutSegments(segs: Segment[]): DonutSegment[] {
		if (segs.length === 0) return [];
		const total = segs.reduce((sum, s) => sum + s.minutes, 0);
		if (total === 0) return [];

		const result: DonutSegment[] = [];
		let cumulativeDegrees = 0;

		for (let i = 0; i < segs.length; i++) {
			const seg = segs[i];
			const pct = seg.minutes / total;
			const degrees = pct * 360;
			const arcLength = pct * CIRCUMFERENCE - (GAP / 360) * CIRCUMFERENCE;
			const offset = -(cumulativeDegrees / 360) * CIRCUMFERENCE;

			result.push({
				name: seg.name,
				minutes: seg.minutes,
				billableMinutes: seg.billableMinutes,
				percentage: seg.percentage,
				color: COLORS[i % COLORS.length],
				dashArray: `${Math.max(arcLength, 0)} ${CIRCUMFERENCE}`,
				dashOffset: offset,
				runnerType: seg.runnerType,
				runnerDetected: seg.runnerDetected
			});

			cumulativeDegrees += degrees;
		}
		return result;
	}

	function formatMinutes(m: number): string {
		if (m < 60) return `${m}m`;
		const h = Math.floor(m / 60);
		const min = m % 60;
		return min > 0 ? `${h}h ${min}m` : `${h}h`;
	}

	// Tooltip state
	let hoveredIndex = $state<number | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	function onSegmentEnter(index: number, e: MouseEvent) {
		hoveredIndex = index;
		tooltipX = e.offsetX + 12;
		tooltipY = e.offsetY - 8;
	}

	function onSegmentMove(e: MouseEvent) {
		tooltipX = e.offsetX + 12;
		tooltipY = e.offsetY - 8;
	}

	function onSegmentLeave() {
		hoveredIndex = null;
	}

	const activeSegment = $derived(hoveredIndex !== null ? donutSegments[hoveredIndex] : null);
</script>

<div class="bg-card border border-border rounded-xl p-5 space-y-4">
	<div>
		<h3 class="text-sm font-semibold text-foreground">{title}</h3>
		{#if subtitle}
			<p class="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
		{/if}
	</div>

	{#if segments.length === 0 || totalMinutes === 0}
		<div class="flex items-center justify-center h-40 text-muted-foreground text-sm">
			No data available
		</div>
	{:else}
		<div class="flex items-start gap-6">
			<!-- SVG donut -->
			<div class="relative flex-shrink-0" style="width: 160px; height: 160px;">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<svg
					viewBox="0 0 160 160"
					width="160"
					height="160"
					role="img"
					aria-label={title}
					onmousemove={onSegmentMove}
					onmouseleave={onSegmentLeave}
				>
					<!-- Background ring -->
					<circle
						cx={CX}
						cy={CY}
						r={R}
						fill="none"
						stroke="currentColor"
						stroke-width={STROKE_WIDTH}
						class="text-muted/40"
					/>
					<!-- Segments -->
					{#each donutSegments as seg, i}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<circle
							cx={CX}
							cy={CY}
							r={R}
							fill="none"
							stroke={seg.color}
							stroke-width={hoveredIndex === i ? STROKE_WIDTH + 3 : STROKE_WIDTH}
							stroke-dasharray={seg.dashArray}
							stroke-dashoffset={seg.dashOffset}
							stroke-linecap="butt"
							transform="rotate(-90, {CX}, {CY})"
							style="transition: stroke-width 0.15s ease; cursor: pointer;"
							onmouseenter={(e) => onSegmentEnter(i, e)}
						/>
					{/each}
				<!-- Center label — show billable if it differs from raw -->
				{#if showBillable && totalBillableMinutes !== undefined}
					<text
						x={CX}
						y={CY - 16}
						text-anchor="middle"
						dominant-baseline="middle"
						class="fill-foreground"
						style="font-size: 12px; font-weight: 600;"
					>
						{billableIsEstimate ? '~' : ''}{formatMinutes(totalBillableMinutes)}
					</text>
					<text
						x={CX}
						y={CY - 3}
						text-anchor="middle"
						dominant-baseline="middle"
						class="fill-muted-foreground"
						style="font-size: 9px;"
					>
						billable
					</text>
					<text
						x={CX}
						y={CY + 10}
						text-anchor="middle"
						dominant-baseline="middle"
						class="fill-muted-foreground"
						style="font-size: 9px;"
					>
						{formatMinutes(totalMinutes)} raw
					</text>
				{:else}
					<text
						x={CX}
						y={CY - 8}
						text-anchor="middle"
						dominant-baseline="middle"
						class="fill-foreground"
						style="font-size: 14px; font-weight: 600;"
					>
						{formatMinutes(totalMinutes)}
					</text>
					<text
						x={CX}
						y={CY + 10}
						text-anchor="middle"
						dominant-baseline="middle"
						class="fill-muted-foreground"
						style="font-size: 9px;"
					>
						{totalLabel}
					</text>
				{/if}
				</svg>

		<!-- Tooltip -->
		{#if activeSegment}
			{@const tooltipEstimated = activeSegment.runnerDetected !== undefined ? !activeSegment.runnerDetected : billableIsEstimate}
			<div
				class="pointer-events-none absolute z-10 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
				style="left: {tooltipX}px; top: {tooltipY}px; max-width: 180px;"
			>
				<p class="font-medium truncate">{activeSegment.name}</p>
				{#if activeSegment.runnerType !== undefined}
					<p class="text-muted-foreground">{runnerLabel(activeSegment.runnerType, activeSegment.runnerDetected ?? false)}</p>
				{/if}
				<p class="text-muted-foreground">{formatMinutes(activeSegment.minutes)} raw · {activeSegment.percentage}%</p>
				{#if activeSegment.billableMinutes !== activeSegment.minutes}
					<p class="text-muted-foreground">{tooltipEstimated ? '~' : ''}{formatMinutes(activeSegment.billableMinutes)} billable</p>
				{/if}
			</div>
		{/if}
			</div>

	<!-- Legend -->
	<div class="flex-1 min-w-0 space-y-2.5 py-1">
		{#each donutSegments.slice(0, 8) as seg}
			{@const isEstimated = seg.runnerDetected !== undefined ? !seg.runnerDetected : billableIsEstimate}
			<div class="flex items-start gap-2 text-xs min-w-0">
				<span
					class="size-2.5 rounded-full flex-shrink-0 mt-0.5"
					style="background-color: {seg.color};"
				></span>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-1.5 min-w-0">
						<p class="truncate text-foreground font-medium leading-tight" title={seg.name}>{seg.name}</p>
					{#if seg.runnerType !== undefined}
						<span
							class="shrink-0 inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium leading-none {runnerBadgeClass(seg.runnerType, seg.runnerDetected ?? false)}"
						>
							{runnerLabel(seg.runnerType, seg.runnerDetected ?? false)}
						</span>
					{/if}
					</div>
					<p class="text-muted-foreground tabular-nums leading-tight">
						{formatMinutes(seg.minutes)} raw
						{#if seg.billableMinutes !== seg.minutes}
							· {isEstimated ? '~' : ''}{formatMinutes(seg.billableMinutes)} billable
						{/if}
					</p>
				</div>
				<span class="text-muted-foreground flex-shrink-0 tabular-nums text-[10px]">
					{seg.percentage}%
				</span>
			</div>
		{/each}
		{#if donutSegments.length > 8}
			<p class="text-xs text-muted-foreground pl-4">+{donutSegments.length - 8} more</p>
		{/if}
	</div>
</div>

<!-- Billing note -->
<p class="text-xs text-muted-foreground border-t border-border pt-3">
	{#if workflowSegmentCount > 0}
		{#if detectedCount === workflowSegmentCount}
			Runner types detected from workflow files (Linux ×1 · Windows ×2 · macOS ×10).
		{:else if detectedCount === 0}
			Could not detect runner types — billable estimated as Linux ×1. Click a workflow for job-level data.
		{:else}
			Runner detected for {detectedCount}/{workflowSegmentCount} workflows. Remaining marked ~ (assumed Linux ×1).
		{/if}
	{:else if billableIsEstimate}
		Billable computed from runner labels on sampled jobs (Linux ×1, Windows ×2, macOS ×10).
	{:else}
		Billable minutes computed from runner labels (Linux ×1, Windows ×2, macOS ×10).
	{/if}
</p>
	{/if}
</div>
