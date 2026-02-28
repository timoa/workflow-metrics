import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the AI SDK before any imports
vi.mock('@ai-sdk/mistral', () => ({
	createMistral: vi.fn().mockReturnValue(vi.fn().mockReturnValue({ __model: true }))
}));

vi.mock('ai', () => ({
	Output: {
		object: vi.fn().mockReturnValue({ __output: true })
	},
	generateText: vi.fn()
}));

// Import after mocks
import { createMistralClient, buildOptimizationPrompt, generateOptimizationReport, generateOptimizedYaml } from './mistral';
import { generateText } from 'ai';
import type { WorkflowMetrics } from '$lib/types/metrics';

describe('createMistralClient', () => {
	it('creates a Mistral client with API key', () => {
		const client = createMistralClient('test-api-key');
		expect(client).toBeDefined();
	});
});

describe('buildOptimizationPrompt', () => {
	const mockMetrics: WorkflowMetrics = {
		workflowId: 1,
		workflowName: 'CI',
		workflowPath: '.github/workflows/ci.yml',
		totalRuns: 100,
		successCount: 90,
		failureCount: 10,
		cancelledCount: 0,
		skippedCount: 0,
		successRate: 90.0,
		failureRate: 10.0,
		skipRate: 0,
		avgDurationMs: 120000,
		p50DurationMs: 100000,
		p95DurationMs: 300000,
		lastRunAt: '2024-01-15T10:00:00Z',
		lastConclusion: 'success'
	};

	const mockWorkflowYaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm test
`;

	it('includes workflow name in prompt', () => {
		const prompt = buildOptimizationPrompt('CI', mockWorkflowYaml, mockMetrics);
		expect(prompt).toContain('## Workflow: CI');
	});

	it('includes metrics in prompt', () => {
		const prompt = buildOptimizationPrompt('CI', mockWorkflowYaml, mockMetrics);
		expect(prompt).toContain('Total runs: 100');
		expect(prompt).toContain('Success rate: 90.0%');
		expect(prompt).toContain('Average duration: 120s');
		expect(prompt).toContain('P95 duration: 300s');
		expect(prompt).toContain('Failure count: 10');
	});

	it('includes workflow YAML in prompt', () => {
		const prompt = buildOptimizationPrompt('CI', mockWorkflowYaml, mockMetrics);
		expect(prompt).toContain('### Workflow YAML');
		expect(prompt).toContain('name: CI');
		expect(prompt).toContain('actions/checkout@v4');
	});

	it('includes instructions for optimization', () => {
		const prompt = buildOptimizationPrompt('CI', mockWorkflowYaml, mockMetrics);
		expect(prompt).toContain('### Instructions');
		expect(prompt).toContain('Return a JSON object');
		expect(prompt).toContain('optimizations');
	});

	it('includes category options', () => {
		const prompt = buildOptimizationPrompt('CI', mockWorkflowYaml, mockMetrics);
		expect(prompt).toContain('performance');
		expect(prompt).toContain('cost');
		expect(prompt).toContain('reliability');
		expect(prompt).toContain('security');
		expect(prompt).toContain('maintenance');
	});

	it('includes effort levels', () => {
		const prompt = buildOptimizationPrompt('CI', mockWorkflowYaml, mockMetrics);
		expect(prompt).toContain('"Low"');
		expect(prompt).toContain('"Medium"');
		expect(prompt).toContain('"High"');
	});

	it('requests specific optimization areas', () => {
		const prompt = buildOptimizationPrompt('CI', mockWorkflowYaml, mockMetrics);
		expect(prompt).toContain('Caching');
		expect(prompt).toContain('Parallelization');
		expect(prompt).toContain('Runner optimization');
		expect(prompt).toContain('Conditional steps');
		expect(prompt).toContain('Action version pinning');
		expect(prompt).toContain('Quick wins');
	});

	it('rounds durations correctly', () => {
		const metricsWithFractionalSeconds: WorkflowMetrics = {
			...mockMetrics,
			avgDurationMs: 125500,
			p95DurationMs: 299500
		};
		const prompt = buildOptimizationPrompt('CI', mockWorkflowYaml, metricsWithFractionalSeconds);
		expect(prompt).toContain('Average duration: 126s');
		expect(prompt).toContain('P95 duration: 300s');
	});
});

describe('generateOptimizationReport', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const mockMetrics: WorkflowMetrics = {
		workflowId: 1,
		workflowName: 'CI',
		workflowPath: '.github/workflows/ci.yml',
		totalRuns: 100,
		successCount: 90,
		failureCount: 10,
		cancelledCount: 0,
		skippedCount: 0,
		successRate: 90.0,
		failureRate: 10.0,
		skipRate: 0,
		avgDurationMs: 120000,
		p50DurationMs: 100000,
		p95DurationMs: 300000,
		lastRunAt: '2024-01-15T10:00:00Z',
		lastConclusion: 'success'
	};

	const mockWorkflowYaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
`;

	it('generates optimization report successfully', async () => {
		const mockResult = {
			optimizations: [
				{
					id: 'add-cache',
					title: 'Add npm caching',
					category: 'performance',
					explanation: 'Cache npm dependencies to speed up installs',
					effort: 'Low'
				}
			],
			summary: {
				expectedAvgDuration: '60-80s',
				expectedSuccessRate: '92-95%'
			}
		};

		vi.mocked(generateText).mockResolvedValue({
			output: mockResult,
			usage: { inputTokens: 1000, outputTokens: 500 }
		} as never);

		const result = await generateOptimizationReport(
			'test-api-key',
			'CI',
			mockWorkflowYaml,
			mockMetrics
		);

		expect(result.result).toEqual(mockResult);
		expect(result.usage.promptTokens).toBe(1000);
		expect(result.usage.completionTokens).toBe(500);
	});

	it('calls generateText with structured output parameters', async () => {
		vi.mocked(generateText).mockResolvedValue({
			output: { optimizations: [], summary: {} },
			usage: { inputTokens: 100, outputTokens: 50 }
		} as never);

		await generateOptimizationReport('test-api-key', 'CI', mockWorkflowYaml, mockMetrics);

		expect(generateText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: expect.anything(),
				output: expect.anything(),
				prompt: expect.stringContaining('Workflow: CI'),
				maxOutputTokens: 4096
			})
		);
	});
});

