<script lang="ts">
	import type { MinutesDataPoint } from '$lib/types/metrics';

	let {
		data,
		title = 'Minutes Consumed',
		subtitle = ''
	}: {
		data: MinutesDataPoint[];
		title?: string;
		subtitle?: string;
	} = $props();

	const CHART_HEIGHT = 120;

	const maxMinutes = $derived(Math.max(...data.map((d) => d.minutes), 1));

	function formatMinutes(m: number): string {
		if (m < 60) return `${m}m`;
		const h = Math.floor(m / 60);
		const min = m % 60;
		return min > 0 ? `${h}h ${min}m` : `${h}h`;
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// Show axis labels every ~7 bars
	function showLabel(index: number, total: number): boolean {
		if (total <= 7) return true;
		if (total <= 14) return index % 2 === 0;
		return index % 7 === 0 || index === total - 1;
	}

	// Tooltip
	let hoveredIndex = $state<number | null>(null);
	let tooltipX = $state(0);
	let chartRef = $state<HTMLDivElement | null>(null);

	function onBarEnter(index: number, e: MouseEvent) {
		hoveredIndex = index;
		if (chartRef) {
			const rect = chartRef.getBoundingClientRect();
			tooltipX = e.clientX - rect.left;
		}
	}

	function onBarLeave() {
		hoveredIndex = null;
	}

	const hoveredPoint = $derived(hoveredIndex !== null ? data[hoveredIndex] : null);
	const totalMinutes = $derived(data.reduce((sum, d) => sum + d.minutes, 0));
</script>

<div class="bg-card border border-border rounded-xl p-5 space-y-4">
	<div class="flex items-start justify-between">
		<div>
			<h3 class="text-sm font-semibold text-foreground">{title}</h3>
			{#if subtitle}
				<p class="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
			{/if}
		</div>
		<span class="text-xs text-muted-foreground tabular-nums">{formatMinutes(totalMinutes)} total</span>
	</div>

	{#if data.length === 0 || totalMinutes === 0}
		<div class="flex items-center justify-center text-muted-foreground text-sm" style="height: {CHART_HEIGHT + 20}px;">
			No data available
		</div>
	{:else}
		<div class="relative" bind:this={chartRef}>
			<!-- Tooltip -->
			{#if hoveredPoint}
				<div
					class="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md whitespace-nowrap"
					style="left: {tooltipX}px;"
				>
					<p class="font-medium">{formatDate(hoveredPoint.date)}</p>
					<p class="text-muted-foreground">{formatMinutes(hoveredPoint.minutes)}</p>
				</div>
			{/if}

			<!-- Bar chart -->
			<div
				class="flex items-end w-full gap-0.5"
				style="height: {CHART_HEIGHT}px;"
				role="img"
				aria-label={title}
			>
				{#each data as point, i (point.date)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="flex-1 flex flex-col justify-end cursor-pointer"
						style="height: 100%;"
						onmouseenter={(e) => onBarEnter(i, e)}
						onmouseleave={onBarLeave}
					>
						<div
							class="w-full rounded-t-sm bg-primary transition-all duration-150"
							class:opacity-100={hoveredIndex === null || hoveredIndex === i}
							class:opacity-40={hoveredIndex !== null && hoveredIndex !== i}
							style="height: {point.minutes > 0 ? Math.max((point.minutes / maxMinutes) * CHART_HEIGHT, 2) : 0}px;"
						></div>
					</div>
				{/each}
			</div>

			<!-- X-axis labels -->
			<div class="flex w-full mt-1.5" aria-hidden="true">
				{#each data as point, i (point.date)}
					<div class="flex-1 flex justify-center">
						{#if showLabel(i, data.length)}
							<span class="text-[10px] text-muted-foreground whitespace-nowrap">
								{new Date(point.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
							</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
