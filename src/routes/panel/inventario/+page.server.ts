import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { can } from "$lib/roles";
import { ClienteError } from "$lib/server/clientes";
import { requirePermission, requireUser } from "$lib/server/guard";
import {
	ajustarExistencia,
	capasDe,
	listMovimientos,
	listSolicitudes,
	registrarEntrada,
	resolverSolicitud,
	valorInventario,
} from "$lib/server/inventario";
import {
	actualizarProducto,
	archivarProducto,
	crearProducto,
	listProductos,
	parseProductoQuery,
} from "$lib/server/productos";

/**
 * Catalogue and stock on one screen, because they are one job: you look something up to know
 * whether to order it.
 *
 * Everything is a real form action calling the same shared functions the API routes call, so the
 * whole thing works with JavaScript off — including the CFDI upload, which is a plain file input
 * posted to the server rather than a signed direct upload (an XML is kilobytes, not a phone photo).
 */
export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requirePermission(locals, "producto:read");
	const query = parseProductoQuery(url.searchParams);

	// Only what the open drawer actually needs. The list view pays for none of it.
	const drawer = url.searchParams.get("drawer");
	const productoId = url.searchParams.get("producto");

	const [lista, valor, pendientes, capas, movimientos] = await Promise.all([
		listProductos({ ...query, perPage: query.perPage ?? 50 }),
		can(actor.role, "inventario:read") ? valorInventario() : null,
		can(actor.role, "inventario:salida") ? listSolicitudes({ estado: "pendiente" }) : [],
		productoId && drawer === "existencia" ? capasDe(productoId) : [],
		drawer === "movimientos" ? listMovimientos({ productoId, perPage: 50 }).then((r) => r.movimientos) : [],
	]);

	return {
		...lista,
		valorInventario: valor,
		pendientes,
		capas,
		movimientos,
		filtros: {
			q: query.q ?? "",
			tipo: query.tipo ?? "",
			bajos: query.bajos ?? false,
			archivados: query.archivados ?? false,
		},
		puede: {
			gestionar: can(actor.role, "producto:manage"),
			entrada: can(actor.role, "inventario:entrada"),
			ajuste: can(actor.role, "inventario:ajuste"),
			salida: can(actor.role, "inventario:salida"),
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
			await crearProducto({ actor, body });
			redirect(303, "/panel/inventario");
		} catch (err) {
			return problema(err);
		}
	},

	editar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		const body = Object.fromEntries(data) as Record<string, unknown>;
		// An unchecked checkbox posts nothing, so "off" has to be read as absence, not as a value.
		body.controlaInventario = data.get("controlaInventario") !== null;
		try {
			await actualizarProducto({ actor, id: String(data.get("id")), body });
			redirect(303, "/panel/inventario");
		} catch (err) {
			return problema(err);
		}
	},

	archivar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await archivarProducto({
				actor,
				id: String(data.get("id")),
				archivado: data.get("archivado") === "1",
			});
			redirect(303, "/panel/inventario");
		} catch (err) {
			return problema(err);
		}
	},

	/**
	 * Receive goods. The CFDI arrives as a plain file field: an XML is a few kilobytes, so it can
	 * ride the form post — unlike an intake photo, which is why THAT one goes straight to R2.
	 */
	entrada: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();

		const archivo = data.get("cfdi");
		const cfdiXml = archivo instanceof File && archivo.size > 0 ? await archivo.text() : null;

		// The form posts parallel arrays, which is what a plain <form> can express.
		const ids = data.getAll("productoId").map(String);
		const cantidades = data.getAll("cantidad").map(String);
		const costos = data.getAll("costoUnitario").map(String);

		const lineas = ids
			.map((productoId, i) => ({ productoId, cantidad: cantidades[i], costoUnitario: costos[i] }))
			.filter((l) => l.productoId && l.cantidad && l.costoUnitario);

		try {
			await registrarEntrada({
				actor,
				body: {
					proveedor: data.get("proveedor"),
					referencia: data.get("referencia"),
					notas: data.get("notas"),
					cfdiXml,
					lineas,
				},
			});
			redirect(303, "/panel/inventario");
		} catch (err) {
			return problema(err);
		}
	},

	ajustar: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await ajustarExistencia({
				actor,
				productoId: String(data.get("productoId")),
				nueva: data.get("nueva"),
				motivo: data.get("motivo"),
				costoUnitario: data.get("costoUnitario"),
			});
			redirect(303, "/panel/inventario");
		} catch (err) {
			return problema(err);
		}
	},

	resolverSolicitud: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const data = await request.formData();
		try {
			await resolverSolicitud({
				actor,
				id: String(data.get("id")),
				estado: String(data.get("estado")),
				motivo: data.get("motivo"),
			});
			redirect(303, "/panel/inventario");
		} catch (err) {
			return problema(err);
		}
	},
};