describe('generateOptimizedYaml', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const mockWorkflowYaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo build
`;

	const mockOptimizations = [
		{
			id: 'add-cache',
			title: 'Add npm caching',
			category: 'performance' as const,
			explanation: 'Cache npm dependencies',
			codeExample: 'uses: actions/setup-node@v4\nwith:\n  cache: npm',
			effort: 'Low' as const
		},
		{
			id: 'parallel-jobs',
			title: 'Parallelize test jobs',
			category: 'performance' as const,
			explanation: 'Run tests in parallel',
			effort: 'Medium' as const
		}
	];

	it('generates optimized YAML successfully', async () => {
		const mockYaml = `name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/cache@v4`;

		vi.mocked(generateText).mockResolvedValue({
			text: mockYaml
		} as never);

		const result = await generateOptimizedYaml(
			'test-api-key',
			'CI',
			mockWorkflowYaml,
			mockOptimizations
		);

		expect(result).toBe(mockYaml);
	});

	it('strips markdown code fences from output', async () => {
		vi.mocked(generateText).mockResolvedValue({
			text: '```yaml\nname: CI\n```'
		} as never);

		const result = await generateOptimizedYaml(
			'test-api-key',
			'CI',
			mockWorkflowYaml,
			mockOptimizations
		);

		expect(result).toBe('name: CI');
	});

	it('handles output without fences', async () => {
		vi.mocked(generateText).mockResolvedValue({
			text: 'name: CI\non: push'
		} as never);

		const result = await generateOptimizedYaml(
			'test-api-key',
			'CI',
			mockWorkflowYaml,
			mockOptimizations
		);

		expect(result).toBe('name: CI\non: push');
	});

	it('includes optimization descriptions in prompt', async () => {
		vi.mocked(generateText).mockResolvedValue({ text: 'yaml' } as never);

		await generateOptimizedYaml(
			'test-api-key',
			'CI',
			mockWorkflowYaml,
			mockOptimizations
		);

		const promptArg = vi.mocked(generateText).mock.calls[0][0].prompt;
		expect(promptArg).toContain('Add npm caching');
		expect(promptArg).toContain('Cache npm dependencies');
		expect(promptArg).toContain('Parallelize test jobs');
		expect(promptArg).toContain('uses: actions/setup-node@v4');
	});

	it('calls generateText with correct parameters', async () => {
		vi.mocked(generateText).mockResolvedValue({ text: 'yaml' } as never);

		await generateOptimizedYaml('test-api-key', 'CI', mockWorkflowYaml, mockOptimizations);

		expect(generateText).toHaveBeenCalledWith(
			expect.objectContaining({
				model: expect.anything(),
				prompt: expect.stringContaining('Original YAML'),
				maxOutputTokens: 4096
			})
		);
	});
});
