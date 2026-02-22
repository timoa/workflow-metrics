import { createMistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';
import type { WorkflowMetrics } from '$lib/types/metrics';

export function createMistralClient(apiKey: string) {
	return createMistral({ apiKey });
}

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

### Please provide optimization recommendations in the following areas:

1. **Caching**: Identify opportunities to cache dependencies (npm, pip, cargo, etc.) to reduce install time.
2. **Parallelization**: Steps or jobs that can run in parallel instead of sequentially.
3. **Runner optimization**: Choose appropriate runner types; consider self-hosted runners if build times are long.
4. **Conditional steps**: Skip unnecessary steps based on changed files or branch conditions.
5. **Action versions**: Identify outdated actions that should be pinned to SHA for security.
6. **Failure reduction**: Based on the ${metrics.failureCount} failures, suggest ways to improve reliability.
7. **Quick wins**: Any small changes that would immediately improve performance or reliability.

Format your response as a clear, structured report with concrete code examples where relevant.`;
}

export async function streamWorkflowOptimization(
	apiKey: string,
	workflowName: string,
	workflowYaml: string,
	metrics: WorkflowMetrics
) {
	const mistral = createMistralClient(apiKey);
	const prompt = buildOptimizationPrompt(workflowName, workflowYaml, metrics);

	return streamText({
		model: mistral('mistral-large-latest'),
		messages: [{ role: 'user', content: prompt }],
		maxTokens: 4096
	});
}
