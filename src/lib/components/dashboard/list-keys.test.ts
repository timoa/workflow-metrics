import { describe, expect, it } from 'vitest';
import { keyWithIndex } from './list-keys';

describe('keyWithIndex', () => {
	it('returns unique keys for duplicate labels', () => {
		const first = keyWithIndex('job', 'build', 0);
		const second = keyWithIndex('job', 'build', 1);
		expect(first).not.toBe(second);
	});

	it('falls back when value or prefix are empty', () => {
		expect(keyWithIndex('', '', 0)).toBe('item:unknown:0');
	});
});
