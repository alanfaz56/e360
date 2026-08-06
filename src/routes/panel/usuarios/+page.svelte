<script lang="ts">
	import UserPlus from "@lucide/svelte/icons/user-plus";
	import Ban from "@lucide/svelte/icons/ban";
	import ShieldUser from "@lucide/svelte/icons/shield-user";
	import Lock from "@lucide/svelte/icons/lock";
	import LockOpen from "@lucide/svelte/icons/lock-open";
	import Eye from "@lucide/svelte/icons/eye";
	import LinkIcon from "@lucide/svelte/icons/link";
	import Copy from "@lucide/svelte/icons/copy";
	import Check from "@lucide/svelte/icons/check";
	import Badge from "$lib/components/Badge.svelte";
	import Button from "$lib/components/Button.svelte";
	import DataTable from "$lib/components/DataTable.svelte";
	import Drawer from "$lib/components/Drawer.svelte";
	import Field from "$lib/components/Field.svelte";
	import PageHeader from "$lib/components/PageHeader.svelte";
	import Flash from "$lib/components/Flash.svelte";
	import { searchHref } from "$lib/url";
	import { page } from "$app/state";

	let { data, form } = $props();

	const canInvite = $derived(data.assignableRoles.length > 0);
	const canSetRole = $derived(data.settableRoles.length > 0);
	const drawer = $derived(page.url.searchParams.get("drawer"));
	const pending = $derived(data.invitations.filter((i) => i.status === "pendiente"));

	// Which user the role drawer is editing, resolved from the URL rather than held in state.
	const editing = $derived(data.users.find((u) => u.id === page.url.searchParams.get("user")));
	const editingHistory = $derived(data.roleChanges.filter((c) => c.entityId === editing?.id));

	const closeDrawer = $derived(searchHref(page.url, { drawer: null, user: null }));

	// Copy button only after hydration — $effect never runs during SSR, so a no-JS user is not
	// left with a dead control. Same pattern as the password toggle in Field.
	let hydrated = $state(false);
	$effect(() => {
		hydrated = true;
	});
	let copiado = $state(false);
	async function copiar() {
		if (!form?.inviteUrl) return;
		await navigator.clipboard.writeText(form.inviteUrl);
		copiado = true;
		setTimeout(() => (copiado = false), 2000);
	}

	const STATUS_TONE = {
		pendiente: "warn",
		aceptada: "ok",
		revocada: "neutral",
		vencida: "neutral",
	} as const;
</script>

<svelte:head><title>Usuarios — Estación 360</title></svelte:head>

<PageHeader
	title="Usuarios"
	description="Personal con acceso al sistema."
