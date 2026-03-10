<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import type { WorkflowMetrics } from '$lib/types/metrics';

	interface Props {
		workflows: WorkflowMetrics[];
		selectedIds: number[];
		repositoryId: string;
		onSave: (ids: number[]) => Promise<void>;
		onClose: () => void;
	}

	let { workflows, selectedIds, onSave, onClose }: Props = $props();

	// Use a plain $state array for selections — SvelteSet cannot be $state-wrapped per eslint rule,
	// but using an array with $state gives us full reactivity.
	let localSelection = $state<number[]>([...selectedIds]);
	let saving = $state(false);
	let error = $state<string | null>(null);

	function isSelected(workflowId: number) {
		return localSelection.includes(workflowId);
	}

	function toggleWorkflow(workflowId: number) {
		if (localSelection.includes(workflowId)) {
			localSelection = localSelection.filter((id) => id !== workflowId);
		} else {
			localSelection = [...localSelection, workflowId];
		}
	}

	async function handleSave() {
		saving = true;
		error = null;
		try {
			await onSave(Array.from(localSelection));
			onClose();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save workflow selection';
		} finally {
			saving = false;
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
	transition:fade={{ duration: 150 }}
	onclick={handleBackdropClick}
	role="button"
	tabindex="-1"
>
	<!-- Dialog -->
	<div
		class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg"
		transition:scale={{ duration: 150, start: 0.95 }}
		role="dialog"
		aria-labelledby="dialog-title"
		aria-describedby="dialog-description"
	>
		<!-- Header -->
		<div class="mb-4">
			<h2 id="dialog-title" class="text-lg font-semibold text-foreground">
				Select Production Workflows
			</h2>
			<p id="dialog-description" class="mt-1 text-sm text-muted-foreground">
				Check the workflows that deploy to production. DORA metrics will only include these workflows.
			</p>
		</div>

		<!-- Workflow List -->
		<div class="mb-4 max-h-96 space-y-2 overflow-y-auto rounded-md border border-border bg-background p-4">
			{#if workflows.length === 0}
				<p class="text-sm text-muted-foreground text-center py-4">
					No workflows found for this repository.
				</p>
			{:else}
				{#each workflows as workflow (workflow.workflowId)}
					<label class="flex items-start gap-3 rounded-md p-3 hover:bg-accent cursor-pointer transition-colors">
						<input
							type="checkbox"
							checked={isSelected(workflow.workflowId)}
							onchange={() => toggleWorkflow(workflow.workflowId)}
							class="mt-0.5 size-4 rounded border-border text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
						/>
						<div class="flex-1 min-w-0">
							<div class="font-medium text-sm text-foreground">
								{workflow.workflowName}
							</div>
							<div class="text-xs text-muted-foreground truncate">
								{workflow.workflowPath}
							</div>
							<div class="mt-1 flex gap-3 text-xs text-muted-foreground">
								<span>{workflow.totalRuns} runs</span>
								<span>{workflow.successRate.toFixed(1)}% success</span>
							</div>
						</div>
					</label>
				{/each}
			{/if}
		</div>

		{#if error}
			<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
				{error}
			</div>
		{/if}

		<!-- Footer -->
		<div class="flex items-center justify-between">
			<p class="text-xs text-muted-foreground">
				{localSelection.length} workflow{localSelection.length === 1 ? '' : 's'} selected
			</p>
			<div class="flex gap-2">
				<button
					type="button"
					onclick={onClose}
					disabled={saving}
					class="rounded-md px-4 py-2 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					Cancel
				</button>
				<button
					type="button"
					onclick={handleSave}
					disabled={saving}
					class="rounded-md px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					{saving ? 'Saving...' : 'Save'}
				</button>
			</div>
		</div>
	</div>
</div>
