/**
 * Self-check for the CFDI arithmetic, the cancellation rules and the settings catalogue.
 * Run: npm test
 *
 * Pure — no DB, no PAC, no network. What is pinned here is what the SAT rejects a document for:
 * a peso that does not add up, a cancellation missing its replacement, a clave that is a label.
 */
import assert from "node:assert/strict";
import {
	MOTIVO_CANCELACION_KEYS,
	armarConceptos,
	distribuirIva,
	esEntorno,
	esMotivoCancelacion,
	esUuid,
	formaPagoClave,
	metodoPagoClave,
	requiereSustituto,
	FORMAS_PAGO,
	METODOS_PAGO,
	entornoLabel,
	estatusCancelacionLabel,
	esEstatusCancelacion,
} from "../src/lib/facturacion.js";
import {
	AJUSTES,
	AJUSTE_KEYS,
	esClaveDeAjuste,
	esDuenoDelSistema,
	esSecreto,
	pistaDeSecreto,
	valorPorDefecto,
	GRUPO_KEYS,
} from "../src/lib/ajustes.js";
import { cifrar, descifrar, estaCifrado, generarLlave, igualSeguro, leerLlave } from "../src/lib/server/cifrado.js";

let ok = 0;
const prueba = (nombre: string, fn: () => void) => {
	fn();
	ok++;
	console.log(`  ok  ${nombre}`);
};

// --- El IVA por renglón tiene que sumar EXACTAMENTE el IVA de la factura -----------------------
// The shop computes IVA once on the rounded subtotal; a CFDI carries it per line. Rounding line by
// line does not reliably add back up, and the SAT rejects a document whose parts disagree with its
// own total. This is the single most likely way a real invoice gets bounced.
prueba("el IVA repartido siempre suma el total", () => {
	const casos: [bigint[], bigint][] = [
		// Three lines of 33.33: each rounds to 5.33 (15.99), the invoice says 16.00.
		[[3333n, 3333n, 3333n], 1600n],
		[[10000n], 1600n],
		[[], 0n],
		[[1n, 1n, 1n], 0n],
		// A big line beside crumbs: the correction must land on the big one.
		[[800000n, 1200n, 350n], 128248n],
		[[500n, 500n], 160n],
		[[99999n, 1n], 16000n],
	];
	for (const [importes, ivaTotal] of casos) {
		const partes = distribuirIva(importes, ivaTotal);
		assert.equal(partes.length, importes.length, "un renglón sin su IVA es un CFDI incompleto");
		assert.equal(
			partes.reduce((a, b) => a + b, 0n),
			ivaTotal,
			`las partes de ${importes} no suman ${ivaTotal}`,
		);
		for (const p of partes) assert.ok(p >= 0n, "el IVA de un renglón nunca es negativo");
	}
});

prueba("el ajuste cae en el renglón más grande, no en el primero", () => {
	// 12.00 + 8000.00: the cent has to move the 8000 line, where nobody notices it.
	const partes = distribuirIva([1200n, 800000n], 128200n);
	assert.equal(partes[0], 192n, "el renglón chico conserva su IVA exacto");
	assert.equal(partes[0] + partes[1], 128200n);
	assert.ok(partes[1] > partes[0]);
});

prueba("una factura sin renglones no inventa impuestos", () => {
	assert.deepEqual(distribuirIva([], 1600n), []);
});

