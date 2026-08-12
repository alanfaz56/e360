import type { ServerLoad } from "@sveltejs/kit";
import { obtenerEmpresa } from "$lib/server/empresa";

/**
 * Estación 360's own contact info, available to every route (public pages AND `/panel`) with no
 * auth — it's what the public site links `tel:`/WhatsApp to. One tiny query per request beats
 * duplicating the fetch across every page that needs a phone number.
 */
export const load: ServerLoad = async () => {
	return { empresa: await obtenerEmpresa() };
};
