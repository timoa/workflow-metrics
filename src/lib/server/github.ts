import { Octokit } from '@octokit/rest';
import { parse as parseYaml } from 'yaml';
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
	WorkflowFileCommit,
	MinutesDataPoint,
	WorkflowMinutesShare,
	JobMinutesShare,
	StepBreakdown,
	RunnerType,
	WorkflowJobNode,
	WorkflowJobEdge
} from '$lib/types/metrics';
import { buildJobGraphFromWorkflow } from '$lib/server/workflow-graph';

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
export type ProgressCallback = (fetched: number, total: number, page: number) => void;

/** Fetches all workflow runs for the repo in the given date range by paginating through the API. */
export async function fetchAllWorkflowRunsForRepo(
	octokit: Octokit,
	owner: string,
	repo: string,
	created: string,
	onTiming?: TimingCollector,
	onProgress?: ProgressCallback
): Promise<GitHubWorkflowRun[]> {
	const allRuns: GitHubWorkflowRun[] = [];
	let page = 1;
	let totalCount: number | null = null;
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
		// Capture total_count from first page response
		if (totalCount === null) {
			totalCount = typeof data.total_count === 'number' ? data.total_count : runs.length;
		}
		if (onTiming && typeof performance !== 'undefined') {
			onTiming(`GitHub: listWorkflowRunsForRepo page ${page}`, performance.now() - pageStart, {
				runsInPage: runs.length
			});
		}
		allRuns.push(...runs);
		onProgress?.(allRuns.length, totalCount, page);
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
	const skippedCount = completed.filter((r) => r.conclusion === 'skipped').length;

	// Success/failure rates only among runs that actually executed (exclude skipped/cancelled)
	const executedCount = successCount + failureCount;
	const successRate =
		executedCount > 0 ? Math.round((successCount / executedCount) * 1000) / 10 : 0;
	const failureRate =
		executedCount > 0 ? Math.round((failureCount / executedCount) * 1000) / 10 : 0;
	const skipRate =
		workflowRuns.length > 0
			? Math.round((skippedCount / workflowRuns.length) * 1000) / 10
			: 0;

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
		skippedCount,
		successRate,
		failureRate,
		skipRate,
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
		map.set(key, { date: key, success: 0, failure: 0, cancelled: 0, skipped: 0, total: 0 });
	}

	for (const run of runs) {
		const key = run.updated_at.slice(0, 10);
		if (!map.has(key)) continue;
		const point = map.get(key)!;
		point.total++;
		if (run.conclusion === 'success') point.success++;
		else if (run.conclusion === 'failure') point.failure++;
		else if (run.conclusion === 'cancelled') point.cancelled++;
		else if (run.conclusion === 'skipped') point.skipped++;
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

/**
 * GitHub Actions billing multiplier by runner OS.
 * Linux (ubuntu-*): ×1 · Windows (windows-*): ×2 · macOS (macos-*): ×10
 */
function getRunnerMultiplier(labels: string[]): number {
	const s = labels.join(' ').toLowerCase();
	if (s.includes('macos') || s.includes('mac-') || s.includes('osx')) return 10;
	if (s.includes('windows')) return 2;
	return 1;
}

/** Fetches a workflow YAML file from the repo and returns its raw string content. */
async function fetchWorkflowContent(
	octokit: Octokit,
	owner: string,
	repo: string,
	path: string
): Promise<string | null> {
	try {
		const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
		if (!('content' in data) || data.type !== 'file') return null;
		// GitHub returns base64 with embedded newlines — strip them before decoding
		const b64 = (data.content as string).replace(/\n/g, '');
		return atob(b64);
	} catch {
		return null;
	}
}

interface WorkflowRunnerInfo {
	multiplier: number;
	runnerType: RunnerType;
	detected: boolean;
}

/**
 * Parses a GitHub Actions workflow YAML string and returns the runner info.
 * Handles: plain strings, label arrays, and gracefully skips template expressions (${{ }}).
 * Mixed runner types (e.g., ubuntu + macos) are averaged and labelled "mixed".
 */
function parseWorkflowRunners(content: string): WorkflowRunnerInfo {
	try {
		const doc = parseYaml(content) as Record<string, unknown> | null;
		if (!doc || typeof doc !== 'object') return { multiplier: 1, runnerType: 'unknown', detected: false };

		const jobs = doc.jobs as Record<string, unknown> | undefined;
		if (!jobs || typeof jobs !== 'object') return { multiplier: 1, runnerType: 'unknown', detected: false };

		const multipliers: number[] = [];

		for (const job of Object.values(jobs)) {
			if (!job || typeof job !== 'object') continue;
			const jobObj = job as Record<string, unknown>;

			// Reusable workflow calls (`uses:`) have no runner — skip them
			if ('uses' in jobObj) continue;

			const runsOn = jobObj['runs-on'];

			let labels: string[] = [];

			if (runsOn === undefined || runsOn === null) {
				// No runs-on specified → GitHub defaults to ubuntu-latest
				labels = ['ubuntu-latest'];
			} else if (typeof runsOn === 'string') {
				// Skip template expressions — we can't resolve them statically
				if (runsOn.includes('${{')) continue;
				labels = [runsOn];
			} else if (Array.isArray(runsOn)) {
				// Filter out template expressions within arrays
				labels = runsOn.filter((l): l is string => typeof l === 'string' && !l.includes('${{'));
				if (labels.length === 0) continue;
			} else {
				continue;
			}

			multipliers.push(getRunnerMultiplier(labels));
		}

		if (multipliers.length === 0) return { multiplier: 1, runnerType: 'unknown', detected: false };

		const avg = multipliers.reduce((a, b) => a + b, 0) / multipliers.length;
		const unique = [...new Set(multipliers)];

		let runnerType: RunnerType;
		if (unique.length > 1) {
			runnerType = 'mixed';
		} else if (avg >= 10) {
			runnerType = 'macos';
		} else if (avg >= 2) {
			runnerType = 'windows';
		} else {
			runnerType = 'ubuntu';
		}

		return { multiplier: avg, runnerType, detected: true };
	} catch {
		return { multiplier: 1, runnerType: 'unknown', detected: false };
	}
}

/**
 * Fetches and parses the runner info for every workflow in the list in parallel.
 * Returns a Map keyed by workflow id.
 */
async function fetchWorkflowRunnerInfo(
	octokit: Octokit,
	owner: string,
	repo: string,
	workflows: GitHubWorkflow[]
): Promise<Map<number, WorkflowRunnerInfo>> {
	const results = await Promise.all(
		workflows.map(async (w) => {
			const content = await fetchWorkflowContent(octokit, owner, repo, w.path);
			const info = content ? parseWorkflowRunners(content) : { multiplier: 1, runnerType: 'unknown' as RunnerType, detected: false };
			return [w.id, info] as const;
		})
	);
	return new Map(results);
}

/** Returns the raw duration of a run in whole minutes (ceiling), minimum 0. */
function runDurationMinutes(run: GitHubWorkflowRun): number {
	const start = run.run_started_at ?? run.created_at;
	const durationMs = new Date(run.updated_at).getTime() - new Date(start).getTime();
	return Math.max(0, Math.ceil(durationMs / 60_000));
}

interface MinutesOverviewMetrics {
	totalMinutes30d: number;
	billableMinutes30d: number;
	billableIsEstimate: boolean;
	minutesByWorkflow: WorkflowMinutesShare[];
	minutesTrend: MinutesDataPoint[];
	wastedMinutes: number;
	topBranchByMinutes: { branch: string; minutes: number } | null;
}

function computeMinutesOverview(
	runs: GitHubWorkflowRun[],
	workflows: GitHubWorkflow[],
	days: number,
	runnerInfoMap: Map<number, WorkflowRunnerInfo> = new Map()
): MinutesOverviewMetrics {
	const completedRuns = runs.filter((r) => r.status === 'completed');

	// Per-workflow minutes
	const workflowMinutesMap = new Map<number, number>();
	const workflowNameMap = new Map<number, string>(workflows.map((w) => [w.id, w.name]));
	let totalMinutes30d = 0;
	let wastedMinutes = 0;

	// Daily trend map (pre-fill all days in the window)
	const trendMap = new Map<string, number>();
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date();
		d.setDate(d.getDate() - i);
		trendMap.set(d.toISOString().slice(0, 10), 0);
	}

	// Branch minutes map
	const branchMinutesMap = new Map<string, number>();

	for (const run of completedRuns) {
		const minutes = runDurationMinutes(run);
		totalMinutes30d += minutes;

		// Per-workflow
		const prev = workflowMinutesMap.get(run.workflow_id) ?? 0;
		workflowMinutesMap.set(run.workflow_id, prev + minutes);

		// Wasted minutes (failures + cancelled)
		if (run.conclusion === 'failure' || run.conclusion === 'cancelled') {
			wastedMinutes += minutes;
		}

		// Daily trend (keyed by run start date)
		const dateKey = (run.run_started_at ?? run.updated_at).slice(0, 10);
		if (trendMap.has(dateKey)) {
			trendMap.set(dateKey, (trendMap.get(dateKey) ?? 0) + minutes);
		}

		// Branch
		const branch = run.head_branch;
		if (branch) {
			branchMinutesMap.set(branch, (branchMinutesMap.get(branch) ?? 0) + minutes);
		}
	}

	// Build minutesByWorkflow (sorted descending by minutes)
	// Use runner info parsed from workflow YAML files when available
	const minutesByWorkflow: WorkflowMinutesShare[] = Array.from(workflowMinutesMap.entries())
		.map(([workflowId, minutes]) => {
			const runnerInfo = runnerInfoMap.get(workflowId);
			const multiplier = runnerInfo?.multiplier ?? 1;
			const runnerDetected = runnerInfo?.detected ?? false;
			return {
				workflowName: workflowNameMap.get(workflowId) ?? `Workflow ${workflowId}`,
				minutes,
				billableMinutes: Math.ceil(minutes * multiplier),
				percentage: totalMinutes30d > 0 ? Math.round((minutes / totalMinutes30d) * 100) : 0,
				runnerType: (runnerInfo?.runnerType ?? 'unknown') as RunnerType,
				runnerDetected
			};
		})
		.filter((w) => w.minutes > 0)
		.sort((a, b) => b.minutes - a.minutes);

	// Build minutesTrend
	const minutesTrend: MinutesDataPoint[] = Array.from(trendMap.entries()).map(
		([date, minutes]) => ({ date, minutes })
	);

	// Top branch
	let topBranchByMinutes: { branch: string; minutes: number } | null = null;
	if (branchMinutesMap.size > 0) {
		const [branch, minutes] = [...branchMinutesMap.entries()].sort((a, b) => b[1] - a[1])[0];
		topBranchByMinutes = { branch, minutes };
	}

	const billableMinutes30d = minutesByWorkflow.reduce((sum, w) => sum + w.billableMinutes, 0);
	const billableIsEstimate = minutesByWorkflow.some((w) => !w.runnerDetected);

	return {
		totalMinutes30d,
		billableMinutes30d,
		billableIsEstimate,
		minutesByWorkflow,
		minutesTrend,
		wastedMinutes,
		topBranchByMinutes
	};
}

