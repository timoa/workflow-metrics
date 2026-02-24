<script lang="ts">
	import { browser } from '$app/environment';
	import hljs from 'highlight.js/lib/core';
	import yaml from 'highlight.js/lib/languages/yaml';
	import bash from 'highlight.js/lib/languages/bash';
	import json from 'highlight.js/lib/languages/json';
	import javascript from 'highlight.js/lib/languages/javascript';
	import { tick } from 'svelte';
	import type { WorkflowMetrics, OptimizationResult, OptimizationItem, OptimizationHistoryEntry } from '$lib/types/metrics';

	hljs.registerLanguage('yaml', yaml);
	hljs.registerLanguage('bash', bash);
	hljs.registerLanguage('json', json);
	hljs.registerLanguage('javascript', javascript);

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
	let error = $state<string | null>(null);
	let entry = $state<OptimizationHistoryEntry | null>(null);

	// Accordion open state: Set of item IDs
	let openItems = $state(new Set<string>());
	// Checked items for PR creation
	let checkedItems = $state(new Set<string>());

	// PR creation state
	let applyingPr = $state(false);
	let prError = $state<string | null>(null);
	let prUrl = $state<string | null>(null);

	async function optimize(force = false) {
		loading = true;
		error = null;
		prUrl = null;
		prError = null;

		try {
			const response = await fetch(`/api/optimize${force ? '?force=true' : ''}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ workflowId, workflowName, workflowPath, owner, repo, metrics })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error ?? data.message ?? 'Optimization failed');
			}

			const data = await response.json() as OptimizationHistoryEntry;
			entry = data;
			openItems = new Set();
			checkedItems = new Set();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		optimize();
	});

	// Highlight code blocks after DOM update
	$effect(() => {
		if (!entry || !browser) return;
		void tick().then(() => {
			document.querySelectorAll('.opt-code-block code.hljs').forEach((el) => {
				hljs.highlightElement(el as HTMLElement);
			});
		});
	});

	function toggleOpen(id: string) {
		const next = new Set(openItems);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		openItems = next;
	}

	function toggleChecked(id: string) {
		const next = new Set(checkedItems);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		checkedItems = next;
	}

	const selectedOptimizations = $derived(
		entry?.result.optimizations.filter((o) => checkedItems.has(o.id)) ?? []
	);

	async function applyAsPr() {
		if (!selectedOptimizations.length) return;
		applyingPr = true;
		prError = null;
		prUrl = null;

		try {
			const response = await fetch('/api/optimize/apply', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					workflowId,
					workflowPath,
					owner,
					repo,
					workflowName,
					selectedOptimizations
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error ?? data.message ?? 'Failed to create PR');
			}

			const data = await response.json() as { prUrl: string; branchName: string };
			prUrl = data.prUrl;
			checkedItems = new Set();
		} catch (e) {
			prError = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			applyingPr = false;
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatTokens(n: number): string {
		if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
		return n.toLocaleString();
	}

	type CategoryConfig = { label: string; classes: string };
	const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
		performance: { label: 'Performance', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
		cost:        { label: 'Cost',        classes: 'bg-green-500/15 text-green-400 border-green-500/20' },
		reliability: { label: 'Reliability', classes: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
		security:    { label: 'Security',    classes: 'bg-red-500/15 text-red-400 border-red-500/20' },
		maintenance: { label: 'Maintenance', classes: 'bg-slate-500/15 text-slate-400 border-slate-500/20' }
	};

	const EFFORT_CLASSES: Record<string, string> = {
		Low:    'bg-green-500/15 text-green-400 border-green-500/20',
		Medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
		High:   'bg-red-500/15 text-red-400 border-red-500/20'
	};

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function renderCode(code: string): string {
		const escaped = escapeHtml(code);
		return `<pre class="opt-code-block"><code class="hljs language-yaml">${escaped}</code></pre>`;
	}
</script>

<div class="bg-card border border-border rounded-xl overflow-hidden">
	<!-- Header -->
	<div class="flex items-center justify-between p-5 border-b border-border">
		<div class="flex items-center gap-3">
			<div class="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
				<svg class="size-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<path d="M15 4V2"/>
					<path d="M15 16v-2"/>
					<path d="M8 9h2"/>
					<path d="M20 9h2"/>
					<path d="M17.8 11.8 19 13"/>
					<path d="M15 9h0"/>
					<path d="M17.8 6.2 19 5"/>
					<path d="m3 21 9-9"/>
					<path d="M12.2 6.2 11 5"/>
				</svg>
			</div>
			<div>
				<h3 class="text-sm font-semibold text-foreground">AI Optimization</h3>
				<p class="text-xs text-muted-foreground">Powered by Mistral AI · {workflowName}</p>
			</div>
		</div>
		<div class="flex items-center gap-3">
			{#if entry}
				{#if entry.completionTokens}
					<span class="text-xs text-muted-foreground tabular-nums hidden sm:inline" title="Response tokens">
						{formatTokens(entry.completionTokens)} tokens
					</span>
				{/if}
				<span class="text-xs text-muted-foreground hidden sm:inline">
					{entry.cached ? 'Cached' : 'Generated'} {formatDate(entry.createdAt)}
				</span>
				<button
					onclick={() => optimize(true)}
					class="text-xs text-muted-foreground hover:text-foreground transition-colors"
					title="Generate new analysis (ignores cache)"
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

	<div class="p-5 space-y-4">
		<!-- Loading state -->
		{#if loading}
			<div class="flex flex-col items-center justify-center py-12 gap-4 text-muted-foreground">
				<div class="size-12 rounded-full bg-primary/10 flex items-center justify-center">
					<svg class="size-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M15 4V2"/>
						<path d="M15 16v-2"/>
						<path d="M8 9h2"/>
						<path d="M20 9h2"/>
						<path d="M17.8 11.8 19 13"/>
						<path d="M15 9h0"/>
						<path d="M17.8 6.2 19 5"/>
						<path d="m3 21 9-9"/>
						<path d="M12.2 6.2 11 5"/>
					</svg>
				</div>
				<p class="text-sm font-medium text-foreground">Analyzing your workflow</p>
				<p class="text-xs max-w-xs text-center">Mistral AI is reviewing metrics and YAML to suggest optimizations…</p>
				<div class="flex gap-1 mt-2">
					<span class="size-2 rounded-full bg-primary/40 animate-pulse" style="animation-delay: 0ms"></span>
					<span class="size-2 rounded-full bg-primary/40 animate-pulse" style="animation-delay: 150ms"></span>
					<span class="size-2 rounded-full bg-primary/40 animate-pulse" style="animation-delay: 300ms"></span>
				</div>
			</div>

		<!-- Error state -->
		{:else if error}
			<div class="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-4 text-sm">
				<p class="font-medium">Failed to generate optimization</p>
				<p class="text-xs mt-1">{error}</p>
				<button onclick={() => optimize()} class="mt-3 text-xs underline hover:no-underline">
					Try again
				</button>
			</div>

		<!-- Results state -->
		{:else if entry}
			<!-- Optimization accordion -->
			<div class="space-y-2">
				{#each entry.result.optimizations as opt (opt.id)}
					{@const cat = CATEGORY_CONFIG[opt.category] ?? CATEGORY_CONFIG.maintenance}
					{@const isOpen = openItems.has(opt.id)}
					{@const isChecked = checkedItems.has(opt.id)}

					<div class="border border-border rounded-lg overflow-hidden transition-colors {isChecked ? 'border-primary/40 bg-primary/5' : 'bg-muted/20'}">
						<!-- Item header row -->
						<div class="flex items-center gap-3 p-3">
							<!-- Checkbox -->
							<button
								onclick={() => toggleChecked(opt.id)}
								aria-label="Select {opt.title}"
								class="shrink-0 size-5 rounded border-2 flex items-center justify-center transition-colors
									{isChecked ? 'bg-primary border-primary' : 'border-border hover:border-primary/60'}"
							>
								{#if isChecked}
									<svg class="size-3 text-primary-foreground" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5">
										<path d="M2 6l3 3 5-5"/>
									</svg>
								{/if}
							</button>

						<!-- Title + impact -->
						<button
							onclick={() => toggleOpen(opt.id)}
							class="flex-1 flex items-center gap-2 text-left min-w-0"
						>
							<span class="text-sm font-medium text-foreground truncate">{opt.title}</span>
							{#if opt.estimatedImpact}
								<span class="shrink-0 text-xs text-muted-foreground hidden md:inline">{opt.estimatedImpact}</span>
							{/if}
						</button>

						<!-- Category badge + Chevron -->
						<span class="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border {cat.classes}">
							{cat.label}
						</span>
						<button
							onclick={() => toggleOpen(opt.id)}
							aria-label="{isOpen ? 'Collapse' : 'Expand'} {opt.title}"
							class="shrink-0 size-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-transform duration-200
								{isOpen ? 'rotate-180' : ''}"
						>
							<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="m6 9 6 6 6-6"/>
							</svg>
						</button>
						</div>

						<!-- Expanded content -->
						{#if isOpen}
							<div class="border-t border-border px-4 pb-4 pt-3 space-y-3">
								<p class="text-sm text-foreground/90 leading-relaxed">{opt.explanation}</p>
								{#if opt.codeExample && browser}
									<div class="opt-code-wrapper">
										{@html renderCode(opt.codeExample)}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Summary table -->
			{#if entry.result.optimizations.some((o) => o.estimatedImpact)}
				<div class="mt-2">
					<h4 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Expected Outcomes</h4>
					<div class="rounded-lg border border-border overflow-hidden">
						<table class="w-full text-sm">
							<thead>
								<tr class="bg-muted/40 border-b border-border">
									<th class="text-left px-4 py-2.5 text-xs font-semibold text-foreground">Optimization</th>
									<th class="text-left px-4 py-2.5 text-xs font-semibold text-foreground">Expected Impact</th>
									<th class="text-left px-4 py-2.5 text-xs font-semibold text-foreground">Effort</th>
								</tr>
							</thead>
							<tbody>
								{#each entry.result.optimizations.filter((o) => o.estimatedImpact) as opt, i (opt.id)}
									{@const effClasses = EFFORT_CLASSES[opt.effort] ?? EFFORT_CLASSES.Medium}
									<tr class="{i % 2 === 0 ? '' : 'bg-muted/20'} border-b border-border last:border-0">
										<td class="px-4 py-2.5 text-foreground font-medium">{opt.title}</td>
										<td class="px-4 py-2.5 text-muted-foreground">{opt.estimatedImpact}</td>
										<td class="px-4 py-2.5">
											<span class="text-xs font-medium px-2 py-0.5 rounded-full border {effClasses}">{opt.effort}</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			<!-- Overall improvement summary -->
			{#if entry.result.summary.expectedAvgDuration || entry.result.summary.expectedSuccessRate || entry.result.summary.expectedP95Duration}
				<div class="bg-primary/5 border border-primary/15 rounded-lg p-4">
					<h4 class="text-xs font-semibold text-foreground mb-2">Implementing these changes should:</h4>
					<ul class="space-y-1.5 text-sm text-foreground/80">
						{#if entry.result.summary.expectedAvgDuration}
							<li class="flex items-start gap-2">
								<svg class="size-4 text-primary mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 5 5L20 7"/></svg>
								Reduce average duration from {Math.round(metrics.avgDurationMs / 1000)}s to {entry.result.summary.expectedAvgDuration}
							</li>
						{/if}
						{#if entry.result.summary.expectedSuccessRate}
							<li class="flex items-start gap-2">
								<svg class="size-4 text-primary mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 5 5L20 7"/></svg>
								Improve success rate from {metrics.successRate.toFixed(0)}% to {entry.result.summary.expectedSuccessRate}
							</li>
						{/if}
						{#if entry.result.summary.expectedP95Duration}
							<li class="flex items-start gap-2">
								<svg class="size-4 text-primary mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 5 5L20 7"/></svg>
								Reduce P95 duration from {Math.round(metrics.p95DurationMs / 1000)}s to {entry.result.summary.expectedP95Duration}
							</li>
						{/if}
						{#if entry.result.summary.notes}
							<li class="flex items-start gap-2 text-muted-foreground text-xs mt-1">
								<svg class="size-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
								{entry.result.summary.notes}
							</li>
						{/if}
					</ul>
				</div>
			{/if}

			<!-- Apply as PR -->
			<div class="flex items-center justify-between pt-1">
				<p class="text-xs text-muted-foreground">
					{checkedItems.size > 0
						? `${checkedItems.size} optimization${checkedItems.size > 1 ? 's' : ''} selected`
						: 'Select optimizations to apply as a PR'}
				</p>
				<button
					onclick={applyAsPr}
					disabled={checkedItems.size === 0 || applyingPr}
					class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
						{checkedItems.size > 0 && !applyingPr
							? 'bg-primary text-primary-foreground hover:bg-primary/90'
							: 'bg-muted text-muted-foreground cursor-not-allowed'}"
				>
					{#if applyingPr}
						<svg class="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
						</svg>
						Creating PR…
					{:else}
						<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
							<path d="M6 9v6M15 18h-6M18 15V9a6 6 0 0 0-6-6"/>
						</svg>
						Apply {checkedItems.size > 0 ? `${checkedItems.size} ` : ''}as PR
					{/if}
				</button>
			</div>

			<!-- PR success / error -->
			{#if prUrl}
				<div class="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-3">
					<svg class="size-4 text-green-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="m5 12 5 5L20 7"/>
					</svg>
					<p class="text-sm text-green-400 flex-1">Pull request created!</p>
					<a
						href={prUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="text-xs text-green-400 underline hover:no-underline"
					>
						View PR →
					</a>
				</div>
			{/if}
			{#if prError}
				<div class="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-3 text-xs space-y-1.5">
					<p>{prError}</p>
					{#if prError.includes('write access') || prError.includes('404') || prError.includes('permission')}
						<p>
							<a href="/settings" class="underline hover:no-underline font-medium">
								Go to Settings → Grant write access
							</a>
							to reconnect GitHub with the required permissions.
						</p>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	:global(.opt-code-block) {
		background: #1e1e1e;
		border-radius: 0.5rem;
		padding: 1rem 1.25rem;
		margin: 0;
		overflow-x: auto;
	}
	:global(.opt-code-block code) {
		background: transparent;
		padding: 0;
		font-size: 0.8125rem;
		line-height: 1.5;
		color: #d4d4d4;
	}
	:global(.opt-code-block .hljs-attr) { color: #dcdcaa; }
	:global(.opt-code-block .hljs-keyword),
	:global(.opt-code-block .hljs-selector-tag) { color: #c586c0; }
	:global(.opt-code-block .hljs-string),
	:global(.opt-code-block .hljs-addition) { color: #ce9178; }
	:global(.opt-code-block .hljs-number) { color: #b5cea8; }
	:global(.opt-code-block .hljs-comment),
	:global(.opt-code-block .hljs-quote) { color: #6a9955; }
	:global(.opt-code-block .hljs-built_in),
	:global(.opt-code-block .hljs-title) { color: #4ec9b0; }
	:global(.opt-code-block .hljs-variable),
	:global(.opt-code-block .hljs-subst) { color: #9cdcfe; }
	:global(.opt-code-block .hljs-meta) { color: #808080; }
</style>
