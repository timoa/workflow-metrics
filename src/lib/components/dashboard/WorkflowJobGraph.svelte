<script lang="ts">
	import type { WorkflowJobEdge, WorkflowJobNode } from '$lib/types/metrics';
	import {
		SvelteFlow,
		Background,
		BackgroundVariant,
		Position,
		type Edge,
		type Node
	} from '@xyflow/svelte';
	import { untrack } from 'svelte';
	import '@xyflow/svelte/dist/style.css';
	import WorkflowTriggerNode from '$lib/components/dashboard/WorkflowTriggerNode.svelte';
	import WorkflowJobNodeComponent from '$lib/components/dashboard/WorkflowJobNode.svelte';

	let {
		nodes,
		edges,
		class: className = ''
	}: {
		nodes: WorkflowJobNode[];
		edges: WorkflowJobEdge[];
		class?: string;
	} = $props();

	// Compact mode when only 1 trigger + 1 job — smaller than full size but large enough for text
	const compact = $derived(nodes.length === 1);
	const NODE_WIDTH = $derived(compact ? 180 : 220);
	const NODE_HEIGHT = $derived(compact ? 80 : 100);
	const HORIZONTAL_GAP = $derived(compact ? 40 : 80);
	const VERTICAL_GAP = $derived(compact ? 24 : 40);
	const TRIGGER_WIDTH = $derived(compact ? 80 : 100);
	const TRIGGER_HEIGHT = $derived(compact ? 56 : 72);
	const TRIGGER_X = 0;

	function getIsDark() {
		if (typeof document === 'undefined') return false;
		return document.documentElement.classList.contains('dark');
	}

	let isDark = $state(getIsDark());

	$effect(() => {
		if (typeof document === 'undefined') return;
		const observer = new MutationObserver(() => {
			isDark = getIsDark();
		});
		observer.observe(document.documentElement, { attributeFilter: ['class'] });
		return () => observer.disconnect();
	});

	// Calculate dynamic height based on job count (compact when 1 job)
	const jobCount = $derived(nodes.length);
	const canvasHeight = $derived(
		jobCount <= 1 ? (compact ? 140 : 250) : jobCount <= 3 ? 350 : 500
	);

	// fitView: compact (1 trigger + 1 job) caps maxZoom so nodes don't fill the entire canvas.
	const fitViewOptions = $derived(compact ? { padding: 0.4, maxZoom: 0.8 } : { padding: 0.2 });

	const triggerId = '__trigger__';

	function buildNodes(
		nodeList: WorkflowJobNode[],
		opts: { nodeW: number; nodeH: number; hGap: number; vGap: number; triggerW: number; triggerH: number; compact: boolean }
	): Node[] {
		if (nodeList.length === 0) return [];
		const { nodeW, nodeH, hGap, vGap, triggerW, triggerH, compact } = opts;
		const connectorGap = compact ? 36 : 60;

		const jobNodes: Node[] = nodeList.map((node) => ({
			id: node.id,
			type: 'job',
			sourcePosition: Position.Right,
			targetPosition: Position.Left,
			position: {
				x: TRIGGER_X + triggerW + connectorGap + node.columnIndex * (nodeW + hGap),
				y: node.rowIndex * (nodeH + vGap)
			},
			data: { node, compact }
		}));

		const firstCol = nodeList.filter((n) => n.columnIndex === 0);
		const ys = firstCol.map((n) => n.rowIndex * (nodeH + vGap));
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		const centerY = minY + (maxY - minY + nodeH) / 2 - triggerH / 2;

		const triggerNode: Node = {
			id: triggerId,
			type: 'trigger',
			sourcePosition: Position.Right,
			position: { x: TRIGGER_X, y: centerY },
			data: { compact }
		};

		return [triggerNode, ...jobNodes];
	}

	function buildEdges(nodeList: WorkflowJobNode[], edgeList: WorkflowJobEdge[]): Edge[] {
		if (nodeList.length === 0) return [];

		const jobEdges: Edge[] = edgeList.map((edge) => ({
			id: edge.id,
			source: edge.source,
			target: edge.target,
			type: 'bezier',
			style: 'stroke-width: 2;'
		}));

		const firstColIds = nodeList.filter((n) => n.columnIndex === 0).map((n) => n.id);
		const triggerEdges: Edge[] = firstColIds.map((id) => ({
			id: `${triggerId}--${id}`,
			source: triggerId,
			target: id,
			type: 'bezier',
			style: 'stroke-width: 2;'
		}));

		return [...triggerEdges, ...jobEdges];
	}

	let flowNodes = $state.raw<Node[]>(
		untrack(() =>
			buildNodes(nodes, {
				nodeW: NODE_WIDTH,
				nodeH: NODE_HEIGHT,
				hGap: HORIZONTAL_GAP,
				vGap: VERTICAL_GAP,
				triggerW: TRIGGER_WIDTH,
				triggerH: TRIGGER_HEIGHT,
				compact
			})
		)
	);
	let flowEdges = $state.raw<Edge[]>(untrack(() => buildEdges(nodes, edges)));

	$effect(() => {
		flowNodes = buildNodes(nodes, {
			nodeW: NODE_WIDTH,
			nodeH: NODE_HEIGHT,
			hGap: HORIZONTAL_GAP,
			vGap: VERTICAL_GAP,
			triggerW: TRIGGER_WIDTH,
			triggerH: TRIGGER_HEIGHT,
			compact
		});
		flowEdges = buildEdges(nodes, edges);
	});

</script>

<div class={`flex flex-col gap-3 rounded-xl border border-border bg-card p-4 ${className}`}>
	<div class="flex items-center justify-between">
		<div>
			<h3 class="text-sm font-semibold text-foreground">Workflow Structure</h3>
			<p class="text-xs text-muted-foreground">Trigger and jobs with steps count.</p>
		</div>
	</div>

	{#if flowNodes.length === 0}
		<p class="text-xs text-muted-foreground">No job data available for this workflow.</p>
	{:else}
		<div
			class="w-full overflow-hidden rounded-lg"
			style="height: {canvasHeight}px; min-height: {canvasHeight}px;"
		>
			<SvelteFlow
				bind:nodes={flowNodes}
				bind:edges={flowEdges}
				nodeTypes={{ trigger: WorkflowTriggerNode, job: WorkflowJobNodeComponent }}
				colorMode={isDark ? 'dark' : 'light'}
				fitView
				fitViewOptions={fitViewOptions}
				minZoom={0.2}
				maxZoom={2}
				zoomOnScroll={true}
				panOnScroll={true}
				panOnDrag={true}
				zoomOnPinch={true}
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable={false}
				defaultEdgeOptions={{ type: 'smoothstep' }}
			>
				<Background
					variant={BackgroundVariant.Dots}
					gap={20}
					size={1}
				/>
			</SvelteFlow>
		</div>
	{/if}
</div>

<style>
	:global(.svelte-flow) {
		background: transparent !important;
	}
</style>