>
	{#snippet actions()}
		{#if canInvite}
			<Button href={searchHref(page.url, { drawer: "invitar" })}>
				<UserPlus
					size={18}
					aria-hidden="true"
				/>
				Invitar usuario
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<Flash {form} />
<!--
	The one-time invitation link.

	This lives at PAGE level, not inside the drawer: posting to `?/invitar` replaces the whole
	query string, so `?drawer=invitar` is gone by the time the result renders and anything shown
	only inside the drawer would never appear. The raw token exists exactly once — only its
	SHA-256 is stored — so losing this panel means the invitation has to be reissued.
-->
{#if form?.inviteUrl}
	<div class="mt-4 rounded-lg border-2 border-ok bg-ok/10 p-4">
		<p class="flex items-center gap-2 text-sm font-bold text-sand-900">
			<LinkIcon
				size={16}
				aria-hidden="true"
			/>
			Liga de invitación generada — cópiala ahora, no se vuelve a mostrar
		</p>
		<p class="mt-1 text-xs text-sand-600">Válida 72 horas y de un solo uso.</p>

		<div class="mt-3 flex flex-wrap items-center gap-2">
			<input
				readonly
				value={form.inviteUrl}
				aria-label="Liga de invitación"
				onfocus={(e) => e.currentTarget.select()}
				class="min-w-0 flex-1 rounded border border-sand-300 bg-white px-2 py-1.5 font-mono text-xs"
			/>
			<!-- Enhancements only: the field above is always selectable, so no-JS still works. -->
			{#if hydrated}
				<Button
					type="button"
					size="sm"
					onclick={copiar}
				>
					{#if copiado}
						<Check
							size={16}
							aria-hidden="true"
						/>
						Copiada
					{:else}
						<Copy
							size={16}
							aria-hidden="true"
						/>
						Copiar
					{/if}
				</Button>
			{/if}
			<Button
				href="https://wa.me/?text={encodeURIComponent(form.inviteUrl)}"
				variant="outline"
				size="sm"
				target="_blank"
				rel="noopener"
			>
				Enviar por WhatsApp
			</Button>
		</div>
	</div>
{/if}
{#if form?.roleChanged}
	<p
		role="status"
		class="mt-4 rounded border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-sand-800"
	>
		Rol actualizado — {form.roleChanged}
	</p>
{/if}
{#if form?.lockChanged}
	<p
		role="status"
		class="mt-4 rounded border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-sand-800"
	>
		{form.lockChanged}
	</p>
{/if}

<div class="mt-6">
	<DataTable
		columns={["Nombre", "Correo", "Rol", "Estado", ""]}
		items={data.users}
	>
		{#snippet row(user)}
			<td class="px-4 py-2.5 font-medium text-sand-950">{user.name}</td>
			<td class="px-4 py-2.5 text-sand-600">{user.email}</td>
			<td class="px-4 py-2.5">{user.roleLabel}</td>
			<td class="px-4 py-2.5">
				<Badge tone={user.active ? "ok" : "neutral"}>
					{user.active ? "Activo" : "Suspendido"}
				</Badge>
			</td>
			<td class="px-4 py-2.5">
				{#if user.id === data.actorId}
					<span class="text-xs text-sand-400">Tú</span>
				{:else}
					<div class="flex justify-end gap-1">
						{#if canSetRole}
							<Button
								href={searchHref(page.url, { drawer: "rol", user: user.id })}
								variant="ghost"
								size="sm"
							>
								<ShieldUser
									size={14}
									aria-hidden="true"
								/>
								Rol
							</Button>
						{/if}
						{#if data.canLock}
							<Button
								href={searchHref(page.url, { drawer: "bloqueo", user: user.id })}
								variant="ghost"
								size="sm"
							>
								{#if user.active}
									<Lock
										size={14}
										aria-hidden="true"
									/>
									Bloquear
								{:else}
									<LockOpen
										size={14}
										aria-hidden="true"
									/>
									Desbloquear
								{/if}
							</Button>
						{/if}
					</div>
				{/if}
			</td>
		{/snippet}
	</DataTable>
</div>

{#if data.invitations.length > 0}
	<h2 class="font-display mt-10 text-xl text-sand-950">
		Invitaciones
		{#if pending.length > 0}
			<span class="ml-1 text-sm font-normal text-sand-500">({pending.length} pendientes)</span>
		{/if}
	</h2>
	<div class="mt-3">
		<DataTable
			columns={["Correo", "Rol", "Estado", "Vence", ""]}
			items={data.invitations}
		>
			{#snippet row(invitation)}
				<td class="px-4 py-2.5 text-sand-950">{invitation.email}</td>
				<td class="px-4 py-2.5">{invitation.roleLabel}</td>
				<td class="px-4 py-2.5">
					<Badge tone={STATUS_TONE[invitation.status as keyof typeof STATUS_TONE] ?? "neutral"}>
						{invitation.status}
					</Badge>
				</td>
				<td class="px-4 py-2.5 text-sand-600">
					{new Date(invitation.expiresAt).toLocaleDateString("es-MX")}
				</td>
				<td class="px-4 py-2.5 text-right">
					{#if invitation.canRevoke}
						<form
							method="POST"
							action="?/revocar"
						>
							<input
								type="hidden"
								name="id"
								value={invitation.id}
							/>
							<Button
								variant="ghost"
								size="sm"
							>
								<Ban
									size={14}
									aria-hidden="true"
								/>
								Cancelar
							</Button>
						</form>
					{:else if invitation.status === "pendiente"}
						<span class="text-xs text-sand-400">La envió alguien más</span>
					{/if}
				</td>
			{/snippet}
		</DataTable>
	</div>
{/if}

{#if data.roleChanges.length > 0}
	<div class="mt-10 flex items-center gap-4">
		<h2 class="font-display text-xl text-sand-950">Cambios de rol recientes</h2>
		<a
			href="/panel/auditoria?action=user.role_change"
			class="ml-auto text-sm font-medium text-sand-600 underline hover:text-brand-700"
		>
			Ver auditoría completa
		</a>
	</div>
	<div class="mt-3">
		<DataTable
			columns={["Cambio", "Por", "Fecha"]}
			items={data.roleChanges}
		>
			{#snippet row(change)}
				<td class="px-4 py-2.5 text-sand-950">{change.summary}</td>
				<td class="px-4 py-2.5 text-sand-600">{change.actorEmail}</td>
				<td class="px-4 py-2.5 text-sand-600">
					{new Date(change.createdAt).toLocaleString("es-MX")}
				</td>
			{/snippet}
		</DataTable>
	</div>
{/if}

{#if drawer === "invitar" && canInvite}
	<Drawer
		title="Invitar usuario"
		description="Se genera una liga de un solo uso, válida 72 horas."
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/invitar"
			class="space-y-4"
		>
			<Field
				label="Correo"
				name="email"
				type="email"
				required
			/>
			<Field
				label="Rol"
				name="role"
				hint="Solo puedes asignar roles por debajo del tuyo."
			>
				{#snippet children(id)}
					<select
						{id}
						name="role"
						required
						class="mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 focus:border-brand-600 focus:outline-none"
					>
						{#each data.assignableRoles as role (role.value)}
							<option value={role.value}>{role.label}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			<Button full>Generar invitación</Button>
		</form>
	</Drawer>
{/if}

{#if drawer === "rol" && canSetRole && editing}
	<Drawer
		title="Cambiar rol"
		description={editing.email}
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/cambiarRol"
			class="space-y-4"
		>
			<input
				type="hidden"
				name="userId"
				value={editing.id}
			/>

			<div class="rounded border border-sand-200 bg-sand-50 px-3 py-2">
				<p class="text-sm font-medium text-sand-950">{editing.name}</p>
				<p class="mt-0.5 text-xs text-sand-600">Rol actual: {editing.roleLabel}</p>
			</div>

			<Field
				label="Nuevo rol"
				name="role"
				hint="El cambio aplica de inmediato, incluso si la persona ya tiene la sesión abierta."
			>
				{#snippet children(id)}
					<select
						{id}
						name="role"
						required
						class="mt-1 w-full rounded-md border border-sand-300 bg-white px-3 py-2 focus:border-brand-600 focus:outline-none"
					>
						{#each data.settableRoles as role (role.value)}
							<option
								value={role.value}
								selected={role.value === editing.role}>{role.label}</option
							>
						{/each}
					</select>
				{/snippet}
			</Field>

			<Button full>Guardar rol</Button>
		</form>

		{#if editingHistory.length > 0}
			<div class="mt-6 border-t border-sand-200 pt-4">
				<h3 class="text-sm font-medium text-sand-700">Historial</h3>
				<ul class="mt-2 space-y-2">
					{#each editingHistory as change (change.id)}
						<li class="text-xs text-sand-600">
							{change.summary}
							<span class="text-sand-400">
								· {new Date(change.createdAt).toLocaleDateString("es-MX")} · {change.actorEmail}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</Drawer>
{/if}

{#if drawer === "bloqueo" && data.canLock && editing}
	<Drawer
		title={editing.active ? "Bloquear usuario" : "Desbloquear usuario"}
		description={editing.email}
		closeHref={closeDrawer}
	>
		<form
			method="POST"
			action="?/bloquear"
			class="space-y-4"
		>
			<input
				type="hidden"
				name="userId"
				value={editing.id}
			/>
			<input
				type="hidden"
				name="locked"
				value={editing.active ? "true" : "false"}
			/>

			<div class="rounded border border-sand-200 bg-sand-50 px-3 py-2">
				<p class="text-sm font-medium text-sand-950">{editing.name}</p>
				<p class="mt-0.5 text-xs text-sand-600">{editing.roleLabel}</p>
			</div>

			{#if editing.active}
				<p class="text-sm text-sand-600">
					No podrá entrar al sistema y sus sesiones abiertas se cierran de inmediato. La cuenta y su historial
					se conservan; puedes desbloquearla cuando quieras.
				</p>
				<Field
					label="Motivo (opcional)"
					name="reason"
				/>
				<div class="flex gap-2 rounded border border-accent-500/60 bg-accent-500/15 px-3 py-2">
					<Eye
						size={16}
						class="mt-0.5 shrink-0 text-sand-700"
						aria-hidden="true"
					/>
					<p class="text-xs text-sand-800">
						<strong>El usuario verá este motivo</strong> cuando intente iniciar sesión. Escríbelo pensando en
						que lo va a leer. También queda registrado en la auditoría.
					</p>
				</div>
				<Button full>
					<Lock
						size={16}
						aria-hidden="true"
					/>
					Bloquear acceso
				</Button>
			{:else}
				<p class="text-sm text-sand-600">
					Volverá a tener acceso con su rol de {editing.roleLabel}. Tendrá que iniciar sesión otra vez.
				</p>
				<Button full>
					<LockOpen
						size={16}
						aria-hidden="true"
					/>
					Restablecer acceso
				</Button>
			{/if}
		</form>
	</Drawer>
{/if}
