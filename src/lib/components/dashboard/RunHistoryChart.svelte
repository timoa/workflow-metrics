<script lang="ts">
	import type { RunDataPoint } from '$lib/types/metrics';

	let { data }: { data: RunDataPoint[] } = $props();

	// Simple SVG chart - no external chart library needed for MVP
	const width = 600;
	const height = 160;
	const padding = { top: 16, right: 16, bottom: 24, left: 32 };
	const chartWidth = $derived(width - padding.left - padding.right);
	const chartHeight = $derived(height - padding.top - padding.bottom);

	const maxTotal = $derived(Math.max(...data.map((d) => d.total), 1));

	function x(i: number) {
		return padding.left + (i / (data.length - 1)) * chartWidth;
	}
	function y(val: number) {
		return padding.top + chartHeight - (val / maxTotal) * chartHeight;
	}

	const successPath = $derived(
		data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.success)}`).join(' ')
	);
	const failurePath = $derived(
		data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.failure)}`).join(' ')
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
		</div>
	</div>

	{#if data.every((d) => d.total === 0)}
		<div class="flex items-center justify-center h-32 text-muted-foreground text-sm">
			No runs in the last 30 days
		</div>
	{:else}
		<svg viewBox="0 0 {width} {height}" class="w-full" preserveAspectRatio="none">
			<defs>
				<linearGradient id="run-history-success" x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stop-color="var(--color-success)" stop-opacity="0.4" />
					<stop offset="100%" stop-color="var(--color-success)" stop-opacity="0" />
				</linearGradient>
				<linearGradient id="run-history-failure" x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stop-color="var(--color-destructive)" stop-opacity="0.4" />
					<stop offset="100%" stop-color="var(--color-destructive)" stop-opacity="0" />
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

			<!-- Fill areas with gradient (opaque at line, transparent at axis) -->
			<path
				d="{successPath} L {x(data.length - 1)} {y(0)} L {x(0)} {y(0)} Z"
				fill="url(#run-history-success)"
			/>
			<path
				d="{failurePath} L {x(data.length - 1)} {y(0)} L {x(0)} {y(0)} Z"
				fill="url(#run-history-failure)"
			/>

			<!-- Lines -->
			<path d={successPath} fill="none" stroke="var(--color-success)" stroke-width="2" />
			<path d={failurePath} fill="none" stroke="var(--color-destructive)" stroke-width="2" />

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
	{/if}
</div>
