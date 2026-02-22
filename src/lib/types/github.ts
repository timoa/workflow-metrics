export interface GitHubWorkflow {
	id: number;
	name: string;
	path: string;
	state: string;
	html_url: string;
	badge_url: string;
	created_at: string;
	updated_at: string;
}

export interface GitHubWorkflowRun {
	id: number;
	name: string | null;
	workflow_id: number;
	status: 'queued' | 'in_progress' | 'completed' | 'action_required' | null;
	conclusion:
		| 'success'
		| 'failure'
		| 'neutral'
		| 'cancelled'
		| 'skipped'
		| 'timed_out'
		| 'action_required'
		| null;
	head_branch: string | null;
	head_sha: string;
	run_number: number;
	run_attempt: number | null;
	event: string;
	created_at: string;
	updated_at: string;
	run_started_at: string | null;
	html_url: string;
	actor: {
		login: string;
		avatar_url: string;
	} | null;
}

export interface GitHubJob {
	id: number;
	run_id: number;
	name: string;
	status: 'queued' | 'in_progress' | 'completed';
	conclusion: string | null;
	started_at: string | null;
	completed_at: string | null;
	steps: GitHubStep[];
	runner_name: string | null;
	labels: string[];
}

export interface GitHubStep {
	name: string;
	status: string;
	conclusion: string | null;
	number: number;
	started_at: string | null;
	completed_at: string | null;
}

export interface GitHubOrg {
	login: string;
	id: number;
	avatar_url: string;
	description: string | null;
}

export interface GitHubRepo {
	id: number;
	name: string;
	full_name: string;
	owner: {
		login: string;
		avatar_url: string;
	};
	private: boolean;
	description: string | null;
	html_url: string;
	default_branch: string;
}
