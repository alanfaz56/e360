<!--
	Maps the serializable icon keys used in nav data to lucide components.
	Per-icon imports (not the barrel) so only what's used lands in the bundle.
-->
<script lang="ts">
	import Users from "@lucide/svelte/icons/users";
	import Contact from "@lucide/svelte/icons/contact";
	import ScrollText from "@lucide/svelte/icons/scroll-text";
	import Car from "@lucide/svelte/icons/car";
	import CalendarDays from "@lucide/svelte/icons/calendar-days";
	import List from "@lucide/svelte/icons/list";
	import type { NavItem } from "$lib/nav";

	const ICONS = {
		users: Users,
		contact: Contact,
		car: Car,
		"scroll-text": ScrollText,
		"calendar-days": CalendarDays,
		list: List,
	};

	let { name, ...rest }: { name: NavItem["icon"]; [key: string]: unknown } = $props();

	const Component = $derived(ICONS[name]);
</script>

<Component {...rest} />
