<script lang="ts">
	import { useUpdateNodeInternals, useSvelteFlow } from '@xyflow/svelte';
	import { onMount } from 'svelte';

	let { nodeIds }: { nodeIds: string[] } = $props();

	const updateNodeInternals = useUpdateNodeInternals();
	const flow = useSvelteFlow();

	onMount(() => {
		// Force handle bound registration for all nodes, then fit the view.
		// Two rAF passes: first to ensure DOM is painted, second to allow the
		// updateNodeInternals pass to complete before fitView runs.
		requestAnimationFrame(() => {
			updateNodeInternals(nodeIds);
			requestAnimationFrame(() => {
				flow.fitView({ padding: 0.3 });
			});
		});
	});
</script>
