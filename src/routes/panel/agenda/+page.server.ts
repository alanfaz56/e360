import { type Actions, type ServerLoad } from "@sveltejs/kit";
import { hoy, isVista, parseFecha, pasoDeVista } from "$lib/agenda";
import { can } from "$lib/roles";
import { agenda, crearCita, resumenAgenda } from "$lib/server/citas";
import { listClientes } from "$lib/server/clientes";
import { listUnidades, getUnidad } from "$lib/server/unidades";
import { requirePermission, requireUser } from "$lib/server/guard";
import { listUsers } from "$lib/server/users";
import { fallo } from "$lib/server/errores";
import { marcarRecordatorio, recordatoriosEnRango } from "$lib/server/recordatorios";

/**
 * /panel/agenda is the calendar — only the calendar.
 *
 * It used to share a screen with the KPI dashboard, which meant the thing you open twenty times a
 * day was always below a wall of numbers. Home is the numbers, this is the week.
 */
export const load: ServerLoad = async ({ locals, url }) => {
	const actor = requireUser(locals);
	requirePermission(locals, "cita:read");

	const vistaParam = url.searchParams.get("vista");
	const vista = isVista(vistaParam) ? vistaParam : "semana";
	const fecha = parseFecha(url.searchParams.get("fecha")) ?? hoy();
	// Resolved from the session, never from the URL — "mine" has to mean the caller.
	const mias = url.searchParams.get("mias") === "1";

	const [datos, resumen] = await Promise.all([agenda(vista, fecha, mias ? actor.id : null), resumenAgenda()]);

	// Manual follow-ups, in the same grid: most of the time one turns into a cita, so seeing it
	// next to the week it is due is the point. Gated on the same permission that owns them — a
	// role with no reminders screen never sees a stray "Recordar" strip either.
	const puedeVerRecordatorios = can(actor.role, "recordatorio:manage");
	const recordatorios = puedeVerRecordatorios ? await recordatoriosEnRango(datos.desde, datos.hasta) : [];
	const dias = datos.dias.map((d) => ({ ...d, recordatorios: recordatorios.filter((r) => r.fecha === d.fecha) }));

	// Only fetched when the actor could actually assign somebody — one less query, and the
	// picker is never populated for a role the server would refuse anyway.
	const asignables = can(actor.role, "cita:assign")
		? (await listUsers()).filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, roleLabel: u.roleLabel }))
		: [];

	// For the "Nueva cita" drawer. A counter booking is born confirmada, so it needs a real
	// customer and vehicle — the picker defaults to searching the registry rather than typing a
	// duplicate. Both lists are the no-JS fallback; with JS the pickers search the API instead.
	const puedeCrear = can(actor.role, "cita:create");
	const clientes = puedeCrear
		? (await listClientes({ perPage: 100 })).clientes.map((c) => ({
				id: c.id,
				nombreCompleto: c.nombreCompleto,
				tipoLabel: c.tipoLabel,
			}))
		: [];
	const unidades = puedeCrear
		? (await listUnidades({ perPage: 100 })).unidades.map((u) => ({
				id: u.id,
				etiqueta: u.etiqueta,
				numeroEconomico: u.numeroEconomico,
				vin: u.vin,
				anio: u.anio,
				color: u.color,
				clienteNombre: u.clienteNombre,
				archivado: u.archivado,
			}))
		: [];

	// "Convertir en cita": the reminders screen links here with the unit already chosen, so the
	// picker opens on that vehicle instead of an empty search.
	const prefillUnidadId = puedeCrear ? url.searchParams.get("unidadId") : null;
	const prefillUnidad = prefillUnidadId ? await getUnidad(prefillUnidadId).catch(() => null) : null;

	return {
		...datos,
		dias,
		resumen,
		asignables,
		// Navigation, precomputed so the template stays markup. The week is a rolling seven days
		// from the anchor, so stepping moves the whole window.
		// Each view steps by its own span, so "next" always means the next screenful. A month view
		// stepped by 7 days would show the same month four times before moving on.
		anterior: pasoDeVista(vista, fecha, -1),
		siguiente: pasoDeVista(vista, fecha, 1),
		hoy: hoy(),
		mias,
		clientes,
		unidades,
		prefillCita: {
			unidadId: prefillUnidad?.id ?? "",
			unidadEtiqueta: prefillUnidad
				? [`${prefillUnidad.marca} ${prefillUnidad.modelo}`, prefillUnidad.placas].filter(Boolean).join(" · ")
				: "",
			clienteId: prefillUnidad?.clienteId ?? "",
			clienteNombre: prefillUnidad?.cliente?.nombreCompleto ?? "",
			motivo: url.searchParams.get("motivo") ?? "",
			recordatorioId: url.searchParams.get("recordatorioId") ?? "",
		},
		puede: {
			crear: puedeCrear,
			asignar: can(actor.role, "cita:assign"),
		},
	};
};

export const actions: Actions = {
	/** Book at the counter. Same shared function the API route calls (Rule 4). */
	crear: async ({ locals, request }) => {
		const actor = requireUser(locals);
		const body = Object.fromEntries(await request.formData()) as Record<string, unknown>;

		try {
			await crearCita({ actor, body });
		} catch (err) {
			return fallo(err, { valores: body });
		}

		// "Convertir en cita": the reminder did its job, so it is marked done. Best-effort — the
		// cita is already booked by this point, and a stale or already-handled recordatorioId must
		// never turn a successful booking into a reported failure.
		const recordatorioId = String(body.recordatorioId ?? "");
		if (recordatorioId) {
			await marcarRecordatorio({ actor, id: recordatorioId, hecho: true }).catch(() => {});
		}

		return { creada: true };
	},
};
