<script lang="ts">
	import type { RecentRun } from '$lib/types/metrics';
	import { formatDuration, formatRelativeTime, statusLabel, conclusionColor } from '$lib/utils';

	let { runs, owner, repo }: { runs: RecentRun[]; owner: string; repo: string } = $props();
</script>

<div class="bg-card border border-border rounded-xl overflow-hidden">
	<div class="p-5 border-b border-border">
		<h3 class="text-sm font-semibold text-foreground">Recent Runs</h3>
	</div>

	{#if runs.length === 0}
		<div class="flex items-center justify-center h-24 text-muted-foreground text-sm">
			No recent runs
		</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border">
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Workflow</th>
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Status</th>
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Branch</th>
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Duration</th>
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Started</th>
						<th class="text-left text-xs font-medium text-muted-foreground px-5 py-3">Triggered by</th>
					</tr>
				</thead>
				<tbody>
					{#each runs as run}
						<tr class="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
							<td class="px-5 py-3">
								<div class="flex items-center gap-2">
									<a
										href="/dashboard/workflow/{run.workflowId}?owner={owner}&repo={repo}"
										class="font-medium text-foreground hover:text-primary transition-colors truncate max-w-48"
										title={run.workflowName}
									>
										{run.workflowName}
									</a>
									<span class="text-xs text-muted-foreground flex-shrink-0">#{run.runNumber}</span>
								</div>
							</td>
							<td class="px-5 py-3">
								<span class="flex items-center gap-1.5 {conclusionColor(run.conclusion)}">
									{#if run.status === 'in_progress'}
										<svg class="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
											<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
											<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
										</svg>
									{:else if run.conclusion === 'success'}
										<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
											<path d="m5 12 5 5L20 7"/>
										</svg>
									{:else if run.conclusion === 'failure'}
										<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
											<path d="M18 6 6 18M6 6l12 12"/>
										</svg>
									{:else}
										<svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/>
											<line x1="12" x2="12.01" y1="16" y2="16"/>
										</svg>
									{/if}
									<span class="text-xs font-medium">
										{statusLabel(run.status, run.conclusion)}
									</span>
								</span>
							</td>
							<td class="px-5 py-3">
								<span class="text-xs bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 font-mono">
									{run.branch ?? '—'}
								</span>
							</td>
							<td class="px-5 py-3 text-xs text-muted-foreground">
								{formatDuration(run.durationMs)}
							</td>
							<td class="px-5 py-3 text-xs text-muted-foreground">
								{formatRelativeTime(run.startedAt)}
							</td>
							<td class="px-5 py-3">
								{#if run.actor}
									<div class="flex items-center gap-1.5">
										<img
											src={run.actorAvatar ?? undefined}
											alt={run.actor}
											class="size-5 rounded-full"
										/>
										<span class="text-xs text-muted-foreground">{run.actor}</span>
									</div>
								{:else}
									<span class="text-xs text-muted-foreground">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
