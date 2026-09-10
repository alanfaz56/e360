import type { ServerLoad } from "@sveltejs/kit";
import { requirePermission } from "$lib/server/guard";
import { resumenUsoIA, porcentajeUsoGemini } from "$lib/server/ia";

/**
 * Usage visibility only — no billing, no dollar figures. `porcentajeGemini` is an optional
 * token-budget gauge (set via Ajustes → ia.gemini_limite_tokens); null hides it. Same shape as
 * /panel/auditoria otherwise.
 */
export const load: ServerLoad = async ({ locals }) => {
	requirePermission(locals, "ia:uso_read");
	const [{ porProveedor, recientes }, porcentajeGemini] = await Promise.all([resumenUsoIA(), porcentajeUsoGemini()]);

	return {
		porcentajeGemini,
		porProveedor: porProveedor.map((p) => ({
			proveedor: p.proveedor,
			llamadas: p._count._all,
			tokensEntrada: p._sum.tokensEntrada ?? 0,
			tokensSalida: p._sum.tokensSalida ?? 0,
		})),
		recientes: recientes.map((r) => ({
			id: r.id,
			proveedor: r.proveedor,
			modelo: r.modelo,
			notaFolio: r.nota?.folio ?? null,
			actorNombre: r.actor?.name ?? null,
			tokensEntrada: r.tokensEntrada,
			tokensSalida: r.tokensSalida,
			createdAt: r.createdAt.toISOString(),
		})),
	};
};
