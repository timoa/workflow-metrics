<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import type { NodeProps } from '@xyflow/svelte';

	let {
		data,
		sourcePosition = Position.Right
	}: NodeProps = $props();

	const compact = $derived(data?.compact ?? false);
</script>

<div
	class="flex flex-col items-center justify-center gap-1 overflow-hidden rounded-md border border-primary/60 bg-primary/10 font-medium text-primary shadow {compact
		? 'w-[80px] px-2 py-2 text-[11px]'
		: 'w-[100px] px-3 py-3 text-xs'}"
>
	<div class="flex items-center gap-1 text-[11px] text-primary">
		<i class="fa-solid fa-bolt shrink-0 {compact ? 'text-[0.6rem]' : 'text-[0.75rem]'}"></i>
		<span class="font-semibold uppercase tracking-wide">Trigger</span>
	</div>
	<div class="flex items-center gap-1 text-[10px] text-primary/80">
		<i class="fa-solid fa-code-commit shrink-0 {compact ? 'text-[0.55rem]' : 'text-[0.65rem]'}"></i>
		<span>push</span>
	</div>
</div>
<Handle type="source" position={sourcePosition} />
