import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultAppConfig } from './app-config';

async function importFreshConfigModule(aiModelOverride?: string) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: {
			AI_OPTIMIZATION_MODEL: aiModelOverride
		}
	}));
	return import('./app-config');
}

describe('app config', () => {
	afterEach(() => {
		vi.doUnmock('$env/dynamic/private');
		vi.resetModules();
	});

	it('returns default AI optimization model when no override exists', async () => {
		const config = await importFreshConfigModule();

		expect(config.getAiOptimizationModel()).toBe(defaultAppConfig.aiOptimization.defaultModel);
	});

	it('uses AI model from environment override', async () => {
		const config = await importFreshConfigModule('mistral-medium-latest');

		expect(config.getAiOptimizationModel()).toBe('mistral-medium-latest');
	});

	it('returns human-readable label for configured model', async () => {
		const config = await importFreshConfigModule('mistral-small-latest');

		expect(config.getAiOptimizationModelLabel()).toBe('Mistral Small 4');
	});

	it('throws when environment override model is invalid', async () => {
		await expect(importFreshConfigModule('invalid-model')).rejects.toThrow('Invalid app config');
	});
});
