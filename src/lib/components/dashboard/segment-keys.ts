import type { JobMinutesShare, WorkflowMinutesShare } from '$lib/types/metrics';

/**
 * Build a stable, unique key for donut chart segments.
 * Display names are not guaranteed unique (e.g. duplicate workflow names),
 * so we include index as a deterministic tiebreaker.
 */
export function buildMinutesSegmentKey(
	segment: WorkflowMinutesShare | JobMinutesShare,
	index: number
): string {
	if ('jobName' in segment) {
		return `job:${segment.jobName}:${index}`;
	}

	const pathOrName = segment.workflowPath?.trim() || segment.workflowName?.trim() || 'unknown-workflow';
	return `workflow:${pathOrName}:${index}`;
}
