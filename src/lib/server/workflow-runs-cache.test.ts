import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
	getCachedWorkflowRuns,
	setCachedWorkflowRuns,
	getCachedWorkflowDetailRuns,
	setCachedWorkflowDetailRuns,
	deleteExpiredWorkflowRunsCache,
	deleteExpiredWorkflowDetailRunsCache
} from './workflow-runs-cache';
import type { GitHubWorkflowRun } from '$lib/types/github';

// Create a proper mock builder for Supabase chains
const createMockSupabaseClient = () => {
	const mockChains: Record<string, Record<string, unknown>> = {};

	const builder = {
		from: vi.fn((table: string) => {
			mockChains[table] = {
				select: vi.fn((fields) => {
					const chain = mockChains[table];
					chain.selectedFields = fields;
					return chain;
				}),
				eq: vi.fn((field, value) => {
					const chain = mockChains[table];
					const filters = (chain.filters as Record<string, unknown> | undefined) ?? {};
					filters[field] = value;
					chain.filters = filters;
					return chain;
				}),
				lt: vi.fn((field, value) => {
					const chain = mockChains[table];
					const filters = (chain.filters as Record<string, unknown> | undefined) ?? {};
					filters[field] = { op: 'lt', value };
					chain.filters = filters;
					return Promise.resolve({ error: null });
				}),
				delete: vi.fn(() => {
					return {
						lt: vi.fn((field, value) => {
							const chain = mockChains[table];
							chain.deleteFilter = { field, value };
							return Promise.resolve({ error: null });
						})
					};
				}),
				upsert: vi.fn((data, options) => {
					const chain = mockChains[table];
					chain.upsertData = data;
					chain.upsertOptions = options;
					return {
						select: vi.fn((fields) => {
							chain.selectFields = fields;
							return {
								limit: vi.fn((n) => {
									chain.limit = n;
									return Promise.resolve({
										data: [{ id: 1 }],
										error: null
									});
								})
							};
						})
					};
				}),
				maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
			};
			return mockChains[table];
		})
	};

	return { builder, mockChains };
};

describe('deleteExpiredWorkflowRunsCache', () => {
	it('deletes rows older than retention period', async () => {
		const { builder, mockChains } = createMockSupabaseClient();
		await deleteExpiredWorkflowRunsCache(builder as never);
		expect(builder.from).toHaveBeenCalledWith('workflow_runs_cache');
		expect(mockChains['workflow_runs_cache'].deleteFilter).toBeDefined();
		const deleteFilter = mockChains['workflow_runs_cache'].deleteFilter as
			| { field: string; value: unknown }
			| undefined;
		expect(deleteFilter?.field).toBe('fetched_at');
	});
});

describe('deleteExpiredWorkflowDetailRunsCache', () => {
	it('deletes rows older than retention period', async () => {
		const { builder, mockChains } = createMockSupabaseClient();
		await deleteExpiredWorkflowDetailRunsCache(builder as never);
		expect(builder.from).toHaveBeenCalledWith('workflow_detail_runs_cache');
		expect(mockChains['workflow_detail_runs_cache'].deleteFilter).toBeDefined();
	});
});

describe('getCachedWorkflowRuns', () => {
	const mockRuns: GitHubWorkflowRun[] = [
		{ id: 1, status: 'completed', conclusion: 'success' } as GitHubWorkflowRun
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns fresh cached data', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockReturnValue({
									maybeSingle: vi.fn().mockResolvedValue({
										data: { runs: mockRuns, fetched_at: new Date().toISOString() },
										error: null
									})
								})
							})
						})
					})
				})
			})
		};

		const result = await getCachedWorkflowRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			'2024-01-01'
		);

		expect(result).not.toBeNull();
		expect(result?.runs).toEqual(mockRuns);
		expect(result?.isStale).toBe(false);
	});

	it('returns stale data when cache is older than TTL', async () => {
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockReturnValue({
									maybeSingle: vi.fn().mockResolvedValue({
										data: { runs: mockRuns, fetched_at: twoHoursAgo },
										error: null
									})
								})
							})
						})
					})
				})
			})
		};

		const result = await getCachedWorkflowRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			'2024-01-01'
		);

		expect(result?.isStale).toBe(true);
	});

	it('returns null when cache is too old (past stale TTL)', async () => {
		const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockReturnValue({
									maybeSingle: vi.fn().mockResolvedValue({
										data: { runs: mockRuns, fetched_at: fiveHoursAgo },
										error: null
									})
								})
							})
						})
					})
				})
			})
		};

		const result = await getCachedWorkflowRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			'2024-01-01'
		);

		expect(result).toBeNull();
	});

	it('returns null when no cache entry found', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockReturnValue({
									maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
								})
							})
						})
					})
				})
			})
		};

		const result = await getCachedWorkflowRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			'2024-01-01'
		);

		expect(result).toBeNull();
	});

	it('returns null and logs warning on error', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockReturnValue({
									maybeSingle: vi.fn().mockResolvedValue({
										data: null,
										error: { message: 'Connection failed', code: '500' }
									})
								})
							})
						})
					})
				})
			})
		};
		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const result = await getCachedWorkflowRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			'2024-01-01'
		);

		expect(result).toBeNull();
		expect(consoleSpy).toHaveBeenCalled();

		consoleSpy.mockRestore();
	});

	it('queries with correct parameters', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockReturnValue({
									maybeSingle: vi.fn().mockResolvedValue({
										data: { runs: [], fetched_at: new Date().toISOString() },
										error: null
									})
								})
							})
						})
					})
				})
			})
		};

		await getCachedWorkflowRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			'2024-01-01'
		);

		expect(mockSupabase.from).toHaveBeenCalledWith('workflow_runs_cache');
	});
});

