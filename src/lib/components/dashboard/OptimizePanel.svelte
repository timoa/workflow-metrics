<script lang="ts">
	import { browser } from '$app/environment';
	import { fade } from 'svelte/transition';
	import hljs from 'highlight.js/lib/core';
	import yaml from 'highlight.js/lib/languages/yaml';
	import bash from 'highlight.js/lib/languages/bash';
	import json from 'highlight.js/lib/languages/json';
	import javascript from 'highlight.js/lib/languages/javascript';
	import { tick } from 'svelte';
	import type { WorkflowMetrics, OptimizationHistoryEntry } from '$lib/types/metrics';

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

	// ── Loading step tracking ─────────────────────────────────────────────────
	const STEP_ORDER = ['checking-cache', 'fetching-yaml', 'ai-analyzing', 'saving'] as const;
	type StepId = typeof STEP_ORDER[number];

	const STEP_LABELS: Record<StepId, string> = {
		'checking-cache': 'Checking optimization cache',
		'fetching-yaml':  'Fetching workflow YAML',
		'ai-analyzing':   'Analyzing with Mistral AI',
		'saving':         'Saving recommendations'
	};

	// Messages cycled client-side during the long AI analysis phase
	const AI_MESSAGES = [
		'Analyzing workflow structure…',
		'Reviewing security practices…',
		'Reviewing performance optimizations…',
		'Reviewing cost efficiency…',
		'Reviewing reliability patterns…',
		'Reviewing maintenance opportunities…',
		'Generating recommendations…'
	];

	let currentStep = $state<StepId | null>(null);
	let completedSteps = $state(new Set<StepId>());
	let currentMessage = $state('');
	let messageKey = $state(0); // increment to trigger fade transition

	let categoryTimer: ReturnType<typeof setInterval> | null = null;
	let categoryIndex = 0;

	function setMessage(msg: string) {
		currentMessage = msg;
		messageKey++;
	}

	function startCategoryAnimation() {
		categoryIndex = 0;
		setMessage(AI_MESSAGES[0]);
		categoryTimer = setInterval(() => {
			categoryIndex++;
			if (categoryIndex >= AI_MESSAGES.length - 1) {
				// Stay on "Generating recommendations…" — don't loop back
				setMessage(AI_MESSAGES[AI_MESSAGES.length - 1]);
				stopCategoryAnimation();
			} else {
				setMessage(AI_MESSAGES[categoryIndex]);
			}
		}, 3500);
	}

	function stopCategoryAnimation() {
		if (categoryTimer) {
			clearInterval(categoryTimer);
			categoryTimer = null;
		}
	}

	const progressPct = $derived(
		Math.round((completedSteps.size / STEP_ORDER.length) * 100)
	);

	// ── Accordion open state ──────────────────────────────────────────────────
	let openItems = $state(new Set<string>());
	// Checked items for PR creation
	let checkedItems = $state(new Set<string>());

	// PR creation state
	let applyingPr = $state(false);
	let prError = $state<string | null>(null);
	let prUrl = $state<string | null>(null);

	// Copy feedback
	let copiedId = $state<string | null>(null);
	let copiedAll = $state(false);

	async function copyCode(code: string, id: string) {
		try {
			await navigator.clipboard.writeText(code);
			copiedId = id;
			setTimeout(() => (copiedId = null), 2000);
		} catch (_) {
			// ignore
		}
	}

	async function copySelectedCode() {
		if (selectedOptimizations.length === 0) return;
		const parts = selectedOptimizations.map(
			(o) => `# --- ${o.title} ---\n${stripCodeFences(o.codeExample ?? '')}`
		);
		try {
			await navigator.clipboard.writeText(parts.join('\n\n'));
			copiedAll = true;
			setTimeout(() => (copiedAll = false), 2000);
		} catch (_) {
			// ignore
		}
	}

	async function optimize(force = false) {
		loading = true;
		error = null;
		prUrl = null;
		prError = null;
		currentStep = null;
		completedSteps = new Set();
		stopCategoryAnimation();

		try {
			const response = await fetch(`/api/optimize${force ? '?force=true' : ''}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ workflowId, workflowName, workflowPath, owner, repo, metrics })
			});

			if (!response.ok || !response.body) {
				const data = await response.json().catch(() => ({}));
				throw new Error((data as { error?: string; message?: string }).error ?? (data as { message?: string }).message ?? 'Optimization failed');
			}

			// Parse SSE stream
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			outer: while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const messages = buffer.split('\n\n');
				buffer = messages.pop() ?? '';

				for (const msg of messages) {
					if (!msg.trim()) continue;
					const eventMatch = msg.match(/^event:\s*(.+)$/m);
					const dataMatch = msg.match(/^data:\s*(.+)$/m);
					if (!eventMatch || !dataMatch) continue;

					const eventName = eventMatch[1].trim();
					let payload: unknown;
					try { payload = JSON.parse(dataMatch[1]); } catch { continue; }

					if (eventName === 'phase') {
						const p = payload as { step: StepId; message: string };
						// Mark previous step complete
						if (currentStep) {
							completedSteps = new Set([...completedSteps, currentStep]);
						}
						currentStep = p.step;
						stopCategoryAnimation();
						if (p.step === 'ai-analyzing') {
							startCategoryAnimation();
						} else {
							setMessage(p.message);
						}
					} else if (eventName === 'complete') {
						const p = payload as OptimizationHistoryEntry;
						entry = p;
						openItems = new Set();
						checkedItems = new Set();
						break outer;
					} else if (eventName === 'error') {
						const p = payload as { message: string };
						throw new Error(p.message);
					}
				}
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
			stopCategoryAnimation();
		}
	}

	$effect(() => {
		optimize();
	});

	// Highlight code blocks after DOM update (re-run when openItems changes so expanded blocks get highlighted)
	$effect(() => {
		if (!entry || !browser) return;
		openItems;
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

	/** Remove markdown code block fences (e.g. ```yaml and ```) from AI-generated code. */
	function stripCodeFences(code: string): string {
		let s = code.trim();
		if (s.startsWith('```')) {
			s = s.replace(/^```[\w]*\n?/, '');
		}
		if (s.endsWith('```')) {
			s = s.replace(/\n?```\s*$/, '');
		}
		return s.trim();
	}

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function renderCode(code: string): string {
		const cleaned = stripCodeFences(code);
		const escaped = escapeHtml(cleaned);
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
			<div class="flex flex-col items-center py-8 gap-5" role="status" aria-live="polite">

				<!-- Animated icon -->
				<div class="size-14 rounded-2xl bg-primary/10 flex items-center justify-center ai-icon-pulse">
					<svg class="size-7 text-primary ai-wand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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

				<!-- Cycling message with fade transition -->
				<div class="h-6 flex items-center justify-center">
					{#key messageKey}
						<p
							in:fade={{ duration: 250, delay: 100 }}
							out:fade={{ duration: 200 }}
							class="text-sm font-medium text-foreground text-center"
						>
							{currentMessage}
						</p>
					{/key}
				</div>

				<!-- Step checklist -->
				<div class="w-full max-w-xs space-y-2">
					{#each STEP_ORDER as step}
						{@const isDone = completedSteps.has(step)}
						{@const isActive = currentStep === step}
						<div class="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors {isActive ? 'bg-primary/8' : ''}">
							<!-- Icon: done / active / pending -->
							<div class="shrink-0 size-5 flex items-center justify-center">
								{#if isDone}
									<svg class="size-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-label="Done">
										<path d="M5 12l5 5L20 7"/>
									</svg>
								{:else if isActive}
									<svg class="size-4 text-primary animate-spin" viewBox="0 0 24 24" fill="none" aria-label="In progress">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
									</svg>
								{:else}
									<span class="size-2 rounded-full bg-muted-foreground/30 mx-auto block"></span>
								{/if}
							</div>
							<span class="text-sm {isDone ? 'text-muted-foreground line-through decoration-muted-foreground/40' : isActive ? 'text-foreground font-medium' : 'text-muted-foreground/60'}">
								{STEP_LABELS[step]}
							</span>
						</div>
					{/each}
				</div>

				<!-- Progress bar -->
				<div class="w-full max-w-xs">
					<div class="h-1 w-full rounded-full bg-muted overflow-hidden">
						<div
							class="h-full rounded-full bg-primary transition-all duration-700 ease-out"
							style="width: {progressPct}%"
							role="progressbar"
							aria-valuenow={progressPct}
							aria-valuemin={0}
							aria-valuemax={100}
						></div>
					</div>
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
									<div class="opt-code-wrapper relative group">
										<button
											type="button"
											onclick={() => copyCode(stripCodeFences(opt.codeExample ?? ''), opt.id)}
											class="absolute top-2 right-2 z-10 size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors opacity-70 hover:opacity-100 focus:opacity-100 focus:outline-none"
											aria-label="Copy code"
										>
											{#if copiedId === opt.id}
												<svg class="size-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M5 12l5 5L20 7"/>
												</svg>
											{:else}
												<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
													<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
												</svg>
											{/if}
										</button>
										{@html renderCode(opt.codeExample ?? '')}
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

			<!-- Apply as PR + Copy selected (fallback when PR not available) -->
			<div class="space-y-2 pt-1">
				<p class="text-xs text-muted-foreground">
					{checkedItems.size > 0
						? `${checkedItems.size} optimization${checkedItems.size > 1 ? 's' : ''} selected`
						: 'Select optimizations to apply as a PR or copy to paste manually'}
				</p>
				<div class="flex flex-wrap items-center gap-2">
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
					<button
						type="button"
						onclick={copySelectedCode}
						disabled={checkedItems.size === 0}
						class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border bg-background text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						title="Copy selected code to paste into your workflow manually (e.g. when Apply as PR isn't available)"
					>
						{#if copiedAll}
							<svg class="size-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M5 12l5 5L20 7"/>
							</svg>
							Copied
						{:else}
							<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
								<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
							</svg>
							Copy selected
						{/if}
					</button>
				</div>
				<p class="text-xs text-muted-foreground/80">
					If Apply as PR isn't available (e.g. GitHub App not installed), use Copy selected or the copy icon on each block to paste changes into your workflow file.
				</p>
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
					{#if prError.includes('not installed') || prError.includes('GitHub App') || prError.includes('permission') || prError.includes('404') || prError.includes('401') || prError.includes('403')}
						<p>
							<a href="/settings" class="underline hover:no-underline font-medium">
								Go to Settings → install the GitHub App
							</a>
							on this account or organization to enable write access.
						</p>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	/* AI loading animations */
	.ai-icon-pulse {
		animation: ai-icon-pulse 2.4s ease-in-out infinite;
	}
	@keyframes ai-icon-pulse {
		0%, 100% { transform: scale(1); opacity: 0.9; }
		50% { transform: scale(1.07); opacity: 1; }
	}

	.ai-wand {
		animation: ai-wand-bob 2.4s ease-in-out infinite;
		transform-origin: center;
	}
	@keyframes ai-wand-bob {
		0%, 100% { transform: rotate(-6deg); }
		50% { transform: rotate(6deg); }
	}

	/* Slight highlight for the active step row */
	.bg-primary\/8 {
		background-color: color-mix(in srgb, var(--color-primary, oklch(0.6 0.2 264)) 8%, transparent);
	}

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
