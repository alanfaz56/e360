import type { RequestHandler } from "./$types";
import prisma from "$lib/prisma";
import { requirePermission } from "$lib/server/guard";

const INTERVALO_MS = 3000;
// Vercel's own function-duration ceiling forces every long-lived connection to end eventually —
// closing a bit early and letting the client's EventSource auto-reconnect is simpler than trying
// to outlast a limit this endpoint doesn't control.
const DURACION_MAXIMA_MS = 4 * 60_000;

/**
 * SSE stream for the chat panel: tells the client "something changed, go re-fetch" — never the
 * changed data itself. Serverless has no persistent process to push from, so this polls its own
 * open connection instead; the client's `invalidateAll()` on each event re-runs the page's normal
 * `load`, which already has the real authorization-scoped query. This endpoint only decides WHEN
 * to say "go look again", using one cheap MAX(ultimoMensajeAt) instead of the full conversation
 * list on every tick.
 */
export const GET: RequestHandler = ({ locals }) => {
	requirePermission(locals, "canal:chat");

	let cerrado = false;
	const stream = new ReadableStream({
		async start(controller) {
			const enviar = (dato: string) => controller.enqueue(new TextEncoder().encode(`data: ${dato}\n\n`));

			let visto = (await prisma.canal_conversacion.aggregate({ _max: { ultimoMensajeAt: true } }))._max
				.ultimoMensajeAt;

			const inicio = Date.now();
			while (!cerrado && Date.now() - inicio < DURACION_MAXIMA_MS) {
				await new Promise((r) => setTimeout(r, INTERVALO_MS));
				if (cerrado) break;

				const actual = (await prisma.canal_conversacion.aggregate({ _max: { ultimoMensajeAt: true } }))._max
					.ultimoMensajeAt;
				if (actual && actual.getTime() !== visto?.getTime()) {
					visto = actual;
					enviar("nuevo");
				}
			}
			controller.close();
		},
		cancel() {
			cerrado = true;
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
};