describe('setCachedWorkflowRuns', () => {
	const mockRuns: GitHubWorkflowRun[] = [
		{ id: 1, status: 'completed', conclusion: 'success' } as GitHubWorkflowRun
	];

	it('successfully stores workflow runs', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				upsert: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue({
							data: [{ id: 1 }],
							error: null
						})
					})
				})
			})
		};

		const result = await setCachedWorkflowRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			'2024-01-01',
			mockRuns
		);

		expect(result.ok).toBe(true);
		const upsertCall = mockSupabase.from('workflow_runs_cache').upsert.mock.calls[0];
		expect(upsertCall[0]).toMatchObject({
			user_id: 'user-123',
			owner: 'owner',
			name: 'repo',
			window_start: '2024-01-01',
			runs: mockRuns
		});
		expect(upsertCall[1]).toMatchObject({
			onConflict: 'user_id,owner,name,window_start',
			ignoreDuplicates: false
		});
	});

	it('returns error on failure', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				upsert: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue({
							data: null,
							error: { message: 'Insert failed' }
						})
					})
				})
			})
		};
		const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const result = await setCachedWorkflowRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			'2024-01-01',
			mockRuns
		);

		expect(result.ok).toBe(false);
		expect(result.error).toBe('Insert failed');

		consoleSpy.mockRestore();
	});

	it('includes fetched_at timestamp', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				upsert: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue({
							data: [{ id: 1 }],
							error: null
						})
					})
				})
			})
		};

		await setCachedWorkflowRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			'2024-01-01',
			mockRuns
		);

		const upsertData = mockSupabase.from('workflow_runs_cache').upsert.mock.calls[0][0];
		expect(upsertData.fetched_at).toBeDefined();
		expect(new Date(upsertData.fetched_at)).toBeInstanceOf(Date);
	});
});

describe('getCachedWorkflowDetailRuns', () => {
	const mockRuns: GitHubWorkflowRun[] = [
		{ id: 1, workflow_id: 123, status: 'completed', conclusion: 'success' } as GitHubWorkflowRun
	];

	it('returns fresh cached data for workflow detail', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockReturnValue({
									eq: vi.fn().mockReturnValue({
										maybeSingle: vi.fn().mockResolvedValue({
											data: { runs: mockRuns, fetched_at: new Date().toISOString() },
											error: null
										})
									})
								})
							})
						})
					})
				})
			})
		};

		const result = await getCachedWorkflowDetailRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			123,
			'2024-01-01'
		);

		expect(result).not.toBeNull();
		expect(result?.runs).toEqual(mockRuns);
		expect(result?.isStale).toBe(false);
	});

	it('queries workflow_detail_runs_cache table', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockReturnValue({
									eq: vi.fn().mockReturnValue({
										maybeSingle: vi.fn().mockResolvedValue({
											data: { runs: [], fetched_at: new Date().toISOString() },
											error: null
										})
									})
								})
							})
						})
					})
				})
			})
		};

		await getCachedWorkflowDetailRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			123,
			'2024-01-01'
		);

		expect(mockSupabase.from).toHaveBeenCalledWith('workflow_detail_runs_cache');
	});
});

describe('setCachedWorkflowDetailRuns', () => {
	const mockRuns: GitHubWorkflowRun[] = [
		{ id: 1, workflow_id: 123, status: 'completed', conclusion: 'success' } as GitHubWorkflowRun
	];

	it('successfully stores workflow detail runs', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				upsert: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue({
							data: [{ id: 1 }],
							error: null
						})
					})
				})
			})
		};

		const result = await setCachedWorkflowDetailRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			123,
			'2024-01-01',
			mockRuns
		);

		expect(result.ok).toBe(true);
		expect(mockSupabase.from).toHaveBeenCalledWith('workflow_detail_runs_cache');
	});

	it('includes workflow_id in upsert', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				upsert: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue({
							data: [{ id: 1 }],
							error: null
						})
					})
				})
			})
		};

		await setCachedWorkflowDetailRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			123,
			'2024-01-01',
			mockRuns
		);

		const upsertData = mockSupabase.from('workflow_detail_runs_cache').upsert.mock.calls[0][0];
		expect(upsertData.workflow_id).toBe(123);
	});

	it('uses correct onConflict clause', async () => {
		const mockSupabase = {
			from: vi.fn().mockReturnValue({
				upsert: vi.fn().mockReturnValue({
					select: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue({
							data: [{ id: 1 }],
							error: null
						})
					})
				})
			})
		};

		await setCachedWorkflowDetailRuns(
			mockSupabase as never,
			'user-123',
			'owner',
			'repo',
			123,
			'2024-01-01',
			mockRuns
		);

		const upsertOptions = mockSupabase.from('workflow_detail_runs_cache').upsert.mock.calls[0][1];
		expect(upsertOptions).toMatchObject({
			onConflict: 'user_id,owner,name,workflow_id,window_start',
			ignoreDuplicates: false
		});
	});
});
