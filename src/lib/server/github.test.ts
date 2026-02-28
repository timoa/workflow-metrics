import { describe, expect, it, vi } from 'vitest';
import {
	createOctokit,
	isGitHubUnauthorizedError,
	fetchWorkflows,
	fetchWorkflowRuns,
	fetchAllWorkflowRunsForRepo,
	fetchSingleWorkflowRuns,
	fetchAllSingleWorkflowRuns,
	fetchJobsForRun,
	fetchWorkflowFileCommits,
	buildDashboardData,
	buildWorkflowDetailData
} from './github';
import type { GitHubWorkflow, GitHubWorkflowRun, GitHubJob } from '$lib/types/github';

// Mock Octokit
vi.mock('@octokit/rest', () => ({
	Octokit: vi.fn().mockImplementation(() => ({
		rest: {
			actions: {
				listRepoWorkflows: vi.fn(),
				listWorkflowRunsForRepo: vi.fn(),
				listWorkflowRuns: vi.fn(),
				listJobsForWorkflowRun: vi.fn()
			},
			repos: {
				listCommits: vi.fn(),
				getContent: vi.fn()
			}
		}
	}))
}));

describe('createOctokit', () => {
	it('creates Octokit instance with access token', () => {
		const octokit = createOctokit('test-token');
		expect(octokit).toBeDefined();
	});
});

describe('isGitHubUnauthorizedError', () => {
	it('returns true for 401 status', () => {
		const error = { status: 401 };
		expect(isGitHubUnauthorizedError(error)).toBe(true);
	});

	it('returns true for Bad credentials message', () => {
		const error = { response: { data: { message: 'Bad credentials' } } };
		expect(isGitHubUnauthorizedError(error)).toBe(true);
	});

	it('returns true for message containing Bad credentials', () => {
		const error = { message: 'Bad credentials error' };
		expect(isGitHubUnauthorizedError(error)).toBe(true);
	});

	it('returns false for null', () => {
		expect(isGitHubUnauthorizedError(null)).toBe(false);
	});

	it('returns false for non-object', () => {
		expect(isGitHubUnauthorizedError('error')).toBe(false);
	});

	it('returns false for other errors', () => {
		expect(isGitHubUnauthorizedError({ status: 500 })).toBe(false);
		expect(isGitHubUnauthorizedError({ message: 'Not found' })).toBe(false);
	});

	it('handles nested response status', () => {
		const error = { response: { status: 401 } };
		expect(isGitHubUnauthorizedError(error)).toBe(true);
	});
});

describe('fetchWorkflows', () => {
	it('fetches workflows from GitHub API', async () => {
		const mockWorkflows: GitHubWorkflow[] = [
			{ id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' } as GitHubWorkflow
		];
		const octokit = createOctokit('test-token');
		vi.mocked(octokit.rest.actions.listRepoWorkflows).mockResolvedValue({
			data: { workflows: mockWorkflows }
		} as never);

		const result = await fetchWorkflows(octokit, 'owner', 'repo');
		expect(result).toEqual(mockWorkflows);
	});
});

describe('fetchWorkflowRuns', () => {
	it('fetches workflow runs with default options', async () => {
		const mockRuns: GitHubWorkflowRun[] = [
			{ id: 1, status: 'completed', conclusion: 'success' } as GitHubWorkflowRun
		];
		const octokit = createOctokit('test-token');
		vi.mocked(octokit.rest.actions.listWorkflowRunsForRepo).mockResolvedValue({
			data: { workflow_runs: mockRuns }
		} as never);

		const result = await fetchWorkflowRuns(octokit, 'owner', 'repo');
		expect(result).toEqual(mockRuns);
	});

	it('fetches with custom per_page and page', async () => {
		const octokit = createOctokit('test-token');
		vi.mocked(octokit.rest.actions.listWorkflowRunsForRepo).mockResolvedValue({
			data: { workflow_runs: [] }
		} as never);

		await fetchWorkflowRuns(octokit, 'owner', 'repo', { per_page: 50, page: 2 });
		expect(octokit.rest.actions.listWorkflowRunsForRepo).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			per_page: 50,
			page: 2
		});
	});

	it('includes created filter when provided', async () => {
		const octokit = createOctokit('test-token');
		vi.mocked(octokit.rest.actions.listWorkflowRunsForRepo).mockResolvedValue({
			data: { workflow_runs: [] }
		} as never);

		await fetchWorkflowRuns(octokit, 'owner', 'repo', { created: '>=2024-01-01' });
		expect(octokit.rest.actions.listWorkflowRunsForRepo).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			per_page: 100,
			page: 1,
			created: '>=2024-01-01'
		});
	});
});

