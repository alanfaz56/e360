import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { can } from "$lib/roles";
import { ClienteError } from "$lib/server/clientes";
import { requirePermission, requireUser } from "$lib/server/guard";
import {
	archivarSucursal,
	createSucursal,
	createTaller,
	getTallerDetalle,
	listTalleres,
	parseTallerQuery,
	revisarTaller,
	setTallerArchivado,
	updateSucursal,
	updateTaller,
} from "$lib/server/talleres";

/** Partner workshops Estación 360 sources jobs out to, plus the applications waiting to be judged. */
export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "taller:read");
	const query = parseTallerQuery(url.searchParams);

	// The branch drawer needs one workshop's detail. Loaded only when a drawer is actually open, so
	// the list view pays nothing for it.
	const abierto = url.searchParams.get("taller");
	const detalle = abierto ? await getTallerDetalle(abierto).catch(() => null) : null;

	return {
		...(await listTalleres(query, actor)),
		detalle,
		filtros: { q: query.q ?? "", archivados: query.archivados ?? false, estado: query.estado ?? "" },
		puede: {
			gestionar: can(actor.role, "taller:manage"),
			revisar: can(actor.role, "taller:review"),
		},
	};
};

const problema = (err: unknown) => {
	if (err instanceof ClienteError) return fail(err.status, { message: err.message });
	throw err;
};

export const actions: Actions = {
	crear: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;
		try {
			await createTaller({ actor, body });
			redirect(303, "/panel/talleres");
		} catch (err) {
			return problema(err);
		}
	},

	editar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		const body = Object.fromEntries(data) as Record<string, unknown>;
		try {
			await updateTaller({ actor, id: String(data.get("id")), body });
			redirect(303, "/panel/talleres");
		} catch (err) {
			return problema(err);
		}
	},

	archivar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await setTallerArchivado({
				actor,
				id: String(data.get("id")),
				archivado: data.get("archivado") === "1",
			});
			redirect(303, "/panel/talleres");
		} catch (err) {
			return problema(err);
		}
	},

	/** Certify or turn down an application. A rejection carries the reason back to the shop. */
	revisar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await revisarTaller({
				actor,
				id: String(data.get("id")),
				estado: String(data.get("estado")),
				motivo: data.get("motivo"),
			});
			redirect(303, "/panel/talleres?estado=solicitado");
		} catch (err) {
			return problema(err);
		}
	},

	crearSucursal: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		const body = Object.fromEntries(data) as Record<string, unknown>;
		const tallerId = String(data.get("tallerId"));
		try {
			await createSucursal({ actor, tallerId, body });
			redirect(303, `/panel/talleres?taller=${tallerId}&drawer=sucursales`);
		} catch (err) {
			return problema(err);
		}
	},

	editarSucursal: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		const body = Object.fromEntries(data) as Record<string, unknown>;
		try {
			await updateSucursal({ actor, id: String(data.get("id")), body });
			redirect(303, `/panel/talleres?taller=${String(data.get("tallerId"))}&drawer=sucursales`);
		} catch (err) {
			return problema(err);
		}
	},

	archivarSucursal: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await archivarSucursal({
				actor,
				id: String(data.get("id")),
				archivado: data.get("archivado") === "1",
			});
			redirect(303, `/panel/talleres?taller=${String(data.get("tallerId"))}&drawer=sucursales`);
		} catch (err) {
			return problema(err);
		}
	},
};
