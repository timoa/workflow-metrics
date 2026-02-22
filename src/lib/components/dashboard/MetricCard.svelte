<script lang="ts">
	interface Props {
		title: string;
		value: string;
		subtitle?: string;
		trend?: number | null;
		icon?: string;
	}

	let { title, value, subtitle, trend, icon }: Props = $props();

	const trendLabel = $derived(
		trend == null ? null : trend >= 0 ? `+${trend.toFixed(1)}%` : `${trend.toFixed(1)}%`
	);
	const trendPositive = $derived(trend != null && trend >= 0);
</script>

<div class="bg-card border border-border rounded-xl p-5 space-y-3">
	<div class="flex items-center justify-between">
		<p class="text-sm font-medium text-muted-foreground">{title}</p>
		{#if icon}
			<div class="size-8 rounded-lg bg-muted flex items-center justify-center">
				{@html icon}
			</div>
		{/if}
	</div>

	<div class="space-y-1">
		<p class="text-2xl font-bold text-foreground">{value}</p>
		<div class="flex items-center gap-2">
			{#if trendLabel}
				<span class="text-xs font-medium {trendPositive ? 'text-green-500' : 'text-red-500'}">
					{trendLabel}
				</span>
			{/if}
			{#if subtitle}
				<span class="text-xs text-muted-foreground">{subtitle}</span>
			{/if}
		</div>
	</div>
</div>