describe('fetchAllWorkflowRunsForRepo', () => {
	it('paginates through all runs', async () => {
		const octokit = createOctokit('test-token');
		const mockRuns1 = Array(100).fill({ id: 1, status: 'completed' } as GitHubWorkflowRun);
		const mockRuns2 = [{ id: 101, status: 'completed' } as GitHubWorkflowRun];

		vi.mocked(octokit.rest.actions.listWorkflowRunsForRepo)
			.mockResolvedValueOnce({ data: { workflow_runs: mockRuns1, total_count: 101 } } as never)
			.mockResolvedValueOnce({ data: { workflow_runs: mockRuns2 } } as never);

		const result = await fetchAllWorkflowRunsForRepo(octokit, 'owner', 'repo', '>=2024-01-01');
		expect(result).toHaveLength(101);
	});

	it('stops when less than 100 runs returned', async () => {
		const octokit = createOctokit('test-token');
		const mockRuns = [{ id: 1, status: 'completed' } as GitHubWorkflowRun];

		vi.mocked(octokit.rest.actions.listWorkflowRunsForRepo).mockResolvedValue({
			data: { workflow_runs: mockRuns, total_count: 1 }
		} as never);

		const result = await fetchAllWorkflowRunsForRepo(octokit, 'owner', 'repo', '>=2024-01-01');
		expect(result).toHaveLength(1);
		expect(octokit.rest.actions.listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
	});

	it('calls onProgress callback', async () => {
		const octokit = createOctokit('test-token');
		const mockRuns = [{ id: 1, status: 'completed' } as GitHubWorkflowRun];
		const onProgress = vi.fn();

		vi.mocked(octokit.rest.actions.listWorkflowRunsForRepo).mockResolvedValue({
			data: { workflow_runs: mockRuns, total_count: 1 }
		} as never);

		await fetchAllWorkflowRunsForRepo(octokit, 'owner', 'repo', '>=2024-01-01', undefined, onProgress);
		expect(onProgress).toHaveBeenCalledWith(1, 1, 1);
	});
});

describe('fetchSingleWorkflowRuns', () => {
	it('fetches runs for specific workflow', async () => {
		const mockRuns: GitHubWorkflowRun[] = [
			{ id: 1, workflow_id: 123, status: 'completed' } as GitHubWorkflowRun
		];
		const octokit = createOctokit('test-token');
		vi.mocked(octokit.rest.actions.listWorkflowRuns).mockResolvedValue({
			data: { workflow_runs: mockRuns }
		} as never);

		const result = await fetchSingleWorkflowRuns(octokit, 'owner', 'repo', 123);
		expect(result).toEqual(mockRuns);
		expect(octokit.rest.actions.listWorkflowRuns).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			workflow_id: 123,
			per_page: 100,
			page: 1
		});
	});
});

describe('fetchAllSingleWorkflowRuns', () => {
	it('paginates through all runs for single workflow', async () => {
		const octokit = createOctokit('test-token');
		const mockRuns = [{ id: 1, workflow_id: 123, status: 'completed' } as GitHubWorkflowRun];

		vi.mocked(octokit.rest.actions.listWorkflowRuns).mockResolvedValue({
			data: { workflow_runs: mockRuns }
		} as never);

		const result = await fetchAllSingleWorkflowRuns(octokit, 'owner', 'repo', 123, '>=2024-01-01');
		expect(result).toEqual(mockRuns);
	});
});

