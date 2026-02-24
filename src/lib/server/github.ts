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
	DoraMetrics,
	WorkflowDetailData,
	WorkflowMetrics,
	RunDataPoint,
	DurationDataPoint,
	RecentRun,
	JobBreakdown,
	WorkflowFileCommit
} from '$lib/types/metrics';

export function createOctokit(accessToken: string): Octokit {
	return new Octokit({ auth: accessToken });
}

/** Detect 401 / Bad credentials from GitHub API (e.g. after OAuth was reset). */
export function isGitHubUnauthorizedError(e: unknown): boolean {
	if (e == null || typeof e !== 'object') return false;
	const err = e as Record<string, unknown>;
	const status =
		typeof err.status === 'number'
			? err.status
			: typeof (err.response as Record<string, unknown>)?.status === 'number'
				? (err.response as Record<string, unknown>).status
				: undefined;
	const data = (err.response as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
	const message = typeof err.message === 'string' ? err.message : typeof data?.message === 'string' ? data.message : '';
	return (
		status === 401 ||
		data?.message === 'Bad credentials' ||
		(message !== '' && message.includes('Bad credentials'))
	);
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

export type TimingCollector = (label: string, ms: number, meta?: Record<string, number>) => void;

/** Fetches all workflow runs for the repo in the given date range by paginating through the API. */
export async function fetchAllWorkflowRunsForRepo(
	octokit: Octokit,
	owner: string,
	repo: string,
	created: string,
	onTiming?: TimingCollector
): Promise<GitHubWorkflowRun[]> {
	const allRuns: GitHubWorkflowRun[] = [];
	let page = 1;
	const totalStart = typeof performance !== 'undefined' ? performance.now() : 0;
	while (true) {
		const pageStart = typeof performance !== 'undefined' ? performance.now() : 0;
		const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
			owner,
			repo,
			created,
			per_page: 100,
			page
		});
		const runs = (data.workflow_runs ?? []) as unknown as GitHubWorkflowRun[];
		if (onTiming && typeof performance !== 'undefined') {
			onTiming(`GitHub: listWorkflowRunsForRepo page ${page}`, performance.now() - pageStart, {
				runsInPage: runs.length
			});
		}
		allRuns.push(...runs);
		if (runs.length < 100) break;
		page++;
	}
	if (onTiming && typeof performance !== 'undefined') {
		onTiming('GitHub: fetchAllWorkflowRunsForRepo (total)', performance.now() - totalStart, {
			totalRuns: allRuns.length,
			pages: page
		});
	}
	return allRuns;
}

export async function fetchSingleWorkflowRuns(
	octokit: Octokit,
	owner: string,
	repo: string,
	workflowId: number,
	options: { per_page?: number; page?: number; created?: string } = {}
): Promise<GitHubWorkflowRun[]> {
	const { data } = await octokit.rest.actions.listWorkflowRuns({
		owner,
		repo,
		workflow_id: workflowId,
		per_page: options.per_page ?? 100,
		page: options.page ?? 1,
		...(options.created ? { created: options.created } : {})
	});
	return data.workflow_runs as unknown as GitHubWorkflowRun[];
}

