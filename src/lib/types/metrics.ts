export interface WorkflowMetrics {
	workflowId: number;
	workflowName: string;
	workflowPath: string;
	totalRuns: number;
	successCount: number;
	failureCount: number;
	cancelledCount: number;
	successRate: number;
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

export interface DashboardData {
	owner: string;
	repo: string;
	totalRuns: number;
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
