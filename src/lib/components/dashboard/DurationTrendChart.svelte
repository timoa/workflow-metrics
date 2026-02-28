<script lang="ts">
	import type { DurationDataPoint } from '$lib/types/metrics';
	import { formatDuration } from '$lib/utils';

	let { data }: { data: DurationDataPoint[] } = $props();

	const width = 1000;
	const height = 120;
	const padding = { top: 16, right: 16, bottom: 28, left: 52 };
	const chartWidth = $derived(width - padding.left - padding.right);
	const chartHeight = $derived(height - padding.top - padding.bottom);

	const completed = $derived(data.filter((d) => d.durationMs > 0));
	const maxDur = $derived(Math.max(...completed.map((d) => d.durationMs), 1));
	const minDur = $derived(Math.min(...completed.map((d) => d.durationMs), 0));

	function x(i: number) {
		if (completed.length <= 1) return padding.left + chartWidth / 2;
		return padding.left + (i / (completed.length - 1)) * chartWidth;
	}
	function y(val: number) {
		return padding.top + chartHeight - ((val - minDur) / (maxDur - minDur || 1)) * chartHeight;
	}

	const linePath = $derived(
		completed.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.durationMs)}`).join(' ')
	);

</script>

<div class="bg-card border border-border rounded-xl p-5 space-y-4">
	<h3 class="text-sm font-semibold text-foreground">Duration Trend</h3>

	{#if completed.length < 2}
		<div class="flex items-center justify-center h-32 text-muted-foreground text-sm">
			Not enough data to show trend
		</div>
	{:else}
		<svg viewBox="0 0 {width} {height}" class="w-full block" preserveAspectRatio="none">
			<defs>
				<linearGradient id="duration-trend-fill" x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.35" />
					<stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0" />
				</linearGradient>
			</defs>
			<!-- Grid lines + y-axis labels -->
			{#each [0, 0.25, 0.5, 0.75, 1] as pct (pct)}
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
				<text
					x={padding.left - 4}
					y={padding.top + chartHeight * (1 - pct) + 3}
					text-anchor="end"
					font-size="8"
					class="fill-muted-foreground"
				>
					{formatDuration(minDur + (maxDur - minDur) * pct)}
				</text>
			{/each}

			<!-- Fill with gradient (opaque at line, transparent at axis) -->
			<path
				d="{linePath} L {x(completed.length - 1)} {padding.top + chartHeight} L {padding.left} {padding.top + chartHeight} Z"
				fill="url(#duration-trend-fill)"
			/>

			<!-- Line -->
			<path
				d={linePath}
				fill="none"
				stroke="var(--color-primary)"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>

			<!-- Data points colored by conclusion -->
			{#each completed as d, i (d.startedAt)}
				<circle
					cx={x(i)}
					cy={y(d.durationMs)}
					r="3"
					fill={d.conclusion === 'success'
						? 'rgb(34 197 94)'
						: d.conclusion === 'failure'
							? 'rgb(239 68 68)'
							: 'rgb(161 161 170)'}
				/>
			{/each}
		</svg>

		<div class="flex items-center gap-4 text-xs text-muted-foreground">
			<span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-green-500 inline-block"></span> Success</span>
			<span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-red-500 inline-block"></span> Failure</span>
		</div>
	{/if}
</div>