describe('fetchJobsForRun', () => {
	it('fetches jobs for a workflow run', async () => {
		const mockJobs: GitHubJob[] = [
			{ id: 1, name: 'build', status: 'completed' } as GitHubJob
		];
		const octokit = createOctokit('test-token');
		vi.mocked(octokit.rest.actions.listJobsForWorkflowRun).mockResolvedValue({
			data: { jobs: mockJobs }
		} as never);

		const result = await fetchJobsForRun(octokit, 'owner', 'repo', 123);
		expect(result).toEqual(mockJobs);
		expect(octokit.rest.actions.listJobsForWorkflowRun).toHaveBeenCalledWith({
			owner: 'owner',
			repo: 'repo',
			run_id: 123,
			per_page: 100
		});
	});
});

describe('fetchWorkflowFileCommits', () => {
	it('fetches commits for workflow files', async () => {
		const mockCommits = [
			{
				sha: 'abc123',
				commit: {
					message: 'Update CI workflow',
					committer: { date: '2024-01-15T10:30:00Z' }
				}
			}
		];
		const octokit = createOctokit('test-token');
		vi.mocked(octokit.rest.repos.listCommits).mockResolvedValue({
			data: mockCommits
		} as never);

		const since = new Date('2024-01-01');
		const result = await fetchWorkflowFileCommits(octokit, 'owner', 'repo', since);
		expect(result).toHaveLength(1);
		expect(result[0].sha).toBe('abc123');
		expect(result[0].message).toBe('Update CI workflow');
	});

	it('truncates long commit messages', async () => {
		const mockCommits = [
			{
				sha: 'abc123',
				commit: {
					message: 'A'.repeat(100) + '\nSecond line',
					committer: { date: '2024-01-15T10:30:00Z' }
				}
			}
		];
		const octokit = createOctokit('test-token');
		vi.mocked(octokit.rest.repos.listCommits).mockResolvedValue({
			data: mockCommits
		} as never);

		const since = new Date('2024-01-01');
		const result = await fetchWorkflowFileCommits(octokit, 'owner', 'repo', since);
		expect(result[0].message.length).toBeLessThanOrEqual(80);
	});
});