/** Fetches all workflow runs for a single workflow in the given date range by paginating. */
export async function fetchAllSingleWorkflowRuns(
	octokit: Octokit,
	owner: string,
	repo: string,
	workflowId: number,
	created: string
): Promise<GitHubWorkflowRun[]> {
	const allRuns: GitHubWorkflowRun[] = [];
	let page = 1;
	while (true) {
		const { data } = await octokit.rest.actions.listWorkflowRuns({
			owner,
			repo,
			workflow_id: workflowId,
			created,
			per_page: 100,
			page
		});
		const runs = (data.workflow_runs ?? []) as unknown as GitHubWorkflowRun[];
		allRuns.push(...runs);
		if (runs.length < 100) break;
		page++;
	}
	return allRuns;
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

/** Commits that modified files under .github/workflows in the last N days (for chart markers). */
export async function fetchWorkflowFileCommits(
	octokit: Octokit,
	owner: string,
	repo: string,
	since: Date
): Promise<WorkflowFileCommit[]> {
	const sinceIso = since.toISOString();
	const { data } = await octokit.rest.repos.listCommits({
		owner,
		repo,
		path: '.github/workflows',
		since: sinceIso,
		per_page: 100
	});

	const out: WorkflowFileCommit[] = [];
	for (const c of data as Array<{ sha: string; commit: { message: string; committer?: { date: string } } }>) {
		const committedAt = c.commit?.committer?.date ?? sinceIso;
		const dateKey = committedAt.slice(0, 10);
		out.push({
			date: dateKey,
			committedAt,
			sha: c.sha.slice(0, 7),
			message: (c.commit?.message ?? '').split('\n')[0].slice(0, 80),
			paths: []
		});
	}
	return out;
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

const DAYS_WINDOW = 30;

function computeDoraMetrics(runs: GitHubWorkflowRun[]): DoraMetrics {
	const completed = runs.filter((r) => r.status === 'completed');
	const successCount = completed.filter((r) => r.conclusion === 'success').length;
	const failureCount = completed.filter((r) => r.conclusion === 'failure').length;
	const successOrFailure = completed.filter(
		(r) => r.conclusion === 'success' || r.conclusion === 'failure'
	);

	// Deployment frequency: successful runs per week and per day
	const perWeek = DAYS_WINDOW > 0 ? successCount / (DAYS_WINDOW / 7) : 0;
	const perDay = DAYS_WINDOW > 0 ? successCount / DAYS_WINDOW : 0;

	// Change failure rate: failures / (successes + failures) * 100
	const deployCount = successCount + failureCount;
	const changeFailureRate =
		deployCount > 0 ? Math.round((failureCount / deployCount) * 1000) / 10 : 0;

	// Lead time: commit → run end, or created_at → updated_at as proxy
	const leadTimesMs: number[] = [];
	let usedCommitTimestamp = false;
	for (const r of successOrFailure) {
		const endMs = new Date(r.updated_at).getTime();
		const startMs = r.head_commit?.timestamp
			? new Date(r.head_commit.timestamp).getTime()
			: new Date(r.created_at).getTime();
		if (r.head_commit?.timestamp) usedCommitTimestamp = true;
		if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
			leadTimesMs.push(endMs - startMs);
		}
	}
	const leadTimeForChangesMs =
		leadTimesMs.length > 0 ? Math.round(percentile([...leadTimesMs].sort((a, b) => a - b), 50)) : null;

	// MTTR: for each failure, time until next success (by updated_at)
	const byUpdatedAt = [...completed].sort(
		(a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
	);
	const recoveryTimesMs: number[] = [];
	for (let i = 0; i < byUpdatedAt.length; i++) {
		if (byUpdatedAt[i].conclusion !== 'failure') continue;
		const failureEnd = new Date(byUpdatedAt[i].updated_at).getTime();
		for (let j = i + 1; j < byUpdatedAt.length; j++) {
			if (byUpdatedAt[j].conclusion === 'success') {
				recoveryTimesMs.push(new Date(byUpdatedAt[j].updated_at).getTime() - failureEnd);
				break;
			}
		}
	}
	const meanTimeToRecoveryMs =
		recoveryTimesMs.length > 0
			? Math.round(recoveryTimesMs.reduce((a, b) => a + b, 0) / recoveryTimesMs.length)
			: null;

	return {
		deploymentFrequency: { perWeek, perDay },
		leadTimeForChangesMs,
		leadTimeFromCommit: usedCommitTimestamp,
		changeFailureRate,
		meanTimeToRecoveryMs
	};
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

export interface BuildDashboardDataOptions {
	onTiming?: TimingCollector;
	/** When set, skip fetching runs from GitHub and use this array instead (e.g. from cache). */
	cachedRuns?: GitHubWorkflowRun[];
	/** Called with the fetched runs when we hit GitHub (so the caller can cache them). */
	onRunsFetched?: (runs: GitHubWorkflowRun[]) => void;
}

export async function buildDashboardData(
	octokit: Octokit,
	owner: string,
	repo: string,
	options?: BuildDashboardDataOptions
): Promise<DashboardData> {
	const { onTiming, cachedRuns, onRunsFetched } = options ?? {};
	const now = typeof performance !== 'undefined' ? () => performance.now() : () => 0;
	const timing = (label: string, ms: number, meta?: Record<string, number>) => {
		onTiming?.(label, ms, meta);
	};

	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const created = `>=${thirtyDaysAgo.toISOString().slice(0, 10)}`;

	let runs: GitHubWorkflowRun[];
	let workflows: GitHubWorkflow[];
	let workflowFileCommits: WorkflowFileCommit[];

	if (cachedRuns != null) {
		timing('cache: use cached runs', 0, { runs: cachedRuns.length });
		runs = cachedRuns;
		const start = now();
		[workflows, workflowFileCommits] = await Promise.all([
			fetchWorkflows(octokit, owner, repo),
			fetchWorkflowFileCommits(octokit, owner, repo, thirtyDaysAgo).catch(
				() => [] as WorkflowFileCommit[]
			)
		]);
		timing('GitHub: fetchWorkflows + fetchWorkflowFileCommits (cache hit)', now() - start, {
			workflows: workflows.length,
			commits: workflowFileCommits.length
		});
	} else {
		const parallelStart = now();
		[workflows, runs, workflowFileCommits] = await Promise.all([
			(async () => {
				const start = now();
				const w = await fetchWorkflows(octokit, owner, repo);
				timing('GitHub: fetchWorkflows', now() - start, { count: w.length });
				return w;
			})(),
			fetchAllWorkflowRunsForRepo(octokit, owner, repo, created, onTiming),
			(async () => {
				const start = now();
				const c = await fetchWorkflowFileCommits(octokit, owner, repo, thirtyDaysAgo).catch(
					() => [] as WorkflowFileCommit[]
				);
				timing('GitHub: fetchWorkflowFileCommits', now() - start, { count: c.length });
				return c;
			})()
		]);
		timing('GitHub: Promise.all(workflows, runs, commits)', now() - parallelStart);
		await onRunsFetched?.(runs);
	}

	const computeStart = now();
	const workflowMetrics = workflows.map((w) => computeWorkflowMetrics(w, runs));
	timing('compute: workflowMetrics', now() - computeStart, { workflows: workflows.length });

	const trendStart = now();
	const runTrend = buildRunTrend(runs);
	timing('compute: buildRunTrend', now() - trendStart, { runs: runs.length });

	const recentStart = now();
	const recentRuns = runsToRecentRuns(runs, workflows);
	timing('compute: runsToRecentRuns', now() - recentStart);

	const doraStart = now();
	const dora = computeDoraMetrics(runs);
	timing('compute: computeDoraMetrics', now() - doraStart, { runs: runs.length });

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
		runTrend,
		workflowMetrics,
		recentRuns,
		workflowFileCommits,
		dora
	};
}

export interface BuildWorkflowDetailDataOptions {
	/** When set, skip fetching runs from GitHub and use this array instead (e.g. from cache). */
	cachedRuns?: GitHubWorkflowRun[];
	/** Called with the fetched runs when we hit GitHub (so the caller can cache them). */
	onRunsFetched?: (runs: GitHubWorkflowRun[]) => void | Promise<void>;
}

export async function buildWorkflowDetailData(
	octokit: Octokit,
	owner: string,
	repo: string,
	workflowId: number,
	options?: BuildWorkflowDetailDataOptions
): Promise<WorkflowDetailData> {
	const { cachedRuns, onRunsFetched } = options ?? {};
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const created = `>=${thirtyDaysAgo.toISOString().slice(0, 10)}`;

	let runs: GitHubWorkflowRun[];
	let workflows: GitHubWorkflow[];

	if (cachedRuns != null) {
		runs = cachedRuns;
		workflows = await fetchWorkflows(octokit, owner, repo);
	} else {
		[workflows, runs] = await Promise.all([
			fetchWorkflows(octokit, owner, repo),
			fetchAllSingleWorkflowRuns(octokit, owner, repo, workflowId, created)
		]);
		await onRunsFetched?.(runs);
	}

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
