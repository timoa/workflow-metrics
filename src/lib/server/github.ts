import { Octokit } from '@octokit/rest';
import {
	computeDurationMs,
	percentile
} from '$lib/utils';
import type {
	GitHubWorkflow,
	GitHubWorkflowRun,
	GitHubJob
} from '$lib/types/github';
import type {
	DashboardData,
	WorkflowDetailData,
	WorkflowMetrics,
	RunDataPoint,
	DurationDataPoint,
	RecentRun,
	JobBreakdown
} from '$lib/types/metrics';

export function createOctokit(accessToken: string): Octokit {
	return new Octokit({ auth: accessToken });
}

export async function fetchWorkflows(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<GitHubWorkflow[]> {
	const { data } = await octokit.rest.actions.listRepoWorkflows({ owner, repo, per_page: 100 });
	return data.workflows as GitHubWorkflow[];
}

export async function fetchWorkflowRuns(
	octokit: Octokit,
	owner: string,
	repo: string,
	options: { per_page?: number; page?: number; created?: string } = {}
): Promise<GitHubWorkflowRun[]> {
	const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
		owner,
		repo,
		per_page: options.per_page ?? 100,
		page: options.page ?? 1,
		...(options.created ? { created: options.created } : {})
	});
	return data.workflow_runs as unknown as GitHubWorkflowRun[];
}

export async function fetchSingleWorkflowRuns(
	octokit: Octokit,
	owner: string,
	repo: string,
	workflowId: number,
	options: { per_page?: number; page?: number } = {}
): Promise<GitHubWorkflowRun[]> {
	const { data } = await octokit.rest.actions.listWorkflowRuns({
		owner,
		repo,
		workflow_id: workflowId,
		per_page: options.per_page ?? 100,
		page: options.page ?? 1
	});
	return data.workflow_runs as unknown as GitHubWorkflowRun[];
}

export async function fetchJobsForRun(
	octokit: Octokit,
	owner: string,
	repo: string,
	runId: number
): Promise<GitHubJob[]> {
	const { data } = await octokit.rest.actions.listJobsForWorkflowRun({
		owner,
		repo,
		run_id: runId,
		per_page: 100
	});
	return data.jobs as unknown as GitHubJob[];
}

function computeWorkflowMetrics(
	workflow: GitHubWorkflow,
	runs: GitHubWorkflowRun[]
): WorkflowMetrics {
	const workflowRuns = runs.filter((r) => r.workflow_id === workflow.id);
	const completed = workflowRuns.filter((r) => r.status === 'completed');
	const successCount = completed.filter((r) => r.conclusion === 'success').length;
	const failureCount = completed.filter((r) => r.conclusion === 'failure').length;
	const cancelledCount = completed.filter((r) => r.conclusion === 'cancelled').length;

	const durations = completed
		.map((r) => computeDurationMs(r.run_started_at, r.updated_at))
		.filter((d): d is number => d !== null)
		.sort((a, b) => a - b);

	const avgDurationMs =
		durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

	const sortedAsc = [...durations].sort((a, b) => a - b);
	const lastRun = workflowRuns[0];

	return {
		workflowId: workflow.id,
		workflowName: workflow.name,
		workflowPath: workflow.path,
		totalRuns: workflowRuns.length,
		successCount,
		failureCount,
		cancelledCount,
		successRate: completed.length > 0 ? (successCount / completed.length) * 100 : 0,
		avgDurationMs: Math.round(avgDurationMs),
		p50DurationMs: Math.round(percentile(sortedAsc, 50)),
		p95DurationMs: Math.round(percentile(sortedAsc, 95)),
		lastRunAt: lastRun?.updated_at ?? null,
		lastConclusion: lastRun?.conclusion ?? null
	};
}

function buildRunTrend(runs: GitHubWorkflowRun[], days = 30): RunDataPoint[] {
	const map = new Map<string, RunDataPoint>();

	for (let i = days - 1; i >= 0; i--) {
		const d = new Date();
		d.setDate(d.getDate() - i);
		const key = d.toISOString().slice(0, 10);
		map.set(key, { date: key, success: 0, failure: 0, cancelled: 0, total: 0 });
	}

	for (const run of runs) {
		const key = run.updated_at.slice(0, 10);
		if (!map.has(key)) continue;
		const point = map.get(key)!;
		point.total++;
		if (run.conclusion === 'success') point.success++;
		else if (run.conclusion === 'failure') point.failure++;
		else if (run.conclusion === 'cancelled') point.cancelled++;
	}

	return Array.from(map.values());
}

