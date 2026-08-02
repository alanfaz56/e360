import { error, type ServerLoad } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import { ROLE_LABEL, type Role } from "$lib/roles";
import { PERIODOS, hoy, parseFecha, periodoDe, sumarDias } from "$lib/agenda";
import { estadisticasUsuario } from "$lib/server/citas";
import { requirePermission } from "$lib/server/guard";

/**
 * One person's profile and their appointment numbers. Permission: `user:stats` (Admin, Gerente).
 *
 * The period is URL state (`?periodo=30`, or explicit `?desde=&hasta=`), so a particular view is
 * shareable and survives a reload — same as every other filter in the panel.
 */
export const load: ServerLoad = async ({ locals, params, url }) => {
	requirePermission(locals, "user:stats");

	const user = await prisma.user.findUnique({
		where: { id: params.id! },
		select: { id: true, name: true, email: true, role: true, banned: true, banReason: true, createdAt: true },
	});
	if (!user) error(404, "Usuario no encontrado");

	const preset = periodoDe(url.searchParams.get("periodo"));

	const hasta = parseFecha(url.searchParams.get("hasta")) ?? hoy();
	const desde =
		parseFecha(url.searchParams.get("desde")) ??
		(preset.dias === null ? user.createdAt.toISOString().slice(0, 10) : sumarDias(hasta, -preset.dias));

	return {
		usuario: {
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			roleLabel: ROLE_LABEL[user.role as Role] ?? "Sin rol",
			active: !user.banned,
			banReason: user.banReason,
			createdAt: user.createdAt.toISOString(),
		},
		stats: await estadisticasUsuario(user.id, desde, hasta),
		periodo: preset.value,
		periodos: PERIODOS.map((p) => ({ value: p.value, label: p.label })),
	};
};
