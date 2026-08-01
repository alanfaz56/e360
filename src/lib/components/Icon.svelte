<!--
	Maps the serializable icon keys used in nav data to lucide components.
	Per-icon imports (not the barrel) so only what's used lands in the bundle.
-->
<script lang="ts">
	import Users from "@lucide/svelte/icons/users";
	import Contact from "@lucide/svelte/icons/contact";
	import ScrollText from "@lucide/svelte/icons/scroll-text";
	import type { NavItem } from "$lib/nav";

	const ICONS = { users: Users, contact: Contact, "scroll-text": ScrollText };

	let { name, ...rest }: { name: NavItem["icon"]; [key: string]: unknown } = $props();

	const Component = $derived(ICONS[name]);
</script>

<Component {...rest} />