interface MinutesDetailMetrics {
	totalMinutes30d: number;
	billableMinutes30d: number;
	minutesByJob: JobMinutesShare[];
	minutesTrend: MinutesDataPoint[];
	wastedMinutes: number;
	stepBreakdown: StepBreakdown[];
	slowestJobName: string | null;
}

function computeMinutesDetail(
	runs: GitHubWorkflowRun[],
	jobsPerRun: GitHubJob[][],
	jobBreakdown: JobBreakdown[]
): MinutesDetailMetrics {
	const completedRuns = runs.filter((r) => r.status === 'completed');

	// Total minutes and waste from all runs in window (run-level)
	let totalMinutes30d = 0;
	let wastedMinutes = 0;
	const trendMap = new Map<string, number>();
	for (let i = 29; i >= 0; i--) {
		const d = new Date();
		d.setDate(d.getDate() - i);
		trendMap.set(d.toISOString().slice(0, 10), 0);
	}

	for (const run of completedRuns) {
		const minutes = runDurationMinutes(run);
		totalMinutes30d += minutes;
		if (run.conclusion === 'failure' || run.conclusion === 'cancelled') {
			wastedMinutes += minutes;
		}
		const dateKey = (run.run_started_at ?? run.updated_at).slice(0, 10);
		if (trendMap.has(dateKey)) {
			trendMap.set(dateKey, (trendMap.get(dateKey) ?? 0) + minutes);
		}
	}

	const minutesTrend: MinutesDataPoint[] = Array.from(trendMap.entries()).map(
		([date, minutes]) => ({ date, minutes })
	);

	// Per-job minutes from sampled runs — track raw and billable separately
	const jobMinutesMap = new Map<string, number>();
	const jobBillableMap = new Map<string, number>();
	let totalRawFromJobs = 0;
	let totalBillableFromJobs = 0;

	for (const jobs of jobsPerRun) {
		for (const job of jobs) {
			const dur = computeDurationMs(job.started_at, job.completed_at);
			if (dur !== null) {
				const rawMins = Math.max(0, Math.ceil(dur / 60_000));
				const billableMins = rawMins * getRunnerMultiplier(job.labels);
				jobMinutesMap.set(job.name, (jobMinutesMap.get(job.name) ?? 0) + rawMins);
				jobBillableMap.set(job.name, (jobBillableMap.get(job.name) ?? 0) + billableMins);
				totalRawFromJobs += rawMins;
				totalBillableFromJobs += billableMins;
			}
		}
	}
	const totalJobMinutes = Array.from(jobMinutesMap.values()).reduce((a, b) => a + b, 0);
	const minutesByJob: JobMinutesShare[] = Array.from(jobMinutesMap.entries())
		.map(([jobName, minutes]) => ({
			jobName,
			minutes,
			billableMinutes: jobBillableMap.get(jobName) ?? minutes,
			percentage: totalJobMinutes > 0 ? Math.round((minutes / totalJobMinutes) * 100) : 0
		}))
		.filter((j) => j.minutes > 0)
		.sort((a, b) => b.minutes - a.minutes);

	// Estimate billable for all 30 days using the avg multiplier from sampled jobs
	const avgMultiplier = totalRawFromJobs > 0 ? totalBillableFromJobs / totalRawFromJobs : 1;
	const billableMinutes30d = Math.round(totalMinutes30d * avgMultiplier);

	// Step breakdown for the slowest job
	const slowestJob = [...jobBreakdown].sort((a, b) => b.avgDurationMs - a.avgDurationMs)[0];
	const slowestJobName = slowestJob?.jobName ?? null;
	const stepDurations = new Map<string, number[]>();
	if (slowestJob) {
		for (const jobs of jobsPerRun) {
			const match = jobs.find((j) => j.name === slowestJob.jobName);
			if (match) {
				for (const step of match.steps) {
					const dur = computeDurationMs(step.started_at, step.completed_at);
					if (dur !== null && dur > 0) {
						if (!stepDurations.has(step.name)) stepDurations.set(step.name, []);
						stepDurations.get(step.name)!.push(dur);
					}
				}
			}
		}
	}
	const stepBreakdown: StepBreakdown[] = Array.from(stepDurations.entries())
		.map(([stepName, durs]) => ({
			stepName,
			avgDurationMs: Math.round(durs.reduce((a, b) => a + b, 0) / durs.length),
			samples: durs.length
		}))
		.sort((a, b) => b.avgDurationMs - a.avgDurationMs);

	return {
		totalMinutes30d,
		billableMinutes30d,
		minutesByJob,
		minutesTrend,
		wastedMinutes,
		stepBreakdown,
		slowestJobName
	};
}

