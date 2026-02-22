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