// --- Renglones de cotización → conceptos de CFDI -----------------------------------------------
prueba("los conceptos conservan sus claves y cuadran con la factura", () => {
	// A quote with one part and 1.5 hours of labour: 1200.00 + 900.00 = 2100.00, IVA 336.00.
	const filas = [
		{
			tipo: "refaccion",
			descripcion: "Balatas delanteras",
			cantidad: "2",
			precioUnitario: "600.00",
			importe: "1200.00",
			claveProdServ: "25174800",
			claveUnidad: "H87",
			productoId: "prod-1",
		},
		{
			tipo: "mano_obra",
			descripcion: "Cambio de balatas",
			cantidad: "1.5",
			precioUnitario: "600.00",
			importe: "900.00",
			claveProdServ: null,
			claveUnidad: null,
			productoId: null,
		},
	];

	const conceptos = armarConceptos(filas, 33600n);
	assert.equal(conceptos.length, 2);

	// The line's OWN clave, copied when it was quoted, survives untouched.
	assert.equal(conceptos[0].claveProdServ, "25174800");
	assert.equal(conceptos[0].claveUnidad, "H87");
	assert.equal(conceptos[0].noIdentificacion, "prod-1");

	// A line with no clave falls back by tipo — labour is a service, not a piece. Sending nothing
	// would simply be rejected.
	assert.equal(conceptos[1].claveUnidad, "E48");
	assert.ok(/^\d{8}$/.test(conceptos[1].claveProdServ), "el respaldo también es una clave de 8 dígitos");
	assert.equal(conceptos[1].noIdentificacion, null);

	// Fractional quantities are real: 1.5 hours of labour.
	assert.equal(conceptos[1].cantidad, 1.5);
	assert.equal(conceptos[0].valorUnitario, 60000n);

	// The two things the SAT actually checks.
	assert.equal(
		conceptos.reduce((s, c) => s + c.importe, 0n),
		210000n,
		"los renglones tienen que sumar el subtotal",
	);
	assert.equal(
		conceptos.reduce((s, c) => s + c.iva, 0n),
		33600n,
		"los impuestos por renglón tienen que sumar el IVA de la factura",
	);
	// Every line carries a unit label — an empty `Unidad` is a rejected CFDI.
	for (const c of conceptos) assert.ok(c.unidad.trim(), "un concepto sin unidad no se timbra");
});

// --- Claves, nunca etiquetas -------------------------------------------------------------------
// The same mistake that produced the original `value too long for the column's type` bug: a
// picker's label written into a column that holds a SAT clave.
prueba("las formas de pago son claves del SAT de dos dígitos", () => {
	for (const [interno, def] of Object.entries(FORMAS_PAGO)) {
		assert.match(def.clave, /^\d{2}$/, `${interno} no es una clave`);
		assert.equal(formaPagoClave(interno), def.clave);
	}
	// Unknown, null and "not paid yet" all mean "por definir" — never a default of cash.
	assert.equal(formaPagoClave(null), "99");
	assert.equal(formaPagoClave(undefined), "99");
	assert.equal(formaPagoClave("bitcoin"), "99");
	assert.equal(formaPagoClave("Efectivo"), "99", "la etiqueta no es la clave interna");
});

prueba("crédito es PPD y contado es PUE", () => {
	assert.equal(metodoPagoClave("credito"), "PPD");
	assert.equal(metodoPagoClave("contado"), "PUE");
	// Anything unrecognised bills as paid-in-one, which is the safe direction: PPD obliges the shop
	// to issue a complemento for every payment, and claiming that wrongly is worse than not.
	assert.equal(metodoPagoClave("inventado"), "PUE");
	assert.equal(METODOS_PAGO.credito.clave, "PPD");
});

// --- Cancelación --------------------------------------------------------------------------------
prueba("sólo el motivo 01 lleva factura sustituta", () => {
	assert.deepEqual([...MOTIVO_CANCELACION_KEYS], ["01", "02", "03", "04"]);
	assert.equal(requiereSustituto("01"), true);
	for (const m of ["02", "03", "04"]) assert.equal(requiereSustituto(m), false, `${m} no sustituye`);
	assert.equal(requiereSustituto("99"), false);
	assert.equal(esMotivoCancelacion("01"), true);
	assert.equal(esMotivoCancelacion("1"), false, "el SAT los escribe con dos dígitos");
	assert.equal(esMotivoCancelacion(1), false);
});

prueba("un UUID se valida antes de mandarlo, no después de que lo rechacen", () => {
	assert.equal(esUuid("3336cbb9-ebd4-45e8-b60b-e7bfa6f6b5e0"), true);
	assert.equal(esUuid("3336CBB9-EBD4-45E8-B60B-E7BFA6F6B5E0"), true);
	assert.equal(esUuid("3336cbb9ebd445e8b60be7bfa6f6b5e0"), false, "sin guiones no es un folio fiscal");
	assert.equal(esUuid("3336cbb9-ebd4-45e8-b60b"), false);
	assert.equal(esUuid(""), false);
	assert.equal(esUuid(null), false);
});

