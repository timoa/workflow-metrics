import { describe, expect, it } from 'vitest';
import {
	cn,
	formatDuration,
	formatRelativeTime,
	formatDate,
	computeDurationMs,
	percentile,
	successRateColor,
	successRateBorderColor,
	failureRateColor,
	failureRateBorderColor,
	conclusionColor,
	conclusionBadgeVariant,
	statusLabel
} from './utils';

describe('cn', () => {
	it('merges tailwind classes correctly', () => {
		expect(cn('px-2', 'py-4')).toBe('px-2 py-4');
	});

	it('handles conditional classes', () => {
		const condition = true;
		expect(cn('base', condition && 'conditional')).toBe('base conditional');
	});

	it('deduplicates conflicting classes', () => {
		expect(cn('px-2', 'px-4')).toBe('px-4');
	});

	it('handles empty inputs', () => {
		expect(cn()).toBe('');
		expect(cn('', null, undefined)).toBe('');
	});

	it('handles array inputs', () => {
		expect(cn(['px-2', 'py-4'])).toBe('px-2 py-4');
	});
});

describe('formatDuration', () => {
	it('returns em dash for null/undefined/negative values', () => {
		expect(formatDuration(null)).toBe('—');
		expect(formatDuration(undefined)).toBe('—');
		expect(formatDuration(-1)).toBe('—');
	});

	it('formats milliseconds when less than 1000ms', () => {
		expect(formatDuration(500)).toBe('500ms');
		expect(formatDuration(999)).toBe('999ms');
	});

	it('formats seconds when less than 60 seconds', () => {
		expect(formatDuration(1000)).toBe('1s');
		expect(formatDuration(59000)).toBe('59s');
		expect(formatDuration(45000)).toBe('45s');
	});

	it('formats minutes when less than 60 minutes', () => {
		expect(formatDuration(60000)).toBe('1m');
		expect(formatDuration(90000)).toBe('1m 30s');
		expect(formatDuration(3540000)).toBe('59m');
	});

	it('formats hours with optional minutes', () => {
		expect(formatDuration(3600000)).toBe('1h');
		expect(formatDuration(5400000)).toBe('1h 30m');
		expect(formatDuration(7200000)).toBe('2h');
	});
});

describe('formatRelativeTime', () => {
	it('returns em dash for null/undefined', () => {
		expect(formatRelativeTime(null)).toBe('—');
		expect(formatRelativeTime(undefined)).toBe('—');
	});

	it('returns "just now" for recent timestamps', () => {
		const now = new Date().toISOString();
		expect(formatRelativeTime(now)).toBe('just now');
	});

	it('returns minutes ago for recent times', () => {
		const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();
		expect(formatRelativeTime(fiveMinutesAgo)).toBe('5m ago');
	});

	it('returns hours ago for times within 24 hours', () => {
		const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
		expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago');
	});

	it('returns days ago for times within a week', () => {
		const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
		expect(formatRelativeTime(threeDaysAgo)).toBe('3d ago');
	});

	it('returns formatted date for times older than a week', () => {
		const oldDate = '2023-06-15T10:30:00Z';
		const result = formatRelativeTime(oldDate);
		expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
	});
});

describe('formatDate', () => {
	it('returns em dash for null/undefined', () => {
		expect(formatDate(null)).toBe('—');
		expect(formatDate(undefined)).toBe('—');
	});

	it('formats date correctly', () => {
		expect(formatDate('2023-06-15T10:30:00Z')).toMatch(/Jun \d{1,2}, 2023/);
	});
});

describe('computeDurationMs', () => {
	it('returns null when either date is missing', () => {
		expect(computeDurationMs(null, '2024-01-01T00:01:00Z')).toBeNull();
		expect(computeDurationMs('2024-01-01T00:00:00Z', null)).toBeNull();
		expect(computeDurationMs(undefined, undefined)).toBeNull();
	});

	it('computes correct duration', () => {
		expect(computeDurationMs('2024-01-01T00:00:00Z', '2024-01-01T00:01:30Z')).toBe(90000);
		expect(computeDurationMs('2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z')).toBe(3600000);
	});

	it('returns null when end date is before start date', () => {
		expect(computeDurationMs('2024-01-01T00:01:00Z', '2024-01-01T00:00:00Z')).toBeNull();
	});

	it('returns null for invalid dates', () => {
		expect(computeDurationMs('invalid', '2024-01-01T00:00:00Z')).toBeNull();
		expect(computeDurationMs('2024-01-01T00:00:00Z', 'invalid')).toBeNull();
	});
});

describe('percentile', () => {
	it('returns 0 for empty array', () => {
		expect(percentile([], 50)).toBe(0);
	});

	it('returns correct percentile for single element', () => {
		expect(percentile([100], 50)).toBe(100);
		expect(percentile([100], 90)).toBe(100);
	});

	it('returns correct percentile for sorted array', () => {
		const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
		expect(percentile(sorted, 50)).toBe(50);
		expect(percentile(sorted, 90)).toBe(90);
		expect(percentile(sorted, 95)).toBe(100);
	});

	it('handles edge cases', () => {
		const sorted = [10, 20, 30];
		expect(percentile(sorted, 0)).toBe(10);
		expect(percentile(sorted, 100)).toBe(30);
	});
});

