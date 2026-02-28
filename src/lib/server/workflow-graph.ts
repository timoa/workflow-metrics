import { parse as parseYaml } from 'yaml';
import type { WorkflowJobEdge, WorkflowJobNode } from '$lib/types/metrics';

type RawJob = {
	name?: unknown;
	'runs-on'?: unknown;
	needs?: unknown;
	steps?: unknown;
	uses?: unknown;
};

type RawWorkflow = {
	jobs?: Record<string, RawJob>;
};

export function parseWorkflowYaml(content: string): RawWorkflow {
	try {
		const doc = parseYaml(content) as unknown;
		if (!doc || typeof doc !== 'object') return { jobs: {} };
		const jobs = (doc as { jobs?: unknown }).jobs;
		if (!jobs || typeof jobs !== 'object') return { jobs: {} };
		return { jobs: jobs as Record<string, RawJob> };
	} catch {
		return { jobs: {} };
	}
}

function normalizeNeeds(value: unknown): string[] {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) {
		return value.filter((v): v is string => typeof v === 'string');
	}
	return [];
}

function normalizeRunsOn(value: unknown, isReusable: boolean): string {
	if (isReusable) return '';
	if (value == null) return 'ubuntu-latest';
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) {
		const labels = value.filter((v): v is string => typeof v === 'string');
		return labels.join(', ');
	}
	return '';
}

function countSteps(value: unknown, isReusable: boolean): number {
	if (isReusable) return 0;
	if (!Array.isArray(value)) return 0;
	return value.length;
}

export function buildJobGraphFromWorkflow(content: string): {
	nodes: WorkflowJobNode[];
	edges: WorkflowJobEdge[];
} {
	const { jobs = {} } = parseWorkflowYaml(content);
	const jobIds = Object.keys(jobs);

	if (jobIds.length === 0) {
		return { nodes: [], edges: [] };
	}

	const needsMap = new Map<string, string[]>();
	for (const [id, job] of Object.entries(jobs)) {
		const rawNeeds = (job as RawJob).needs;
		needsMap.set(id, normalizeNeeds(rawNeeds));
	}

	const remaining = new Set(jobIds);
	const placed = new Set<string>();
	const columns: string[][] = [];

	while (remaining.size > 0) {
		const column: string[] = [];
		for (const id of remaining) {
			const needs = needsMap.get(id) ?? [];
			const allSatisfied = needs.every((n) => !jobIds.includes(n) || placed.has(n));
			if (allSatisfied) {
				column.push(id);
			}
		}

		if (column.length === 0) {
			// Cycle or broken reference; place one job to keep progress.
			const [first] = remaining;
			if (first == null) break;
			column.push(first);
		}

		for (const id of column) {
			remaining.delete(id);
			placed.add(id);
		}
		columns.push(column);
	}

	const nodes: WorkflowJobNode[] = [];
	const edges: WorkflowJobEdge[] = [];

	for (const [id, job] of Object.entries(jobs)) {
		const needs = needsMap.get(id) ?? [];
		for (const n of needs) {
			if (!jobs[n]) continue;
			const edgeId = `${n}->${id}`;
			edges.push({
				id: edgeId,
				source: n,
				target: id
			});
		}
	}

	columns.forEach((column, columnIndex) => {
		column.forEach((id, rowIndex) => {
			const job = jobs[id] as RawJob;
			const isReusable = typeof job.uses === 'string';
			const runnerLabel = normalizeRunsOn(job['runs-on'], isReusable);
			const stepCount = countSteps(job.steps, isReusable);
			const label =
				typeof job.name === 'string' && job.name.trim().length > 0 ? job.name : id;

			nodes.push({
				id,
				jobName: label,
				runnerLabel,
				stepCount,
				avgDurationMs: 0,
				minDurationMs: 0,
				maxDurationMs: 0,
				runCount: 0,
				successRate: 0,
				minutesShare: 0,
				columnIndex,
				rowIndex
			});
		});
	});

	return { nodes, edges };
}

