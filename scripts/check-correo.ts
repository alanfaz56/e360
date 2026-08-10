/**
 * Self-check for the pure parts of transactional email. Run: npm test
 *
 * Same scope as check-push.ts: only the dependency-free pieces are pinned here. The actual
 * sending (`enviarCorreoCliente` et al, in src/lib/server/correo/index.ts) touches Prisma and
 * `$env/dynamic/private`, which this offline harness cannot load — same reason `push.ts`'s own
 * send path isn't unit-tested here either, only `webpush.ts`'s pure crypto is.
 */
import assert from "node:assert/strict";
import { NOTIFICACION_EVENTOS, NOTIFICACION_EVENTO_KEYS } from "../src/lib/notificaciones.js";
import { avisoCliente, invitacion, restablecerPassword } from "../src/lib/server/correo/plantillas.js";

let ok = 0;
const check = (nombre: string, fn: () => void) => {
	fn();
	ok++;
	console.log(`  ok  ${nombre}`);
};

// --- El catálogo: correoCliente sólo en eventos cliente_* -------------------------------------

const CORREO_CLIENTE_ESPERADOS = [
	"cliente_cotizacion",
	"cliente_unidad_lista",
	"cliente_unidad_entregada",
	"cliente_factura",
] as const;

check("correoCliente está marcado exactamente en los 4 eventos curados", () => {
	const marcados = NOTIFICACION_EVENTO_KEYS.filter(
		(k) => (NOTIFICACION_EVENTOS as Record<string, { correoCliente?: boolean }>)[k]?.correoCliente,
	);
	assert.deepEqual([...marcados].sort(), [...CORREO_CLIENTE_ESPERADOS].sort());
});

check("correoCliente nunca aparece en un evento de audiencia empleado", () => {
	for (const k of NOTIFICACION_EVENTO_KEYS) {
		const def = NOTIFICACION_EVENTOS[k] as { audiencia: string; correoCliente?: boolean };
		if (def.correoCliente) assert.equal(def.audiencia, "cliente", `${k} manda correo pero no es de cliente`);
	}
});

// --- Plantillas: nunca truenan, siempre traen asunto/html/texto -------------------------------

check("avisoCliente con url arma un botón con esa url exacta", () => {
	const r = avisoCliente({ titulo: "Su unidad está lista", cuerpo: "Ya se puede pasar por ella.", url: "https://x.test/seguimiento/abc" });
	assert.equal(r.asunto, "Su unidad está lista");
	assert.match(r.html, /https:\/\/x\.test\/seguimiento\/abc/);
	assert.match(r.texto, /https:\/\/x\.test\/seguimiento\/abc/);
});

check("avisoCliente sin url no revienta y no imprime 'null'", () => {
	const r = avisoCliente({ titulo: "Aviso", cuerpo: "Cuerpo", url: null });
	assert.doesNotMatch(r.html, /null/);
	assert.doesNotMatch(r.texto, /null/);
});

check("invitacion trae el link y el rol en el cuerpo", () => {
	const r = invitacion({ invitadorNombre: "Alan", rolLabel: "Operador", url: "https://x.test/invitacion/tok" });
	assert.match(r.html, /https:\/\/x\.test\/invitacion\/tok/);
	assert.match(r.texto, /Operador/);
});

check("restablecerPassword trae el link", () => {
	const r = restablecerPassword({ nombre: "Alan", url: "https://x.test/reset/tok" });
	assert.match(r.html, /https:\/\/x\.test\/reset\/tok/);
	assert.match(r.texto, /https:\/\/x\.test\/reset\/tok/);
});

console.log(`\n${ok} verificaciones OK`);