prueba("los estatus de cancelación son tres y en_proceso NO es cancelada", () => {
	assert.equal(esEstatusCancelacion("en_proceso"), true);
	assert.equal(esEstatusCancelacion("cancelada"), true);
	assert.equal(esEstatusCancelacion("rechazada"), true);
	assert.equal(esEstatusCancelacion("aceptada"), false);
	// A cancellation the SAT is still holding leaves the document LIVE. The label has to say so,
	// because that is the difference between re-invoicing and double-invoicing.
	assert.match(estatusCancelacionLabel("en_proceso"), /proceso/i);
	assert.equal(estatusCancelacionLabel(null), "Sin solicitar");
});

prueba("sólo hay dos entornos y producción se llama producción", () => {
	assert.equal(esEntorno("sandbox"), true);
	assert.equal(esEntorno("produccion"), true);
	assert.equal(esEntorno("production"), false);
	assert.equal(esEntorno("dev"), false);
	assert.equal(entornoLabel("produccion"), "Producción");
	assert.equal(entornoLabel("sandbox"), "Sandbox");
});

// --- El catálogo de ajustes ---------------------------------------------------------------------
prueba("toda clave de ajuste pertenece a un grupo declarado", () => {
	assert.ok(AJUSTE_KEYS.length > 0);
	for (const clave of AJUSTE_KEYS) {
		const def = AJUSTES[clave];
		assert.ok(GRUPO_KEYS.includes(def.grupo), `${clave} apunta a un grupo que no existe`);
		assert.ok(def.label.trim(), `${clave} sin etiqueta`);
		assert.ok(def.descripcion.trim(), `${clave} sin descripción`);
		// The screen groups by the key's prefix, so a key that disagrees with its group lands in
		// the wrong section and reads as a different setting.
		assert.ok(clave.startsWith(`${def.grupo}.`), `${clave} no empieza con su grupo`);
	}
});

prueba("una clave que no está en el catálogo no es un ajuste", () => {
	assert.equal(esClaveDeAjuste("facturacion.apiKey"), true);
	assert.equal(esClaveDeAjuste("facturacion.loQueSea"), false);
	assert.equal(esClaveDeAjuste("__proto__"), false, "deny by default incluye lo raro");
	assert.equal(esClaveDeAjuste(""), false);
	assert.equal(esClaveDeAjuste(null), false);
});

prueba("las credenciales están marcadas como secretas", () => {
	assert.equal(esSecreto("facturacion.apiKey"), true);
	assert.equal(esSecreto("facturacion.secretKey"), true);
	// The environment is not a secret: hiding it would make the most consequential setting on the
	// screen impossible to read back.
	assert.equal(esSecreto("facturacion.entorno"), false);
	assert.equal(esSecreto("facturacion.serie"), false);
	assert.equal(esSecreto("inventado"), false);
});

prueba("una opción arranca en su primera opción", () => {
	assert.equal(valorPorDefecto("facturacion.entorno"), "sandbox", "nunca producción por omisión");
	assert.equal(valorPorDefecto("facturacion.apiKey"), "");
});

prueba("la pista de un secreto no es el secreto", () => {
	assert.equal(pistaDeSecreto("abcdef0123456789"), "••••6789");
	// Four of six characters is not a hint, it is the key.
	assert.equal(pistaDeSecreto("corta"), "••••••••");
	assert.equal(pistaDeSecreto(""), "");
	assert.ok(!pistaDeSecreto("abcdef0123456789").includes("abcdef"));
});

