<script lang="ts">
	interface Props {
		title: string;
		value: string;
		subtitle?: string;
		trend?: number | null;
		icon?: string;
		/** Optional Tailwind class for the value (e.g. success rate color). */
		valueClass?: string;
		/** Optional description shown in a tooltip when hovering/focusing the help icon. */
		help?: string;
		/** Optional additional classes for the card container. */
		class?: string;
	}

	let { title, value, subtitle, trend, icon, valueClass, help, class: className = '' }: Props = $props();

	const trendLabel = $derived(
		trend == null ? null : trend >= 0 ? `+${trend.toFixed(1)}%` : `${trend.toFixed(1)}%`
	);
	const trendPositive = $derived(trend != null && trend >= 0);
</script>

<div class="bg-card border border-border rounded-xl p-5 space-y-3 {className}">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-1.5 min-w-0">
			<p class="text-sm font-medium text-muted-foreground whitespace-nowrap">{title}</p>
			{#if help}
				<span class="group relative inline-flex flex-shrink-0">
					<button
						type="button"
						class="rounded-full p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card"
						aria-label="What is {title}?"
					>
						<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
							<circle cx="12" cy="12" r="10"/>
							<path d="M12 16v-4m0-4h.01"/>
						</svg>
					</button>
					<span
						class="absolute left-full top-1/2 z-10 ml-1.5 w-56 -translate-y-1/2 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto"
						role="tooltip"
					>
						{help}
					</span>
				</span>
			{/if}
		</div>
		{#if icon}
			<div class="size-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html icon}
			</div>
		{/if}
	</div>

	<div class="space-y-1">
		<p class="text-2xl font-bold {valueClass ?? 'text-foreground'}">{value}</p>
		<div class="flex items-center gap-2">
			{#if trendLabel}
				<span class="text-xs font-medium {trendPositive ? 'text-success' : 'text-destructive'}">
					{trendLabel}
				</span>
			{/if}
			{#if subtitle}
				<span class="text-xs text-muted-foreground">{subtitle}</span>
			{/if}
		</div>
	</div>
</div>
