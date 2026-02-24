import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatDuration(ms: number | null | undefined): string {
	if (ms == null || ms < 0) return '—';
	if (ms < 1000) return `${ms}ms`;
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (minutes < 60) {
		return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
	}
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatRelativeTime(dateStr: string | null | undefined): string {
	if (!dateStr) return '—';
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMinutes = Math.floor(diffMs / 60000);
	if (diffMinutes < 1) return 'just now';
	if (diffMinutes < 60) return `${diffMinutes}m ago`;
	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) return `${diffHours}h ago`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDate(dateStr: string | null | undefined): string {
	if (!dateStr) return '—';
	return new Date(dateStr).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

export function computeDurationMs(
	startedAt: string | null | undefined,
	updatedAt: string | null | undefined
): number | null {
	if (!startedAt || !updatedAt) return null;
	const start = new Date(startedAt).getTime();
	const end = new Date(updatedAt).getTime();
	if (isNaN(start) || isNaN(end) || end < start) return null;
	return end - start;
}

export function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.ceil((p / 100) * sorted.length) - 1;
	return sorted[Math.max(0, index)];
}

/** Tailwind class for success rate: green ≥90%, yellow ≥70%, red below. */
export function successRateColor(rate: number): string {
	if (rate >= 90) return 'text-green-500';
	if (rate >= 70) return 'text-yellow-500';
	return 'text-red-500';
}

/** Tailwind class for failure rate: green ≤10%, yellow ≤30%, red above. */
export function failureRateColor(failureRate: number): string {
	if (failureRate <= 10) return 'text-green-500';
	if (failureRate <= 30) return 'text-yellow-500';
	return 'text-red-500';
}

export function conclusionColor(conclusion: string | null | undefined): string {
	switch (conclusion) {
		case 'success':
			return 'text-success';
		case 'failure':
			return 'text-destructive';
		case 'cancelled':
			return 'text-yellow-500';
		case 'timed_out':
			return 'text-orange-500';
		case 'skipped':
			return 'text-muted-foreground';
		default:
			return 'text-muted-foreground';
	}
}

export function conclusionBadgeVariant(
	conclusion: string | null | undefined
): 'default' | 'secondary' | 'destructive' | 'outline' {
	switch (conclusion) {
		case 'success':
			return 'default';
		case 'failure':
			return 'destructive';
		default:
			return 'secondary';
	}
}

export function statusLabel(
	status: string | null,
	conclusion: string | null
): string {
	if (status === 'in_progress') return 'Running';
	if (status === 'queued') return 'Queued';
	if (!conclusion) return status ?? '—';
	return conclusion.charAt(0).toUpperCase() + conclusion.slice(1).replace('_', ' ');
}
