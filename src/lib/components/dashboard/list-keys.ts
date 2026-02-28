/**
 * Creates a deterministic keyed-each key that is safe when labels repeat.
 * We include index to avoid Svelte duplicate-key runtime crashes.
 */
export function keyWithIndex(prefix: string, value: string, index: number): string {
	const normalizedPrefix = prefix.trim() || 'item';
	const normalizedValue = value.trim() || 'unknown';
	return `${normalizedPrefix}:${normalizedValue}:${index}`;
}
