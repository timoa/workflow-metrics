<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import type { User } from '@supabase/supabase-js';
	import { Tooltip } from 'bits-ui';

	let { user, githubUser = null }: { user: User; githubUser?: { username: string; avatarUrl: string | null } | null } = $props();

	const navItems = [
		{
			href: '/dashboard',
			label: 'Dashboard',
			icon: `<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`
		},
		{
			href: '/settings',
			label: 'Settings',
			icon: `<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`
		}
	];
</script>

<aside class="w-16 flex-shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col h-full">
	<!-- Brand -->
	<div class="h-14 flex items-center justify-center border-b border-sidebar-border">
		<img src="/logo.svg" alt="Workflow Metrics" class="size-8 object-contain" />
	</div>

	<!-- Navigation -->
	<nav class="flex-1 py-3 space-y-1">
		{#each navItems as item (item.label)}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<a
							{...props}
							href={item.href}
							class={cn(
								'flex items-center justify-center rounded-md mx-2 py-3 transition-colors border-l-2',
								page.url.pathname === item.href || page.url.pathname.startsWith(item.href + '/')
									? 'border-l-primary bg-sidebar-primary text-sidebar-primary-foreground'
									: 'border-l-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
							)}
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html item.icon}
						</a>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Content
						side="right"
						sideOffset={8}
						class="z-50 rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md border border-border"
					>
						{item.label}
						<Tooltip.Arrow class="fill-popover" />
					</Tooltip.Content>
				</Tooltip.Portal>
			</Tooltip.Root>
		{/each}
	</nav>

	<!-- User footer -->
	<div class="p-2 border-t border-sidebar-border">
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<div {...props} class="flex items-center justify-center">
						<div class="size-9 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
							{#if githubUser?.avatarUrl}
								<img
									src={githubUser.avatarUrl}
									alt={githubUser.username}
									class="size-full object-cover"
								/>
							{:else}
								<svg class="size-5 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
									<path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
								</svg>
							{/if}
						</div>
					</div>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Portal>
				<Tooltip.Content
					side="right"
					sideOffset={8}
					class="z-50 rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md border border-border"
				>
					<p class="font-medium">{githubUser?.username ?? user.email?.split('@')[0] ?? 'User'}</p>
					<p class="text-xs text-muted-foreground">{user.email}</p>
					<Tooltip.Arrow class="fill-popover" />
				</Tooltip.Content>
			</Tooltip.Portal>
		</Tooltip.Root>

		<form method="POST" action="/auth/logout" class="mt-2">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="submit"
							class="w-full flex items-center justify-center py-2 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-md transition-colors"
						>
							<svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
								<polyline points="16 17 21 12 16 7"/>
								<line x1="21" x2="9" y1="12" y2="12"/>
							</svg>
						</button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Content
						side="right"
						sideOffset={8}
						class="z-50 rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md border border-border"
					>
						Sign out
						<Tooltip.Arrow class="fill-popover" />
					</Tooltip.Content>
				</Tooltip.Portal>
			</Tooltip.Root>
		</form>
	</div>
</aside>
