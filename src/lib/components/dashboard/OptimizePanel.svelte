<script lang="ts">
	import { browser } from '$app/environment';
	import { tick } from 'svelte';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import hljs from 'highlight.js/lib/core';
	import yaml from 'highlight.js/lib/languages/yaml';
	import bash from 'highlight.js/lib/languages/bash';
	import json from 'highlight.js/lib/languages/json';
	import javascript from 'highlight.js/lib/languages/javascript';
	import type { WorkflowMetrics } from '$lib/types/metrics';

	hljs.registerLanguage('yaml', yaml);
	hljs.registerLanguage('bash', bash);
	hljs.registerLanguage('json', json);
	hljs.registerLanguage('javascript', javascript);

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	marked.use({
		renderer: {
			code({ text, lang, escaped }) {
				const langClass = lang ? ` language-${lang}` : '';
				const safe = escaped ? text : escapeHtml(text);
				return `<pre class="optimize-code-block"><code class="hljs${langClass}">${safe}</code></pre>\n`;
			}
		}
	});

	const USAGE_MARKER = '__USAGE__';

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
	let rawContent = $state('');
	let error = $state<string | null>(null);
	let done = $state(false);
	let usage = $state<{ promptTokens: number; completionTokens: number } | null>(null);
	let scrollContainer = $state<HTMLDivElement | null>(null);

	function stripUsageAndParse(raw: string): { content: string; usage: { promptTokens: number; completionTokens: number } | null } {
		const idx = raw.indexOf(USAGE_MARKER);
		if (idx === -1) return { content: raw, usage: null };
		try {
			const json = raw.slice(idx + USAGE_MARKER.length).trim();
			const usageData = JSON.parse(json) as { promptTokens: number; completionTokens: number };
			return { content: raw.slice(0, idx).trimEnd(), usage: usageData };
		} catch {
			return { content: raw.slice(0, idx).trimEnd(), usage: null };
		}
	}

	const displayContent = $derived((() => {
		const idx = rawContent.indexOf(USAGE_MARKER);
		return idx === -1 ? rawContent : rawContent.slice(0, idx).trimEnd();
	})());

	async function optimize() {
		loading = true;
		error = null;
		rawContent = '';
		usage = null;
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
				rawContent += decoder.decode(value, { stream: true });
			}
			const { usage: parsedUsage } = stripUsageAndParse(rawContent);
			usage = parsedUsage;
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

	const renderedHtml = $derived(
		browser && displayContent
			? DOMPurify.sanitize(marked.parse(displayContent, { async: false }) as string)
			: ''
	);

	// Auto-scroll to follow stream and run syntax highlighting after DOM update
	$effect(() => {
		if (!renderedHtml || !scrollContainer) return;
		void tick().then(() => {
			scrollContainer?.querySelectorAll('pre code.hljs').forEach((el) => {
				hljs.highlightElement(el as HTMLElement);
			});
			scrollContainer.scrollTop = scrollContainer.scrollHeight;
		});
	});

	function formatTokens(n: number): string {
		if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
		return n.toLocaleString();
	}
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
		<div class="flex items-center gap-3">
			{#if usage}
				<span class="text-xs text-muted-foreground tabular-nums" title="Response tokens">
					{formatTokens(usage.completionTokens)} tokens
				</span>
			{/if}
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
		{:else if loading && !rawContent}
			<div class="flex flex-col items-center justify-center py-12 gap-4 text-muted-foreground">
				<div class="relative">
					<svg class="size-10 animate-spin text-primary/60" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
					</svg>
					<span class="absolute inset-0 flex items-center justify-center text-primary text-xs font-medium">AI</span>
				</div>
				<p class="text-sm font-medium text-foreground">Analyzing your workflow</p>
				<p class="text-xs max-w-xs text-center">Mistral AI is reviewing metrics and YAML to suggest optimizations…</p>
				<div class="flex gap-1 mt-2">
					<span class="size-2 rounded-full bg-primary/40 animate-pulse" style="animation-delay: 0ms"></span>
					<span class="size-2 rounded-full bg-primary/40 animate-pulse" style="animation-delay: 150ms"></span>
					<span class="size-2 rounded-full bg-primary/40 animate-pulse" style="animation-delay: 300ms"></span>
				</div>
			</div>
		{:else if displayContent}
			<div class="optimize-prose prose prose-sm dark:prose-invert max-w-none">
				<div
					bind:this={scrollContainer}
					class="optimize-stream-container text-sm text-foreground leading-relaxed rounded-lg p-4 max-h-96 overflow-y-auto bg-muted/30"
				>
					{#if browser}
						{@html renderedHtml}
					{:else}
						<span class="whitespace-pre-wrap font-mono text-xs">{displayContent}</span>
					{/if}
					{#if loading}
						<span class="inline-block size-2 bg-primary rounded-full animate-pulse ml-0.5"></span>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Tighter scroll follow container */
	.optimize-stream-container {
		scroll-behavior: auto;
	}

	/* More spacing between prose elements */
	:global(.optimize-prose) :global(h1) {
		margin-top: 1.5em;
		margin-bottom: 0.75em;
		line-height: 1.3;
	}
	:global(.optimize-prose) :global(h1:first-child) {
		margin-top: 0;
	}
	:global(.optimize-prose) :global(h2) {
		margin-top: 1.5em;
		margin-bottom: 0.5em;
		line-height: 1.35;
	}
	:global(.optimize-prose) :global(h3) {
		margin-top: 1.25em;
		margin-bottom: 0.4em;
	}
	:global(.optimize-prose) :global(p) {
		margin-top: 0.75em;
		margin-bottom: 0.75em;
	}
	:global(.optimize-prose) :global(ul),
	:global(.optimize-prose) :global(ol) {
		margin-top: 0.5em;
		margin-bottom: 0.75em;
		padding-left: 1.5em;
	}
	:global(.optimize-prose) :global(li) {
		margin-top: 0.25em;
	}
	:global(.optimize-prose) :global(hr) {
		margin-top: 1.5em;
		margin-bottom: 1.5em;
	}

	/* Dark code blocks with syntax highlighting */
	:global(.optimize-prose) :global(.optimize-code-block) {
		background: #0d1117;
		border-radius: 0.5rem;
		padding: 1rem 1.25rem;
		margin: 1em 0;
		overflow-x: auto;
	}
	:global(.optimize-prose) :global(.optimize-code-block code) {
		background: transparent;
		padding: 0;
		font-size: 0.8125rem;
		line-height: 1.5;
		color: #e6edf3;
	}
	:global(.optimize-prose) :global(.optimize-code-block .hljs-keyword),
	:global(.optimize-prose) :global(.optimize-code-block .hljs-selector-tag) {
		color: #ff7b72;
	}
	:global(.optimize-prose) :global(.optimize-code-block .hljs-attr),
	:global(.optimize-prose) :global(.optimize-code-block .hljs-variable) {
		color: #79c0ff;
	}
	:global(.optimize-prose) :global(.optimize-code-block .hljs-string),
	:global(.optimize-prose) :global(.optimize-code-block .hljs-addition) {
		color: #a5d6ff;
	}
	:global(.optimize-prose) :global(.optimize-code-block .hljs-number) {
		color: #79c0ff;
	}
	:global(.optimize-prose) :global(.optimize-code-block .hljs-comment),
	:global(.optimize-prose) :global(.optimize-code-block .hljs-quote) {
		color: #8b949e;
	}
	:global(.optimize-prose) :global(.optimize-code-block .hljs-built_in),
	:global(.optimize-prose) :global(.optimize-code-block .hljs-title) {
		color: #d2a8ff;
	}
	:global(.optimize-prose) :global(.optimize-code-block .hljs-meta) {
		color: #8b949e;
	}
</style>