export interface BuildDashboardDataOptions {
	onTiming?: TimingCollector;
	/** When set, skip fetching runs from GitHub and use this array instead (e.g. from cache). */
	cachedRuns?: GitHubWorkflowRun[];
	/** Called with the fetched runs when we hit GitHub (so the caller can cache them). */
	onRunsFetched?: (runs: GitHubWorkflowRun[]) => void;
	/** Number of days to look back. Defaults to 30. Use 7 for a fast first load. */
	days?: number;
	/** Called after each paginated page when fetching from GitHub. Useful for streaming progress. */
	onProgress?: ProgressCallback;
}

export async function buildDashboardData(
	octokit: Octokit,
	owner: string,
	repo: string,
	options?: BuildDashboardDataOptions
): Promise<DashboardData> {
	const { onTiming, cachedRuns, onRunsFetched, onProgress, days = 30 } = options ?? {};
	const now = typeof performance !== 'undefined' ? () => performance.now() : () => 0;
	const timing = (label: string, ms: number, meta?: Record<string, number>) => {
		onTiming?.(label, ms, meta);
	};

	const windowStart = new Date();
	windowStart.setDate(windowStart.getDate() - days);
	const created = `>=${windowStart.toISOString().slice(0, 10)}`;

	let runs: GitHubWorkflowRun[];
	let workflows: GitHubWorkflow[];
	let workflowFileCommits: WorkflowFileCommit[];

	if (cachedRuns != null) {
		timing('cache: use cached runs', 0, { runs: cachedRuns.length });
		runs = cachedRuns;
		const start = now();
		[workflows, workflowFileCommits] = await Promise.all([
			fetchWorkflows(octokit, owner, repo),
			fetchWorkflowFileCommits(octokit, owner, repo, windowStart).catch(
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
			fetchAllWorkflowRunsForRepo(octokit, owner, repo, created, onTiming, onProgress),
			(async () => {
				const start = now();
				const c = await fetchWorkflowFileCommits(octokit, owner, repo, windowStart).catch(
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

	const runnerInfoStart = now();
	const runnerInfoMap = await fetchWorkflowRunnerInfo(octokit, owner, repo, workflows);
	timing('GitHub: fetchWorkflowRunnerInfo', now() - runnerInfoStart, {
		workflows: runnerInfoMap.size
	});

	const minutesStart = now();
	const minutesMetrics = computeMinutesOverview(runs, workflows, days, runnerInfoMap);
	timing('compute: computeMinutesOverview', now() - minutesStart, { runs: runs.length });

	const completedRuns = runs.filter((r) => r.status === 'completed');
	const successRuns = completedRuns.filter((r) => r.conclusion === 'success');
	const failureRuns = completedRuns.filter((r) => r.conclusion === 'failure');
	const skippedRuns = completedRuns.filter((r) => r.conclusion === 'skipped');
	const executedRuns = successRuns.length + failureRuns.length;
	const successRate =
		executedRuns > 0 ? Math.round((successRuns.length / executedRuns) * 1000) / 10 : 0;
	const totalSkipped = skippedRuns.length;
	const skipRate =
		completedRuns.length > 0
			? Math.round((totalSkipped / completedRuns.length) * 1000) / 10
			: 0;

	const durations = completedRuns
		.map((r) => computeDurationMs(r.run_started_at, r.updated_at))
		.filter((d): d is number => d !== null);
	const avgDurationMs =
		durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

	return {
		owner,
		repo,
		totalRuns: runs.length,
		totalRunsIsCapped: runs.length >= 1000,
		successRate,
		totalSkipped,
		skipRate,
		avgDurationMs: Math.round(avgDurationMs),
		activeWorkflows: workflows.filter((w) => w.state === 'active').length,
		runTrend,
		workflowMetrics,
		recentRuns,
		workflowFileCommits,
		dora,
		timeWindowDays: days,
		...minutesMetrics
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

	const minutesMetrics = computeMinutesDetail(runs, jobsPerRun, jobBreakdown);

	let jobGraphNodes: WorkflowJobNode[] = [];
	let jobGraphEdges: WorkflowJobEdge[] = [];

	const workflowContent = await fetchWorkflowContent(octokit, owner, repo, workflow.path);
	const durationByJob = new Map<string, JobBreakdown>();
	for (const jb of jobBreakdown) {
		durationByJob.set(jb.jobName, jb);
	}

	const minutesByJobMap = new Map<string, JobMinutesShare>();
	for (const m of minutesMetrics.minutesByJob) {
		minutesByJobMap.set(m.jobName, m);
	}

	const successStats = new Map<
		string,
		{
			success: number;
			total: number;
		}
	>();

	for (const jobs of jobsPerRun) {
		for (const job of jobs) {
			if (job.conclusion === null) continue;
			const name = job.name;
			const current = successStats.get(name) ?? { success: 0, total: 0 };
			if (job.conclusion === 'success') {
				current.success += 1;
			}
			current.total += 1;
			successStats.set(name, current);
		}
	}

	if (workflowContent) {
		const baseGraph = buildJobGraphFromWorkflow(workflowContent);

		if (baseGraph.nodes.length > 0) {
			jobGraphNodes = baseGraph.nodes.map((node) => {
				const durations = durationByJob.get(node.jobName);
				const minutes = minutesByJobMap.get(node.jobName);
				const success = successStats.get(node.jobName);
				const runCount = success?.total ?? durations?.samples ?? 0;
				const successRate =
					success && success.total > 0
						? Math.round((success.success / success.total) * 1000) / 10
						: 0;
				const minutesShare = minutes?.percentage ?? 0;

				return {
					...node,
					avgDurationMs: durations?.avgDurationMs ?? 0,
					minDurationMs: durations?.minDurationMs ?? 0,
					maxDurationMs: durations?.maxDurationMs ?? 0,
					runCount,
					successRate,
					minutesShare
				};
			});

			jobGraphEdges = baseGraph.edges;
		}
	}

	// Fallback: if we couldn't build a graph from the workflow file, at least
	// surface one node per job based on minutes/metrics (no dependencies).
	if (jobGraphNodes.length === 0 && minutesMetrics.minutesByJob.length > 0) {
		jobGraphNodes = minutesMetrics.minutesByJob.map((m, index) => {
			const durations = durationByJob.get(m.jobName);
			const success = successStats.get(m.jobName);
			const runCount = success?.total ?? durations?.samples ?? 0;
			const successRate =
				success && success.total > 0
					? Math.round((success.success / success.total) * 1000) / 10
					: 0;

			return {
				id: m.jobName,
				jobName: m.jobName,
				runnerLabel: '',
				stepCount: 0,
				avgDurationMs: durations?.avgDurationMs ?? 0,
				minDurationMs: durations?.minDurationMs ?? 0,
				maxDurationMs: durations?.maxDurationMs ?? 0,
				runCount,
				successRate,
				minutesShare: m.percentage,
				columnIndex: index, // Horizontal: each job in its own column
				rowIndex: 0
			};
		});
		jobGraphEdges = [];
	}

	// Final fallback: if we still have no nodes but we do have a job breakdown,
	// surface one node per job using duration metrics only (no dependencies).
	if (jobGraphNodes.length === 0 && jobBreakdown.length > 0) {
		const minutesByJobMapForFallback = new Map<string, JobMinutesShare>();
		for (const m of minutesMetrics.minutesByJob) {
			minutesByJobMapForFallback.set(m.jobName, m);
		}

		jobGraphNodes = jobBreakdown.map((jb, index) => {
			const minutes = minutesByJobMapForFallback.get(jb.jobName);
			const success = successStats.get(jb.jobName);
			const runCount = success?.total ?? jb.samples ?? 0;
			const successRate =
				success && success.total > 0
					? Math.round((success.success / success.total) * 1000) / 10
					: 0;

			return {
				id: jb.jobName,
				jobName: jb.jobName,
				runnerLabel: '',
				stepCount: 0,
				avgDurationMs: jb.avgDurationMs,
				minDurationMs: jb.minDurationMs,
				maxDurationMs: jb.maxDurationMs,
				runCount,
				successRate,
				minutesShare: minutes?.percentage ?? 0,
				columnIndex: index, // Horizontal: each job in its own column
				rowIndex: 0
			};
		});

		jobGraphEdges = [];
	}

	return {
		workflowId,
		workflowName: workflow.name,
		workflowPath: workflow.path,
		metrics,
		durationTrend,
		runHistory: buildRunTrend(runs),
		jobBreakdown,
		recentRuns: runsToRecentRuns(runs, workflows).slice(0, 100),
		...minutesMetrics,
		jobGraphNodes,
		jobGraphEdges
	};
}
