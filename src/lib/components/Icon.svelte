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
	import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";
	import ChartColumn from "@lucide/svelte/icons/chart-column";
	import List from "@lucide/svelte/icons/list";
	import ClipboardList from "@lucide/svelte/icons/clipboard-list";
	import ReceiptText from "@lucide/svelte/icons/receipt-text";
	import Wrench from "@lucide/svelte/icons/wrench";
	import Package from "@lucide/svelte/icons/package";
	import Settings from "@lucide/svelte/icons/settings";
	import Bell from "@lucide/svelte/icons/bell";
	import Landmark from "@lucide/svelte/icons/landmark";
	import ShieldCheck from "@lucide/svelte/icons/shield-check";
	import Sparkles from "@lucide/svelte/icons/sparkles";
	import Truck from "@lucide/svelte/icons/truck";
	import MessageCircle from "@lucide/svelte/icons/message-circle";
	import CircleHelp from "@lucide/svelte/icons/circle-help";
	import type { NavItem } from "$lib/nav";

	const ICONS = {
		package: Package,
		users: Users,
		contact: Contact,
		car: Car,
		"scroll-text": ScrollText,
		"layout-dashboard": LayoutDashboard,
		"chart-column": ChartColumn,
		"calendar-days": CalendarDays,
		list: List,
		"clipboard-list": ClipboardList,
		"receipt-text": ReceiptText,
		wrench: Wrench,
		settings: Settings,
		bell: Bell,
		landmark: Landmark,
		"shield-check": ShieldCheck,
		sparkles: Sparkles,
		truck: Truck,
		"message-circle": MessageCircle,
		"circle-help": CircleHelp,
	};

	let { name, ...rest }: { name: NavItem["icon"]; [key: string]: unknown } = $props();

	const Component = $derived(ICONS[name]);
</script>

<Component {...rest} />