describe('buildDashboardData', () => {
	it('builds dashboard data from GitHub data', async () => {
		const octokit = createOctokit('test-token');
		const mockWorkflows: GitHubWorkflow[] = [
			{ id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' } as GitHubWorkflow
		];
		const mockRuns: GitHubWorkflowRun[] = [
			{
				id: 1,
				workflow_id: 1,
				status: 'completed',
				conclusion: 'success',
				updated_at: new Date().toISOString(),
				run_started_at: new Date(Date.now() - 60000).toISOString()
			} as GitHubWorkflowRun
		];

		vi.mocked(octokit.rest.actions.listRepoWorkflows).mockResolvedValue({
			data: { workflows: mockWorkflows }
		} as never);
		vi.mocked(octokit.rest.actions.listWorkflowRunsForRepo).mockResolvedValue({
			data: { workflow_runs: mockRuns, total_count: 1 }
		} as never);
		vi.mocked(octokit.rest.repos.listCommits).mockResolvedValue({ data: [] } as never);
		vi.mocked(octokit.rest.repos.getContent).mockResolvedValue({
			data: { type: 'file', content: 'bmFtZTogQ0k=' }
		} as never);

		const result = await buildDashboardData(octokit, 'owner', 'repo', { days: 7 });
		expect(result.owner).toBe('owner');
		expect(result.repo).toBe('repo');
		expect(result.totalRuns).toBe(1);
		expect(result.workflowMetrics).toHaveLength(1);
	});

	it('uses cached runs when provided', async () => {
		const octokit = createOctokit('test-token');
		const mockWorkflows: GitHubWorkflow[] = [
			{ id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' } as GitHubWorkflow
		];
		const cachedRuns: GitHubWorkflowRun[] = [
			{
				id: 1,
				workflow_id: 1,
				status: 'completed',
				conclusion: 'success',
				updated_at: new Date().toISOString(),
				run_started_at: new Date(Date.now() - 60000).toISOString()
			} as GitHubWorkflowRun
		];

		vi.mocked(octokit.rest.actions.listRepoWorkflows).mockResolvedValue({
			data: { workflows: mockWorkflows }
		} as never);
		vi.mocked(octokit.rest.repos.listCommits).mockResolvedValue({ data: [] } as never);
		vi.mocked(octokit.rest.repos.getContent).mockResolvedValue({
			data: { type: 'file', content: 'bmFtZTogQ0k=' }
		} as never);

		const result = await buildDashboardData(octokit, 'owner', 'repo', {
			cachedRuns,
			days: 7
		});
		expect(result.totalRuns).toBe(1);
	});

	it('calls onRunsFetched callback', async () => {
		const octokit = createOctokit('test-token');
		const onRunsFetched = vi.fn();
		const mockRuns: GitHubWorkflowRun[] = [
			{
				id: 1,
				workflow_id: 1,
				status: 'completed',
				conclusion: 'success',
				updated_at: new Date().toISOString(),
				run_started_at: new Date(Date.now() - 60000).toISOString()
			} as GitHubWorkflowRun
		];

		vi.mocked(octokit.rest.actions.listRepoWorkflows).mockResolvedValue({
			data: { workflows: [] }
		} as never);
		vi.mocked(octokit.rest.actions.listWorkflowRunsForRepo).mockResolvedValue({
			data: { workflow_runs: mockRuns, total_count: 1 }
		} as never);
		vi.mocked(octokit.rest.repos.listCommits).mockResolvedValue({ data: [] } as never);

		await buildDashboardData(octokit, 'owner', 'repo', { onRunsFetched, days: 7 });
		expect(onRunsFetched).toHaveBeenCalledWith(mockRuns);
	});
});

describe('buildWorkflowDetailData', () => {
	it('builds workflow detail data', async () => {
		const octokit = createOctokit('test-token');
		const mockWorkflows: GitHubWorkflow[] = [
			{ id: 123, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' } as GitHubWorkflow
		];
		const mockRuns: GitHubWorkflowRun[] = [
			{
				id: 1,
				workflow_id: 123,
				status: 'completed',
				conclusion: 'success',
				updated_at: new Date().toISOString(),
				run_started_at: new Date(Date.now() - 60000).toISOString()
			} as GitHubWorkflowRun
		];
		const mockJobs: GitHubJob[] = [
			{
				id: 1,
				run_id: 1,
				name: 'build',
				status: 'completed',
				conclusion: 'success',
				started_at: new Date().toISOString(),
				completed_at: new Date(Date.now() + 30000).toISOString(),
				runner_name: 'GitHub Actions',
				labels: ['ubuntu-latest'],
				steps: []
			} as GitHubJob
		];

		vi.mocked(octokit.rest.actions.listRepoWorkflows).mockResolvedValue({
			data: { workflows: mockWorkflows }
		} as never);
		vi.mocked(octokit.rest.actions.listWorkflowRuns).mockResolvedValue({
			data: { workflow_runs: mockRuns }
		} as never);
		vi.mocked(octokit.rest.actions.listJobsForWorkflowRun).mockResolvedValue({
			data: { jobs: mockJobs }
		} as never);
		vi.mocked(octokit.rest.repos.getContent).mockResolvedValue({
			data: { type: 'file', content: 'bmFtZTogQ0k=' }
		} as never);

		const result = await buildWorkflowDetailData(octokit, 'owner', 'repo', 123);
		expect(result.workflowId).toBe(123);
		expect(result.workflowName).toBe('CI');
	});

	it('throws error when workflow not found', async () => {
		const octokit = createOctokit('test-token');
		vi.mocked(octokit.rest.actions.listRepoWorkflows).mockResolvedValue({
			data: { workflows: [] }
		} as never);
		vi.mocked(octokit.rest.actions.listWorkflowRuns).mockResolvedValue({
			data: { workflow_runs: [] }
		} as never);

		await expect(buildWorkflowDetailData(octokit, 'owner', 'repo', 999)).rejects.toThrow('Workflow 999 not found');
	});
});
