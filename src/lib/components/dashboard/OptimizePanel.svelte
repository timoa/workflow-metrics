<script lang="ts">
	import type { WorkflowMetrics } from '$lib/types/metrics';

	interface Props {
		workflowId: number;
		workflowName: string;
		workflowPath: string;
		metrics: WorkflowMetrics;
		owner: string;
		repo: string;
		onclose: () => void;
	}

	let { workflowId, workflowName, workflowPath, metrics, owner, repo, onclose }: Props = $props();

	let loading = $state(false);
	let streamedContent = $state('');
	let error = $state<string | null>(null);
	let done = $state(false);

	async function optimize() {
		loading = true;
		error = null;
		streamedContent = '';
		done = false;

		try {
			const response = await fetch('/api/optimize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					workflowId,
					workflowName,
					workflowPath,
					owner,
					repo,
					metrics
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error ?? 'Optimization failed');
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error('No response body');

			const decoder = new TextDecoder();
			while (true) {
				const { done: isDone, value } = await reader.read();
				if (isDone) break;
				streamedContent += decoder.decode(value, { stream: true });
			}
			done = true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	// Start optimization on mount
	$effect(() => {
		optimize();
	});
</script>

<div class="bg-card border border-border rounded-xl overflow-hidden">
	<div class="flex items-center justify-between p-5 border-b border-border">
		<div class="flex items-center gap-3">
			<div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
				<svg class="size-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
					<path d="M12 8v4l3 3"/>
				</svg>
			</div>
			<div>
				<h3 class="text-sm font-semibold text-foreground">AI Optimization</h3>
				<p class="text-xs text-muted-foreground">Powered by Mistral AI · {workflowName}</p>
			</div>
		</div>
		<div class="flex items-center gap-2">
			{#if done}
				<button
					onclick={optimize}
					class="text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					Regenerate
				</button>
			{/if}
			<button
				onclick={onclose}
				aria-label="Close optimization panel"
				class="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6 6 18M6 6l12 12"/>
				</svg>
			</button>
		</div>
	</div>

	<div class="p-5">
		{#if error}
			<div class="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-4 text-sm">
				<p class="font-medium">Failed to generate optimization</p>
				<p class="text-xs mt-1">{error}</p>
				<button
					onclick={optimize}
					class="mt-3 text-xs underline hover:no-underline"
				>
					Try again
				</button>
			</div>
		{:else if loading && !streamedContent}
			<div class="flex items-center gap-3 text-muted-foreground">
				<svg class="size-4 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
				</svg>
				<span class="text-sm">Analyzing your workflow with Mistral AI...</span>
			</div>
		{:else if streamedContent}
			<div class="prose prose-sm dark:prose-invert max-w-none">
				<div class="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-mono text-xs bg-muted/30 rounded-lg p-4 max-h-96 overflow-y-auto">
					{streamedContent}
					{#if loading}
						<span class="inline-block size-2 bg-primary rounded-full animate-pulse"></span>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
