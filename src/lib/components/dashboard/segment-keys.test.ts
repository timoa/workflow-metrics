import { describe, expect, it } from 'vitest';
import { buildMinutesSegmentKey } from './segment-keys';

describe('buildMinutesSegmentKey', () => {
	it('returns unique keys for duplicate workflow display names', () => {
		const first = buildMinutesSegmentKey(
			{
				workflowName: 'CI',
				workflowPath: '.github/workflows/ci-a.yml',
				minutes: 10,
				billableMinutes: 10,
				percentage: 50,
				runnerType: 'ubuntu',
				runnerDetected: true
			},
			0
		);

		const second = buildMinutesSegmentKey(
			{
				workflowName: 'CI',
				workflowPath: '.github/workflows/ci-b.yml',
				minutes: 10,
				billableMinutes: 10,
				percentage: 50,
				runnerType: 'ubuntu',
				runnerDetected: true
			},
			1
		);

		expect(first).not.toBe(second);
	});

	it('returns unique keys for repeated unknown workflow fallbacks', () => {
		const first = buildMinutesSegmentKey(
			{
				workflowName: '',
				minutes: 10,
				billableMinutes: 10,
				percentage: 50,
				runnerType: 'unknown',
				runnerDetected: false
			},
			0
		);

		const second = buildMinutesSegmentKey(
			{
				workflowName: '',
				minutes: 10,
				billableMinutes: 10,
				percentage: 50,
				runnerType: 'unknown',
				runnerDetected: false
			},
			1
		);

		expect(first).not.toBe(second);
	});
});
