import type { Actions, ServerLoad } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import prisma from "$lib/prisma";
import { can } from "$lib/roles";
import { requirePermission } from "$lib/server/guard";
import { leerCfdi } from "$lib/cfdi";
import { crearProducto } from "$lib/server/productos";
import { registrarEntrada } from "$lib/server/inventario";
import { fallo } from "$lib/server/errores";
import { ClienteError } from "$lib/server/clientes";

/**
 * Reconcile a supplier's CFDI against the catalog: one row per invoice line, each either mapped
 * to an existing product or turned into a new one, then received in a single entrada.
 *
 * Two actions, no draft table: `previsualizar` parses the XML and renders an editable review
 * (the raw XML rides along in a hidden field); `confirmar` re-parses that SAME XML server-side —
 * the header (uuid/emisor) is never trusted from client-editable fields, only the raw document —
 * and reuses `crearProducto`/`registrarEntrada` untouched, so this is entirely new UI over
 * existing, already-tested write paths.
 */
export const load: ServerLoad = async ({ locals }) => {
	const actor = requirePermission(locals, "inventario:entrada");
	if (!can(actor.role, "producto:manage")) error(403, "Sin permiso: producto:manage");
	return {};
};

const STOCKABLE = {
	archivedAt: null,
	controlaInventario: true,
} as const;

async function productosEmparejables() {
	const rows = await prisma.producto.findMany({
		where: STOCKABLE,
		select: { id: true, sku: true, nombre: true, _count: { select: { componentes: true } } },
	});
	// A package never carries its own stock — it cannot be the target of a purchase line.
	return rows.filter((p) => p._count.componentes === 0);
}

type FilaRevision = {
	claveProdServ: string;
	noIdentificacion: string;
	cantidad: string;
	claveUnidad: string;
	unidad: string;
	descripcion: string;
	valorUnitario: string;
	matchId: string;
};

export const actions: Actions = {
	previsualizar: async ({ locals, request }) => {
		const actor = requirePermission(locals, "inventario:entrada");
		if (!can(actor.role, "producto:manage")) error(403, "Sin permiso: producto:manage");

		const data = await request.formData();
		const archivo = data.get("cfdi");
		const xml = archivo instanceof File && archivo.size > 0 ? await archivo.text() : null;
		if (!xml) return fallo(new ClienteError(400, "Sube el XML del CFDI"));

		const cfdi = leerCfdi(xml);
		if (!cfdi) return fallo(new ClienteError(400, "Ese archivo no parece un CFDI."));
		if (cfdi.conceptos.length === 0) {
			return fallo(new ClienteError(400, "El CFDI no trae conceptos que revisar."));
		}

		const disponibles = await productosEmparejables();
		const porSku = new Map(disponibles.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p]));
		const porNombre = new Map(disponibles.map((p) => [p.nombre.toLowerCase(), p]));

		const filas: FilaRevision[] = cfdi.conceptos.map((c) => {
			const match =
				(c.noIdentificacion && porSku.get(c.noIdentificacion.toLowerCase())) ||
				(c.descripcion && porNombre.get(c.descripcion.toLowerCase())) ||
				null;
			return {
				claveProdServ: c.claveProdServ ?? "",
				noIdentificacion: c.noIdentificacion ?? "",
				cantidad: c.cantidad !== null ? c.cantidad.toFixed(3) : "",
				claveUnidad: c.claveUnidad ?? "H87",
				unidad: c.unidad ?? "",
				descripcion: c.descripcion ?? "",
				valorUnitario: c.valorUnitario !== null ? c.valorUnitario.toFixed(4) : "",
				matchId: match?.id ?? "",
			};
		});

		return {
			preview: true as const,
			xml,
			emisor: cfdi.emisorNombre,
			filas,
			catalogo: disponibles.map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku })),
		};
	},

	confirmar: async ({ locals, request }) => {
		const actor = requirePermission(locals, "inventario:entrada");
		if (!can(actor.role, "producto:manage")) error(403, "Sin permiso: producto:manage");

		const data = await request.formData();
		const xml = String(data.get("xml") ?? "");
		const cfdi = leerCfdi(xml);
		if (!cfdi) return fallo(new ClienteError(400, "El XML de la revisión ya no es válido. Sube el CFDI de nuevo."));

		const productoId = data.getAll("productoId").map(String);
		const cantidad = data.getAll("cantidad").map(String);
		const costoUnitario = data.getAll("costoUnitario").map(String);
		const nombre = data.getAll("nombre").map(String);
		const claveProdServ = data.getAll("claveProdServ").map(String);
		const claveUnidad = data.getAll("claveUnidad").map(String);
		const unidad = data.getAll("unidad").map(String);
		const precioVenta = data.getAll("precioVenta").map(String);

		const disponibles = new Map((await productosEmparejables()).map((p) => [p.id, p]));

		try {
			const lineas: { productoId: string; cantidad: string; costoUnitario: string }[] = [];
			for (let i = 0; i < cantidad.length; i++) {
				if (!cantidad[i] || !costoUnitario[i]) continue;

				if (productoId[i]) {
					if (!disponibles.has(productoId[i])) {
						return fallo(new ClienteError(400, `El renglón ${i + 1} apunta a un producto que ya no se puede recibir.`));
					}
					lineas.push({ productoId: productoId[i], cantidad: cantidad[i], costoUnitario: costoUnitario[i] });
				} else {
					if (!nombre[i]) continue; // a blank row nobody filled in — skip, don't error the whole receipt
					const nuevo = await crearProducto({
						actor,
						body: {
							nombre: nombre[i],
							tipo: "refaccion",
							claveProdServ: claveProdServ[i],
							claveUnidad: claveUnidad[i],
							unidad: unidad[i],
							precioVenta: precioVenta[i],
							controlaInventario: true,
						},
					});
					lineas.push({ productoId: nuevo.id, cantidad: cantidad[i], costoUnitario: costoUnitario[i] });
				}
			}

			if (lineas.length === 0) return fallo(new ClienteError(400, "No quedó ningún renglón por recibir."));

			await registrarEntrada({
				actor,
				body: { proveedor: cfdi.emisorNombre, cfdiXml: xml, lineas },
			});
		} catch (err) {
			return fallo(err);
		}

		return { recibido: true as const };
	},
};
