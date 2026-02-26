export interface WorkflowMetrics {
	workflowId: number;
	workflowName: string;
	workflowPath: string;
	totalRuns: number;
	successCount: number;
	failureCount: number;
	cancelledCount: number;
	/** Runs that completed with conclusion 'skipped' (e.g. condition not met). Not counted as failures. */
	skippedCount: number;
	/** Success rate among runs that executed: success / (success + failure). 0–100. */
	successRate: number;
	/** Failure rate among runs that executed: failure / (success + failure). 0–100. */
	failureRate: number;
	/** Skip rate: skipped / total runs (0–100). */
	skipRate: number;
	avgDurationMs: number;
	p50DurationMs: number;
	p95DurationMs: number;
	lastRunAt: string | null;
	lastConclusion: string | null;
}

export interface RunDataPoint {
	date: string;
	success: number;
	failure: number;
	cancelled: number;
	skipped: number;
	total: number;
}

/** Commit that touched workflow files (.github/workflows), for chart markers. */
export interface WorkflowFileCommit {
	/** ISO date (YYYY-MM-DD) for positioning on the run history chart. */
	date: string;
	/** Full ISO timestamp from commit. */
	committedAt: string;
	sha: string;
	message: string;
	/** Workflow file path(s) changed, e.g. ['.github/workflows/ci.yml']. */
	paths: string[];
}

export interface DurationDataPoint {
	runId: number;
	runNumber: number;
	startedAt: string;
	durationMs: number;
	conclusion: string | null;
	branch: string | null;
}

export interface JobBreakdown {
	jobName: string;
	avgDurationMs: number;
	maxDurationMs: number;
	minDurationMs: number;
	samples: number;
}

/** DORA metrics (Deployment Frequency, Lead Time, CFR, MTTR) for the dashboard. */
export interface DoraMetrics {
	/** Successful runs per week (and per day) over the window. */
	deploymentFrequency: { perWeek: number; perDay: number };
	/** Median time from commit (or trigger) to run end; null if no data. */
	leadTimeForChangesMs: number | null;
	/** Whether lead time used commit timestamp (true) or trigger→end proxy (false). */
	leadTimeFromCommit: boolean;
	/** Change failure rate 0–100 (failures / (successes + failures)); exclude cancelled/skipped. */
	changeFailureRate: number;
	/** Mean time from failure completion to next success; null if no failure→success pairs. */
	meanTimeToRecoveryMs: number | null;
}

export interface MinutesDataPoint {
	/** YYYY-MM-DD */
	date: string;
	/** Total raw minutes consumed on this date. */
	minutes: number;
}

export type RunnerType = 'ubuntu' | 'windows' | 'macos' | 'mixed' | 'unknown';

export interface WorkflowMinutesShare {
	workflowName: string;
	/** Total raw minutes across all runs in the window. */
	minutes: number;
	/** Billable minutes (raw × OS multiplier). Equals raw when runner OS is unknown. */
	billableMinutes: number;
	/** Percentage share of all minutes (0–100). */
	percentage: number;
	/** Primary runner type detected from the workflow YAML file. */
	runnerType: RunnerType;
	/** True when runner type was successfully parsed from the workflow file. */
	runnerDetected: boolean;
}

export interface JobMinutesShare {
	jobName: string;
	/** Total raw minutes across sampled runs. */
	minutes: number;
	/** Billable minutes computed from runner OS labels (Linux ×1, Windows ×2, macOS ×10). */
	billableMinutes: number;
	/** Percentage share of all job minutes (0–100). */
	percentage: number;
}

export interface StepBreakdown {
	stepName: string;
	avgDurationMs: number;
	samples: number;
}

export interface DashboardData {
	owner: string;
	repo: string;
	totalRuns: number;
	/** True when the reported run count may be capped by the GitHub API (for example at 1,000 runs for filtered queries). */
	totalRunsIsCapped: boolean;
	successRate: number;
	avgDurationMs: number;
	activeWorkflows: number;
	runTrend: RunDataPoint[];
	workflowMetrics: WorkflowMetrics[];
	recentRuns: RecentRun[];
	/** Commits that modified workflow files in the chart window (for vertical markers). */
	workflowFileCommits?: WorkflowFileCommit[];
	dora?: DoraMetrics;
	/** The number of days covered by this data (e.g. 7 or 30). */
	timeWindowDays: number;
	/** Total raw minutes consumed by all completed runs in the window. */
	totalMinutes30d: number;
	/** Estimated billable minutes. Accurate when runner types are detected; otherwise raw minutes. */
	billableMinutes30d: number;
	/** True if one or more workflows had an undetectable runner type (template expressions, etc). */
	billableIsEstimate: boolean;
	/** Per-workflow breakdown of minute consumption. */
	minutesByWorkflow: WorkflowMinutesShare[];
	/** Daily total minutes trend over the window. */
	minutesTrend: MinutesDataPoint[];
	/** Minutes spent in failed or cancelled runs (waste). */
	wastedMinutes: number;
	/** Branch that consumed the most minutes, if any. */
	topBranchByMinutes: { branch: string; minutes: number } | null;
	/** Total runs that completed with conclusion 'skipped' in the window. */
	totalSkipped: number;
	/** Skip rate: skipped / completed runs (0–100). */
	skipRate: number;
}

export interface RecentRun {
	id: number;
	workflowName: string;
	workflowId: number;
	status: string | null;
	conclusion: string | null;
	branch: string | null;
	durationMs: number | null;
	startedAt: string | null;
	htmlUrl: string;
	actor: string | null;
	actorAvatar: string | null;
	runNumber: number;
}

export interface WorkflowDetailData {
	workflowId: number;
	workflowName: string;
	workflowPath: string;
	metrics: WorkflowMetrics;
	durationTrend: DurationDataPoint[];
	runHistory: RunDataPoint[];
	jobBreakdown: JobBreakdown[];
	recentRuns: RecentRun[];
	/** Total raw minutes consumed by completed runs of this workflow in last 30 days. */
	totalMinutes30d: number;
	/** Billable minutes estimated from runner OS of sampled jobs (Linux ×1, Windows ×2, macOS ×10). */
	billableMinutes30d: number;
	/** Per-job breakdown of minute consumption (based on last 5 runs). */
	minutesByJob: JobMinutesShare[];
	/** Daily total minutes trend for this workflow. */
	minutesTrend: MinutesDataPoint[];
	/** Minutes spent in failed or cancelled runs (waste). */
	wastedMinutes: number;
	/** Step-level breakdown for the slowest job (based on last 5 runs). */
	stepBreakdown: StepBreakdown[];
	/** Name of the slowest job used for step breakdown. */
	slowestJobName: string | null;
}

export type OptimizationCategory = 'performance' | 'cost' | 'reliability' | 'security' | 'maintenance';
export type OptimizationEffort = 'Low' | 'Medium' | 'High';

export interface OptimizationItem {
	id: string;
	title: string;
	category: OptimizationCategory;
	explanation: string;
	codeExample?: string;
	estimatedImpact?: string;
	effort: OptimizationEffort;
}

export interface OptimizationSummary {
	expectedAvgDuration?: string;
	expectedSuccessRate?: string;
	expectedP95Duration?: string;
	notes?: string;
}

export interface OptimizationResult {
	optimizations: OptimizationItem[];
	summary: OptimizationSummary;
}

export interface OptimizationHistoryEntry {
	result: OptimizationResult;
	cached: boolean;
	createdAt: string;
	promptTokens?: number;
	completionTokens?: number;
}