function runsToRecentRuns(runs: GitHubWorkflowRun[], workflows: GitHubWorkflow[]): RecentRun[] {
	const workflowMap = new Map(workflows.map((w) => [w.id, w.name]));
	return runs.slice(0, 30).map((r) => ({
		id: r.id,
		workflowName: r.name ?? workflowMap.get(r.workflow_id) ?? 'Unknown',
		workflowId: r.workflow_id,
		status: r.status,
		conclusion: r.conclusion,
		branch: r.head_branch,
		durationMs: computeDurationMs(r.run_started_at, r.updated_at),
		startedAt: r.run_started_at ?? r.created_at,
		htmlUrl: r.html_url,
		actor: r.actor?.login ?? null,
		actorAvatar: r.actor?.avatar_url ?? null,
		runNumber: r.run_number
	}));
}

export async function buildDashboardData(
	octokit: Octokit,
	owner: string,
	repo: string
): Promise<DashboardData> {
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const created = `>=${thirtyDaysAgo.toISOString().slice(0, 10)}`;

	const [workflows, runs] = await Promise.all([
		fetchWorkflows(octokit, owner, repo),
		fetchWorkflowRuns(octokit, owner, repo, { per_page: 100, created })
	]);

	const workflowMetrics = workflows.map((w) => computeWorkflowMetrics(w, runs));
	const completedRuns = runs.filter((r) => r.status === 'completed');
	const successRuns = completedRuns.filter((r) => r.conclusion === 'success');
	const durations = completedRuns
		.map((r) => computeDurationMs(r.run_started_at, r.updated_at))
		.filter((d): d is number => d !== null);
	const avgDurationMs =
		durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

	return {
		owner,
		repo,
		totalRuns: runs.length,
		successRate: completedRuns.length > 0 ? (successRuns.length / completedRuns.length) * 100 : 0,
		avgDurationMs: Math.round(avgDurationMs),
		activeWorkflows: workflows.filter((w) => w.state === 'active').length,
		runTrend: buildRunTrend(runs),
		workflowMetrics,
		recentRuns: runsToRecentRuns(runs, workflows)
	};
}

export async function buildWorkflowDetailData(
	octokit: Octokit,
	owner: string,
	repo: string,
	workflowId: number
): Promise<WorkflowDetailData> {
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

	const [workflows, runs] = await Promise.all([
		fetchWorkflows(octokit, owner, repo),
		fetchSingleWorkflowRuns(octokit, owner, repo, workflowId, { per_page: 100 })
	]);

	const workflow = workflows.find((w) => w.id === workflowId);
	if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

	const completedRuns = runs.filter((r) => r.status === 'completed');

	const durationTrend: DurationDataPoint[] = completedRuns
		.filter((r) => r.run_started_at)
		.map((r) => ({
			runId: r.id,
			runNumber: r.run_number,
			startedAt: r.run_started_at!,
			durationMs: computeDurationMs(r.run_started_at, r.updated_at) ?? 0,
			conclusion: r.conclusion,
			branch: r.head_branch
		}))
		.reverse();

	// Fetch jobs for the last 5 runs to get job breakdown
	const recentCompleted = completedRuns.slice(0, 5);
	const jobsPerRun = await Promise.all(
		recentCompleted.map((r) => fetchJobsForRun(octokit, owner, repo, r.id))
	);

	const jobDurations = new Map<string, number[]>();
	for (const jobs of jobsPerRun) {
		for (const job of jobs) {
			const dur = computeDurationMs(job.started_at, job.completed_at);
			if (dur !== null) {
				if (!jobDurations.has(job.name)) jobDurations.set(job.name, []);
				jobDurations.get(job.name)!.push(dur);
			}
		}
	}

	const jobBreakdown: JobBreakdown[] = Array.from(jobDurations.entries()).map(
		([jobName, durs]) => ({
			jobName,
			avgDurationMs: Math.round(durs.reduce((a, b) => a + b, 0) / durs.length),
			maxDurationMs: Math.max(...durs),
			minDurationMs: Math.min(...durs),
			samples: durs.length
		})
	);

	const metrics = computeWorkflowMetrics(workflow, runs);

	return {
		workflowId,
		workflowName: workflow.name,
		workflowPath: workflow.path,
		metrics,
		durationTrend,
		runHistory: buildRunTrend(runs),
		jobBreakdown,
		recentRuns: runsToRecentRuns(runs, workflows).slice(0, 20)
	};
}