describe('successRateColor', () => {
	it('returns green for 90% and above', () => {
		expect(successRateColor(90)).toBe('text-green-500');
		expect(successRateColor(95)).toBe('text-green-500');
		expect(successRateColor(100)).toBe('text-green-500');
	});

	it('returns yellow for 70-89%', () => {
		expect(successRateColor(70)).toBe('text-yellow-500');
		expect(successRateColor(80)).toBe('text-yellow-500');
		expect(successRateColor(89)).toBe('text-yellow-500');
	});

	it('returns red for below 70%', () => {
		expect(successRateColor(69)).toBe('text-red-500');
		expect(successRateColor(50)).toBe('text-red-500');
		expect(successRateColor(0)).toBe('text-red-500');
	});
});

describe('successRateBorderColor', () => {
	it('returns green border for 90% and above', () => {
		expect(successRateBorderColor(90)).toBe('border-l-4 border-l-green-500');
		expect(successRateBorderColor(100)).toBe('border-l-4 border-l-green-500');
	});

	it('returns yellow border for 70-89%', () => {
		expect(successRateBorderColor(70)).toBe('border-l-4 border-l-yellow-500');
		expect(successRateBorderColor(85)).toBe('border-l-4 border-l-yellow-500');
	});

	it('returns red border for below 70%', () => {
		expect(successRateBorderColor(69)).toBe('border-l-4 border-l-red-500');
		expect(successRateBorderColor(0)).toBe('border-l-4 border-l-red-500');
	});
});

describe('failureRateColor', () => {
	it('returns green for 10% or below', () => {
		expect(failureRateColor(10)).toBe('text-green-500');
		expect(failureRateColor(5)).toBe('text-green-500');
		expect(failureRateColor(0)).toBe('text-green-500');
	});

	it('returns yellow for 11-30%', () => {
		expect(failureRateColor(11)).toBe('text-yellow-500');
		expect(failureRateColor(20)).toBe('text-yellow-500');
		expect(failureRateColor(30)).toBe('text-yellow-500');
	});

	it('returns red for above 30%', () => {
		expect(failureRateColor(31)).toBe('text-red-500');
		expect(failureRateColor(50)).toBe('text-red-500');
		expect(failureRateColor(100)).toBe('text-red-500');
	});
});

describe('failureRateBorderColor', () => {
	it('returns green border for 10% or below', () => {
		expect(failureRateBorderColor(10)).toBe('border-l-4 border-l-green-500');
		expect(failureRateBorderColor(0)).toBe('border-l-4 border-l-green-500');
	});

	it('returns yellow border for 11-30%', () => {
		expect(failureRateBorderColor(15)).toBe('border-l-4 border-l-yellow-500');
		expect(failureRateBorderColor(30)).toBe('border-l-4 border-l-yellow-500');
	});

	it('returns red border for above 30%', () => {
		expect(failureRateBorderColor(31)).toBe('border-l-4 border-l-red-500');
		expect(failureRateBorderColor(100)).toBe('border-l-4 border-l-red-500');
	});
});

describe('conclusionColor', () => {
	it('returns correct colors for each conclusion', () => {
		expect(conclusionColor('success')).toBe('text-success');
		expect(conclusionColor('failure')).toBe('text-destructive');
		expect(conclusionColor('cancelled')).toBe('text-yellow-500');
		expect(conclusionColor('timed_out')).toBe('text-orange-500');
		expect(conclusionColor('skipped')).toBe('text-muted-foreground');
	});

	it('returns muted for null, undefined, or unknown conclusions', () => {
		expect(conclusionColor(null)).toBe('text-muted-foreground');
		expect(conclusionColor(undefined)).toBe('text-muted-foreground');
		expect(conclusionColor('unknown')).toBe('text-muted-foreground');
	});
});

describe('conclusionBadgeVariant', () => {
	it('returns correct variants for each conclusion', () => {
		expect(conclusionBadgeVariant('success')).toBe('default');
		expect(conclusionBadgeVariant('failure')).toBe('destructive');
	});

	it('returns secondary for other conclusions', () => {
		expect(conclusionBadgeVariant('cancelled')).toBe('secondary');
		expect(conclusionBadgeVariant('skipped')).toBe('secondary');
		expect(conclusionBadgeVariant(null)).toBe('secondary');
		expect(conclusionBadgeVariant(undefined)).toBe('secondary');
	});
});

describe('statusLabel', () => {
	it('returns "Running" for in_progress status', () => {
		expect(statusLabel('in_progress', null)).toBe('Running');
		expect(statusLabel('in_progress', 'success')).toBe('Running');
	});

	it('returns "Queued" for queued status', () => {
		expect(statusLabel('queued', null)).toBe('Queued');
	});

	it('capitalizes conclusion when no status', () => {
		expect(statusLabel(null, 'success')).toBe('Success');
		expect(statusLabel(null, 'failure')).toBe('Failure');
		expect(statusLabel(null, 'cancelled')).toBe('Cancelled');
	});

	it('replaces underscores with spaces in conclusion', () => {
		expect(statusLabel(null, 'timed_out')).toBe('Timed out');
	});

	it('returns em dash for null status and conclusion', () => {
		expect(statusLabel(null, null)).toBe('—');
	});

	it('returns status as-is when no conclusion', () => {
		expect(statusLabel('completed', null)).toBe('completed');
	});
});
