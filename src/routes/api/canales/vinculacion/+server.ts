import { error, json, type RequestHandler } from "@sveltejs/kit";
import { generarVinculacion } from "$lib/server/canales/identidad";
import { requireUser } from "$lib/server/guard";

/**
 * POST /api/canales/vinculacion — body `{ canal: "whatsapp" | "telegram" }`.
 *
 * Self-service: any signed-in user can link THEIR OWN account to a channel they personally
 * control. No permission beyond being logged in — the code only becomes useful once redeemed
 * from inside that chat (see `redimirVinculacion`), which is the actual proof of control.
 * The code is returned once, plaintext, and never stored — same as an invitation token.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const actor = requireUser(locals);
	const body = (await request.json().catch(() => null)) ?? {};

	if (body.canal !== "whatsapp" && body.canal !== "telegram") {
		error(400, 'Falta "canal": "whatsapp" o "telegram"');
	}

	const { codigo, expiraMinutos } = await generarVinculacion(actor, body.canal);
	return json({ codigo, expiraMinutos, instrucciones: `Manda "/vincular ${codigo}" al bot de ${body.canal}.` });
};
