import { createMistral } from '@ai-sdk/mistral';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { WorkflowMetrics, OptimizationResult, OptimizationItem } from '$lib/types/metrics';

export function createMistralClient(apiKey: string) {
	return createMistral({ apiKey });
}

const OptimizationItemSchema = z.object({
	id: z.string(),
	title: z.string(),
	category: z.enum(['performance', 'cost', 'reliability', 'security', 'maintenance']),
	explanation: z.string(),
	codeExample: z.string().optional(),
	estimatedImpact: z.string().optional(),
	effort: z.enum(['Low', 'Medium', 'High'])
});

const OptimizationSchema = z.object({
	optimizations: z.array(OptimizationItemSchema),
	summary: z.object({
		expectedAvgDuration: z.string().optional(),
		expectedSuccessRate: z.string().optional(),
		expectedP95Duration: z.string().optional(),
		notes: z.string().optional()
	})
});

export function buildOptimizationPrompt(
	workflowName: string,
	workflowYaml: string,
	metrics: WorkflowMetrics
): string {
	const successRate = metrics.successRate.toFixed(1);
	const avgDuration = Math.round(metrics.avgDurationMs / 1000);
	const p95Duration = Math.round(metrics.p95DurationMs / 1000);

	return `You are an expert in GitHub Actions workflow optimization. Analyze the following workflow and provide specific, actionable optimization recommendations.

## Workflow: ${workflowName}

### Current Metrics (last 30 days)
- Total runs: ${metrics.totalRuns}
- Success rate: ${successRate}%
- Average duration: ${avgDuration}s
- P95 duration: ${p95Duration}s
- Failure count: ${metrics.failureCount}

### Workflow YAML
\`\`\`yaml
${workflowYaml}
\`\`\`

### Instructions

Return a JSON object with an "optimizations" array and a "summary" object.

Each optimization must have:
- id: a short kebab-case identifier (e.g. "add-npm-cache", "parallel-test-lint")
- title: a short human-readable title (3-5 words, e.g. "Better npm caching", "Parallel test jobs")
- category: one of "performance", "cost", "reliability", "security", "maintenance"
- explanation: 2-4 sentences explaining the problem and the fix
- codeExample: (optional) relevant YAML snippet showing the change
- estimatedImpact: (optional) concise expected impact (e.g. "20-40% faster builds", "50% fewer failures")
- effort: "Low", "Medium", or "High"

Cover these areas where applicable:
1. Caching (npm, pip, cargo, etc.)
2. Parallelization (jobs or steps that can run concurrently)
3. Runner optimization
4. Conditional steps (skip work when files haven't changed)
5. Action version pinning (security)
6. Failure reduction based on the ${metrics.failureCount} failures
7. Quick wins

The "summary" object should have:
- expectedAvgDuration: target average duration range after all changes (e.g. "40-60s")
- expectedSuccessRate: target success rate range (e.g. "85-95%")
- expectedP95Duration: target P95 range (e.g. "70-90s")
- notes: (optional) one sentence with any important caveats`;
}

export async function generateOptimizationReport(
	apiKey: string,
	workflowName: string,
	workflowYaml: string,
	metrics: WorkflowMetrics
): Promise<{ result: OptimizationResult; usage: { promptTokens: number; completionTokens: number } }> {
	const mistral = createMistralClient(apiKey);
	const prompt = buildOptimizationPrompt(workflowName, workflowYaml, metrics);

	const { output, usage } = await generateText({
		model: mistral('mistral-large-latest'),
		output: Output.object({ schema: OptimizationSchema }),
		prompt,
		maxOutputTokens: 4096
	});

	return {
		result: output as OptimizationResult,
		usage: {
			promptTokens: usage.inputTokens ?? 0,
			completionTokens: usage.outputTokens ?? 0
		}
	};
}

export async function generateOptimizedYaml(
	apiKey: string,
	workflowName: string,
	originalYaml: string,
	selectedOptimizations: OptimizationItem[]
): Promise<string> {
	const mistral = createMistralClient(apiKey);

	const optimizationDescriptions = selectedOptimizations
		.map((opt, i) => `${i + 1}. **${opt.title}** (${opt.category}): ${opt.explanation}${opt.codeExample ? `\n\nExample:\n\`\`\`yaml\n${opt.codeExample}\n\`\`\`` : ''}`)
		.join('\n\n');

	const prompt = `You are an expert in GitHub Actions workflow optimization. Apply the following optimizations to the workflow YAML.

## Workflow: ${workflowName}

### Original YAML
\`\`\`yaml
${originalYaml}
\`\`\`

### Optimizations to apply

${optimizationDescriptions}

### Instructions

Return ONLY the complete, updated YAML file with all optimizations applied. Do not include any explanation, markdown fences, or extra text — just the raw YAML content starting with the first line of the workflow file.`;

	const { text } = await generateText({
		model: mistral('mistral-large-latest'),
		prompt,
		maxOutputTokens: 4096
	});

	// Strip any accidental markdown fences if the model wraps the output
	return text
		.replace(/^```ya?ml\n?/i, '')
		.replace(/\n?```\s*$/i, '')
		.trim();
}
