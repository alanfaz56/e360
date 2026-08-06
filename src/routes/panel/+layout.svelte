<script lang="ts">
	import Menu from "@lucide/svelte/icons/menu";
	import X from "@lucide/svelte/icons/x";
	import LogOut from "@lucide/svelte/icons/log-out";
	import Icon from "$lib/components/Icon.svelte";
	import NotificationBell from "$lib/components/NotificationBell.svelte";
	import NotificationDrawer from "$lib/components/NotificationDrawer.svelte";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, children } = $props();

	// The mobile sidebar is URL state, same as the drawers — it works without JavaScript
	// and never desyncs from the back button.
	const menuOpen = $derived(page.url.searchParams.has("menu"));
	const menuHref = (open: boolean) => searchHref(page.url, { menu: open ? "1" : null });

	// Agenda lives at /panel itself, which is a prefix of every other section — so that one
	// entry has to match exactly or it would light up on every screen.
	const isActive = (href: string) =>
		href === "/panel" ? page.url.pathname === "/panel" : page.url.pathname.startsWith(href);
</script>

<div class="min-h-svh bg-sand-50">
	<!-- Mobile top bar -->
	<header class="sticky top-0 z-30 flex items-center gap-3 border-b border-sand-200 bg-white px-4 py-3 md:hidden">
		<a
			href={menuHref(true)}
			aria-label="Abrir menú"
			class="-ml-2 rounded-md p-2 text-sand-700 hover:bg-sand-100"
		>
			<Menu
				size={22}
				aria-hidden="true"
			/>
		</a>
		<span class="font-display text-lg text-sand-950">ESTACIÓN <span class="text-brand-600">360</span></span>
		<!-- Thumb-reachable on a phone: top-right of the bar the operator is already holding. -->
		<div class="ml-auto">
			<NotificationBell noLeidas={data.noLeidas} />
		</div>
	</header>

	<!-- Off-canvas scrim (phones only) -->
	{#if menuOpen}
		<a
			href={menuHref(false)}
			tabindex="-1"
			aria-hidden="true"
			class="fixed inset-0 z-40 bg-sand-950/40 md:hidden">{""}</a
		>
	{/if}

	<!--
		One <aside> for both breakpoints: a fixed left rail from md up, an off-canvas panel
		below it. Avoids rendering the nav twice and keeps a single source of markup.
	-->
	<aside
		class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sand-200 bg-white transition-transform md:translate-x-0
			{menuOpen ? 'translate-x-0' : '-translate-x-full'}"
	>
		<div class="flex items-center gap-2 border-b border-sand-200 px-5 py-4">
			<a
				href="/panel"
				class="font-display text-lg text-sand-950"
			>
				ESTACIÓN <span class="text-brand-600">360</span>
			</a>
			{#if menuOpen}
				<a
					href={menuHref(false)}
					aria-label="Cerrar menú"
					class="-mr-2 ml-auto rounded-md p-2 text-sand-500 hover:bg-sand-100 md:hidden"
				>
					<X
						size={20}
						aria-hidden="true"
					/>
				</a>
			{/if}
		</div>

		<nav
			class="flex-1 space-y-1 p-3"
			aria-label="Secciones"
		>
			{#each data.nav as item (item.href)}
				<a
					href={item.href}
					aria-current={isActive(item.href) ? "page" : undefined}
					class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
						{isActive(item.href) ? 'bg-brand-50 text-brand-700' : 'text-sand-700 hover:bg-sand-100 hover:text-sand-950'}"
				>
					<Icon
						name={item.icon}
						size={18}
						aria-hidden="true"
					/>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="border-t border-sand-200 p-3">
			<div class="flex items-center gap-2">
				<div class="min-w-0 flex-1">
					<p class="truncate px-3 text-sm font-medium text-sand-950">{data.actor.name}</p>
					<p class="px-3 text-xs text-sand-500">{data.actor.roleLabel}</p>
				</div>
				<!-- Desktop copy of the bell. Only the button is duplicated; the drawer is mounted
				     once, below, so there is never a second copy of the inbox in the DOM. -->
				<span class="hidden md:block">
					<NotificationBell noLeidas={data.noLeidas} />
				</span>
			</div>
			<form
				method="POST"
				action="/logout"
				class="mt-2"
			>
				<button
					class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sand-700 transition-colors hover:bg-sand-100 hover:text-brand-700"
				>
					<LogOut
						size={18}
						aria-hidden="true"
					/>
					Salir
				</button>
			</form>
		</div>
	</aside>

	<div class="md:pl-64">
		<main class="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
			{@render children()}
		</main>
	</div>

	<!-- One inbox for both breakpoints. -->
	<NotificationDrawer
		noLeidas={data.noLeidas}
		avisos={data.avisos}
	/>
</div>