// --- Quién es dueño del sistema -----------------------------------------------------------------
prueba("una lista vacía de dueños niega a todos", () => {
	// The failure that matters: a misconfigured deployment must not open the credentials screen to
	// every Admin. "No list" means nobody, never "no restriction".
	assert.equal(esDuenoDelSistema("alan@maieutica.mx", ""), false);
	assert.equal(esDuenoDelSistema("alan@maieutica.mx", null), false);
	assert.equal(esDuenoDelSistema("alan@maieutica.mx", undefined), false);
	assert.equal(esDuenoDelSistema("alan@maieutica.mx", "   "), false);
});

prueba("la lista de dueños ignora mayúsculas y espacios", () => {
	const lista = " alan@maieutica.mx , otro@ejemplo.mx ";
	assert.equal(esDuenoDelSistema("alan@maieutica.mx", lista), true);
	assert.equal(esDuenoDelSistema("ALAN@Maieutica.MX", lista), true);
	assert.equal(esDuenoDelSistema("  alan@maieutica.mx  ", lista), true);
	assert.equal(esDuenoDelSistema("otro@ejemplo.mx", lista), true);
	assert.equal(esDuenoDelSistema("gerente@estacion360.test", lista), false);
	assert.equal(esDuenoDelSistema(null, lista), false);
	// Not a prefix match: a lookalike address must not slip in.
	assert.equal(esDuenoDelSistema("alan@maieutica.mx.evil.com", lista), false);
	assert.equal(esDuenoDelSistema("xalan@maieutica.mx", lista), false);
});

// --- Cifrado ------------------------------------------------------------------------------------
prueba("lo cifrado vuelve igual, y sólo con su llave", () => {
	const llave = leerLlave(generarLlave());
	const secreto = "F-Api-Key-de-prueba-0123456789";

	const guardado = cifrar(secreto, llave);
	assert.ok(estaCifrado(guardado));
	assert.ok(!guardado.includes(secreto), "el texto claro no puede aparecer en lo guardado");
	assert.equal(descifrar(guardado, llave), secreto);

	// A rotated key must FAIL, not return garbage — GCM authenticates, which is why it is GCM.
	const otra = leerLlave(generarLlave());
	assert.throws(() => descifrar(guardado, otra));
});

prueba("dos cifrados del mismo texto son distintos", () => {
	// A fresh IV every time. Reusing one under the same key breaks GCM outright, and identical
	// ciphertexts would also leak that two settings hold the same value.
	const llave = leerLlave(generarLlave());
	assert.notEqual(cifrar("mismo", llave), cifrar("mismo", llave));
});

prueba("un ciphertext alterado no descifra", () => {
	const llave = leerLlave(generarLlave());
	const guardado = cifrar("no me toques", llave);
	const bruto = Buffer.from(guardado.slice(3), "base64");
	bruto[bruto.length - 1] ^= 0xff;
	assert.throws(() => descifrar(`v1:${bruto.toString("base64")}`, llave));
});

prueba("una llave del tamaño equivocado se rechaza en vez de estirarse", () => {
	assert.throws(() => leerLlave(""), /no está definida/);
	assert.throws(() => leerLlave(undefined), /no está definida/);
	assert.throws(() => leerLlave("corta"), /32 bytes/);
	assert.throws(() => leerLlave("a".repeat(63)), /32 bytes/);
	// 64 hex chars and 32 raw bytes are both fine.
	assert.equal(leerLlave("ab".repeat(32)).length, 32);
	assert.equal(leerLlave(Buffer.alloc(32, 7).toString("base64")).length, 32);
});

prueba("un valor en claro nunca se confunde con uno cifrado", () => {
	assert.equal(estaCifrado("sandbox"), false);
	assert.equal(estaCifrado(""), false);
	assert.equal(estaCifrado(null), false);
	assert.throws(() => descifrar("sandbox", leerLlave(generarLlave())), /formato desconocido/);
});

prueba("la comparación segura compara de verdad", () => {
	assert.equal(igualSeguro("abc", "abc"), true);
	assert.equal(igualSeguro("abc", "abd"), false);
	assert.equal(igualSeguro("abc", "ab"), false, "distinto largo no revienta");
	assert.equal(igualSeguro("", ""), true);
});

console.log(`\n${ok} verificaciones OK`);
