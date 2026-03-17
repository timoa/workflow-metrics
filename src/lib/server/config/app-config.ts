import { env } from '$env/dynamic/private';
import { z } from 'zod';

export type AIProviderId = 'mistral';

export interface AppConfig {
	app: {
		name: string;
		version: number;
	};
	features: {
		aiOptimization: boolean;
	};
	aiOptimization: {
		provider: AIProviderId;
		defaultModel: string;
		modelLabels: Record<string, string>;
		providers: {
			mistral: {
				models: string[];
			};
		};
	};
}

export type AppConfigOverride = DeepPartial<AppConfig>;

type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends Array<infer U>
		? Array<U>
		: T[K] extends object
			? DeepPartial<T[K]>
			: T[K];
};

export const defaultAppConfig: AppConfig = {
	app: {
		name: 'workflow-metrics',
		version: 1
	},
	features: {
		aiOptimization: true
	},
	aiOptimization: {
		provider: 'mistral',
		defaultModel: 'mistral-small-latest',
		modelLabels: {
			'mistral-small-latest': 'Mistral Small 4',
			'mistral-medium-latest': 'Mistral Medium 3',
			'mistral-large-latest': 'Mistral Large 2'
		},
		providers: {
			mistral: {
				models: ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest']
			}
		}
	}
};

const AppConfigSchema = z
	.object({
		app: z.object({
			name: z.string().min(1),
			version: z.number().int().positive()
		}),
		features: z.object({
			aiOptimization: z.boolean()
		}),
		aiOptimization: z.object({
			provider: z.enum(['mistral']),
			defaultModel: z.string().min(1),
			modelLabels: z.record(z.string().min(1), z.string().min(1)),
			providers: z.object({
				mistral: z.object({
					models: z.array(z.string().min(1)).min(1)
				})
			})
		})
	})
	.superRefine((config, ctx) => {
		const providerCatalog = config.aiOptimization.providers[config.aiOptimization.provider];
		if (!providerCatalog.models.includes(config.aiOptimization.defaultModel)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['aiOptimization', 'defaultModel'],
				message: `Model "${config.aiOptimization.defaultModel}" is not in provider "${config.aiOptimization.provider}" catalog`
			});
		}
	});

const AppConfigOverrideSchema = z.object({
	app: z
		.object({
			name: z.string().min(1).optional(),
			version: z.number().int().positive().optional()
		})
		.partial()
		.optional(),
	features: z
		.object({
			aiOptimization: z.boolean().optional()
		})
		.partial()
		.optional(),
	aiOptimization: z
		.object({
			provider: z.enum(['mistral']).optional(),
			defaultModel: z.string().min(1).optional(),
			modelLabels: z.record(z.string().min(1), z.string().min(1)).optional(),
			providers: z
				.object({
					mistral: z
						.object({
							models: z.array(z.string().min(1)).min(1).optional()
						})
						.partial()
						.optional()
				})
				.partial()
				.optional()
		})
		.partial()
		.optional()
});

const localOverrideModules = import.meta.glob<{ default: AppConfigOverride }>('./app-config.local.ts', {
	eager: true
});
const localOverrideModule = localOverrideModules['./app-config.local.ts'];
const rawLocalOverride = localOverrideModule ? localOverrideModule.default : {};
const localOverrideResult = AppConfigOverrideSchema.safeParse(rawLocalOverride);
if (!localOverrideResult.success) {
	const issues = localOverrideResult.error.issues
		.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
		.join('; ');
	throw new Error(`Invalid app config override in ./app-config.local.ts: ${issues}`);
}
const localOverride: AppConfigOverride = localOverrideResult.data;

function buildEnvOverrideConfig(): AppConfigOverride {
	const override: AppConfigOverride = {};

	if (env.AI_OPTIMIZATION_MODEL) {
		override.aiOptimization = {
			defaultModel: env.AI_OPTIMIZATION_MODEL
		};
	}

	return override;
}

function normalizeModelLabels(
	base: Record<string, string>,
	override?: Record<string, string | undefined>
): Record<string, string> {
	const normalized: Record<string, string> = { ...base };
	if (!override) return normalized;
	for (const [key, value] of Object.entries(override)) {
		if (typeof value === 'string' && value.length > 0) {
			normalized[key] = value;
		}
	}
	return normalized;
}

function resolveConfig(
	defaults: AppConfig,
	override: AppConfigOverride,
	envOverride: AppConfigOverride
): AppConfig {
	const merged: AppConfig = {
		...defaults,
		...override,
		app: {
			...defaults.app,
			...override.app
		},
		features: {
			...defaults.features,
			...override.features
		},
		aiOptimization: {
			...defaults.aiOptimization,
			...override.aiOptimization,
			modelLabels: normalizeModelLabels(
				defaults.aiOptimization.modelLabels,
				override.aiOptimization?.modelLabels
			),
			providers: {
				...defaults.aiOptimization.providers,
				...override.aiOptimization?.providers,
				mistral: {
					...defaults.aiOptimization.providers.mistral,
					...override.aiOptimization?.providers?.mistral,
					models: [
						...(override.aiOptimization?.providers?.mistral?.models ??
							defaults.aiOptimization.providers.mistral.models)
					]
				}
			}
		}
	};

	if (envOverride.aiOptimization?.defaultModel) {
		merged.aiOptimization.defaultModel = envOverride.aiOptimization.defaultModel;
	}

	return merged;
}

const mergedConfig = resolveConfig(defaultAppConfig, localOverride, buildEnvOverrideConfig());

const parsedConfig = AppConfigSchema.safeParse(mergedConfig);
if (!parsedConfig.success) {
	const issues = parsedConfig.error.issues.map((issue) => issue.message).join('; ');
	throw new Error(`Invalid app config: ${issues}`);
}

export const resolvedAppConfig: AppConfig = parsedConfig.data;

export function getAiOptimizationProvider(): AIProviderId {
	return resolvedAppConfig.aiOptimization.provider;
}

export function getAiOptimizationModel(): string {
	if (!resolvedAppConfig.features.aiOptimization) {
		throw new Error('AI optimization is disabled in app config');
	}
	return resolvedAppConfig.aiOptimization.defaultModel;
}

export function getAiOptimizationModelLabel(): string {
	const model = getAiOptimizationModel();
	return resolvedAppConfig.aiOptimization.modelLabels[model] ?? model;
}
