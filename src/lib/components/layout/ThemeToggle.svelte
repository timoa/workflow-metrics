<script lang="ts">
	let isDark = $state(true);

	function toggle() {
		isDark = !isDark;
		document.documentElement.classList.toggle('dark', isDark);
		try {
			localStorage.setItem('theme', isDark ? 'dark' : 'light');
		} catch { /* noop */ }
	}

	// Initialize from localStorage on mount
	$effect(() => {
		try {
			const stored = localStorage.getItem('theme');
			if (stored) {
				isDark = stored === 'dark';
				document.documentElement.classList.toggle('dark', isDark);
			}
		} catch { /* noop */ }
	});
</script>

<button
	onclick={toggle}
	class="size-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
	aria-label="Toggle theme"
	title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if isDark}
		<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="12" cy="12" r="4"/>
			<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
		</svg>
	{:else}
		<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
		</svg>
	{/if}
</button>
