import { describe, expect, it, vi } from 'vitest';
import { getKvDashboardData, setKvDashboardData } from './kv-cache';
import type { DashboardData } from '$lib/types/metrics';

describe('getKvDashboardData', () => {
	const mockDashboardData: DashboardData = {
		owner: 'test-owner',
		repo: 'test-repo',
		totalRuns: 100,
		totalRunsIsCapped: false,
		successRate: 90,
		avgDurationMs: 120000,
		activeWorkflows: 5,
		runTrend: [],
		workflowMetrics: [],
		recentRuns: [],
		timeWindowDays: 30,
		totalMinutes30d: 500,
		billableMinutes30d: 500,
		billableIsEstimate: false,
		minutesByWorkflow: [],
		minutesTrend: [],
		wastedMinutes: 50,
		topBranchByMinutes: null,
		totalSkipped: 5,
		skipRate: 5
	};

	it('returns cached data when found', async () => {
		const mockKv = {
			get: vi.fn().mockResolvedValue(JSON.stringify(mockDashboardData)),
			put: vi.fn()
		};

		const result = await getKvDashboardData(
			mockKv,
			'user-123',
			'owner',
			'repo',
			30,
			'2024-01-01'
		);

		expect(result).toEqual(mockDashboardData);
		expect(mockKv.get).toHaveBeenCalledWith(
			'dashboard:user-123:owner/repo:30:2024-01-01',
			'text'
		);
	});

	it('returns null when no cached data', async () => {
		const mockKv = {
			get: vi.fn().mockResolvedValue(null),
			put: vi.fn()
		};

		const result = await getKvDashboardData(
			mockKv,
			'user-123',
			'owner',
			'repo',
			30,
			'2024-01-01'
		);

		expect(result).toBeNull();
	});

	it('returns null and logs warning on parse error', async () => {
		const mockKv = {
			get: vi.fn().mockResolvedValue('invalid json'),
			put: vi.fn()
		};
		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const result = await getKvDashboardData(
			mockKv,
			'user-123',
			'owner',
			'repo',
			30,
			'2024-01-01'
		);

		expect(result).toBeNull();
		expect(consoleSpy).toHaveBeenCalledWith(
			'[kv-cache] getKvDashboardData error:',
			expect.any(Error)
		);

		consoleSpy.mockRestore();
	});

	it('returns null and logs warning on KV error', async () => {
		const mockKv = {
			get: vi.fn().mockRejectedValue(new Error('KV connection failed')),
			put: vi.fn()
		};
		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const result = await getKvDashboardData(
			mockKv,
			'user-123',
			'owner',
			'repo',
			30,
			'2024-01-01'
		);

		expect(result).toBeNull();
		expect(consoleSpy).toHaveBeenCalled();

		consoleSpy.mockRestore();
	});

	it('constructs correct key format', async () => {
		const mockKv = {
			get: vi.fn().mockResolvedValue(null),
			put: vi.fn()
		};

		await getKvDashboardData(
			mockKv,
			'user-456',
			'myorg',
			'myrepo',
			7,
			'2024-06-15'
		);

		expect(mockKv.get).toHaveBeenCalledWith(
			'dashboard:user-456:myorg/myrepo:7:2024-06-15',
			'text'
		);
	});
});

describe('setKvDashboardData', () => {
	const mockDashboardData: DashboardData = {
		owner: 'test-owner',
		repo: 'test-repo',
		totalRuns: 100,
		totalRunsIsCapped: false,
		successRate: 90,
		avgDurationMs: 120000,
		activeWorkflows: 5,
		runTrend: [],
		workflowMetrics: [],
		recentRuns: [],
		timeWindowDays: 30,
		totalMinutes30d: 500,
		billableMinutes30d: 500,
		billableIsEstimate: false,
		minutesByWorkflow: [],
		minutesTrend: [],
		wastedMinutes: 50,
		topBranchByMinutes: null,
		totalSkipped: 5,
		skipRate: 5
	};

	it('stores data with correct TTL', async () => {
		const mockKv = {
			get: vi.fn(),
			put: vi.fn().mockResolvedValue(undefined)
		};

		await setKvDashboardData(
			mockKv,
			'user-123',
			'owner',
			'repo',
			30,
			'2024-01-01',
			mockDashboardData
		);

		expect(mockKv.put).toHaveBeenCalledWith(
			'dashboard:user-123:owner/repo:30:2024-01-01',
			JSON.stringify(mockDashboardData),
			{ expirationTtl: 3600 }
		);
	});

	it('logs warning on put error', async () => {
		const mockKv = {
			get: vi.fn(),
			put: vi.fn().mockRejectedValue(new Error('KV write failed'))
		};
		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		await setKvDashboardData(
			mockKv,
			'user-123',
			'owner',
			'repo',
			30,
			'2024-01-01',
			mockDashboardData
		);

		expect(consoleSpy).toHaveBeenCalledWith(
			'[kv-cache] setKvDashboardData error:',
			expect.any(Error)
		);

		consoleSpy.mockRestore();
	});

	it('handles complex dashboard data with all fields', async () => {
		const complexData: DashboardData = {
			...mockDashboardData,
			workflowFileCommits: [
				{
					date: '2024-01-10',
					committedAt: '2024-01-10T10:00:00Z',
					sha: 'abc123',
					message: 'Update workflow',
					paths: ['.github/workflows/ci.yml']
				}
			],
			dora: {
				deploymentFrequency: { perWeek: 5, perDay: 0.7 },
				leadTimeForChangesMs: 3600000,
				leadTimeFromCommit: true,
				changeFailureRate: 10,
				meanTimeToRecoveryMs: 1800000
			}
		};

		const mockKv = {
			get: vi.fn(),
			put: vi.fn().mockResolvedValue(undefined)
		};

		await setKvDashboardData(
			mockKv,
			'user-123',
			'owner',
			'repo',
			30,
			'2024-01-01',
			complexData
		);

		expect(mockKv.put).toHaveBeenCalledWith(
			'dashboard:user-123:owner/repo:30:2024-01-01',
			JSON.stringify(complexData),
			expect.any(Object)
		);
	});

	it('uses 1 hour TTL (3600 seconds)', async () => {
		const mockKv = {
			get: vi.fn(),
			put: vi.fn().mockResolvedValue(undefined)
		};

		await setKvDashboardData(
			mockKv,
			'user-123',
			'owner',
			'repo',
			30,
			'2024-01-01',
			mockDashboardData
		);

		expect(mockKv.put).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(String),
			expect.objectContaining({ expirationTtl: 3600 })
		);
	});
});
