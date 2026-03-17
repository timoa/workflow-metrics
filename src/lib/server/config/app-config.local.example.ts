import type { AppConfigOverride } from './app-config';

const localConfig: AppConfigOverride = {
	aiOptimization: {
		// Pick a different model for local development.
		defaultModel: 'mistral-medium-latest'
	}
};

export default localConfig;
