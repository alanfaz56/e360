/**
 * Self-check for the inventory and quote vocabulary. Run: npm test
 *
 * Pure assertions, no DB and no server. These are the rules a bad edit would break silently:
 * quantity parsing, the two-axis quote state machine, and the SAT key formats that
 * `producto_clave_prodserv_check` enforces in the database.
 */
import assert from "node:assert/strict";
import {
	MOVIMIENTO_TIPO_KEYS,
	cantidad,
	estadoExistencia,
	isMovimientoTipo,
	solicitudEstadoLabel,
} from "../src/lib/inventario.js";
import {
	COTIZACION_INTERNO_KEYS,
	COTIZACION_INTERNO_TRANSICIONES,
	isCotizacionInterno,
	puedeTransicionarInterno,
	siguientesCliente,
	siguientesInternos,
} from "../src/lib/comercial.js";
import {
	CLAVES_PROD_SERV,
	CLAVES_UNIDAD,
	CLAVE_PROD_SERV_DEFAULT,
	esClaveProdServ,
	esClaveUnidad,
} from "../src/lib/sat-catalogos.js";
import { leerCfdi } from "../src/lib/cfdi.js";

let ok = 0;
const check = (nombre: string, fn: () => void) => {
	fn();
	ok++;
	console.log(`  ok  ${nombre}`);
};

console.log("Cantidades");

check("una cantidad se parsea de string, con hasta tres decimales", () => {
	assert.equal(cantidad("12"), 12);
	assert.equal(cantidad("0.75"), 0.75);
	assert.equal(cantidad("1,250.500"), 1250.5);
	assert.equal(cantidad(3.5), 3.5);
});

check("lo ambiguo se rechaza en vez de adivinarse", () => {
	// Same rule as `centavos()` for money: a value nobody can read unambiguously is not a quantity.
	assert.equal(cantidad("1.2345"), null, "cuatro decimales no caben en Decimal(12,3)");
	assert.equal(cantidad("abc"), null);
	assert.equal(cantidad(""), null);
	assert.equal(cantidad("-5"), null, "una cantidad negativa se expresa con el tipo de movimiento");
	assert.equal(cantidad(null), null);
	assert.equal(cantidad(Number.NaN), null);
});

console.log("Existencias");

check("agotado, bajo mínimo y disponible se distinguen", () => {
	assert.equal(estadoExistencia(0, 5).label, "Agotado");
	assert.equal(estadoExistencia(3, 5).label, "Bajo mínimo");
	assert.equal(estadoExistencia(5, 5).label, "Bajo mínimo", "en el mínimo YA hay que comprar");
	assert.equal(estadoExistencia(6, 5).label, "Disponible");
	assert.equal(estadoExistencia(1, null).label, "Disponible", "sin mínimo no hay alerta");
});

check("los tipos de movimiento son exactamente tres", () => {
	assert.deepEqual(MOVIMIENTO_TIPO_KEYS, ["entrada", "salida", "ajuste"]);
	assert.equal(isMovimientoTipo("venta"), false);
	assert.equal(solicitudEstadoLabel("rechazada"), "No disponible");
});

console.log("Estatus interno de la cotización");

check("es forward-only: no hay camino de regreso", () => {
	for (const desde of COTIZACION_INTERNO_KEYS) {
		for (const hasta of COTIZACION_INTERNO_TRANSICIONES[desde]) {
			assert.equal(
				puedeTransicionarInterno(hasta, desde),
				false,
				`${desde} → ${hasta} → ${desde} no debe ser posible`,
			);
		}
	}
});

check("«cobrada» no es destino de ninguna transición", () => {
	// It is reached by ARITHMETIC over the payments, exactly like `factura.pagada`. A path to it
	// here would become a button that lies about money.
	for (const desde of COTIZACION_INTERNO_KEYS) {
		assert.equal(
			(COTIZACION_INTERNO_TRANSICIONES[desde] as readonly string[]).includes("cobrada"),
			false,
			`${desde} no debe poder marcarse cobrada a mano`,
		);
	}
});

check("por_cobrar y cobrada son terminales para la mano humana", () => {
	assert.deepEqual(COTIZACION_INTERNO_TRANSICIONES.por_cobrar, []);
	assert.deepEqual(COTIZACION_INTERNO_TRANSICIONES.cobrada, []);
});

check("siguientesInternos tolera un estado desconocido", () => {
	assert.deepEqual(siguientesInternos("inventado"), []);
	assert.deepEqual([...siguientesInternos("completada")], ["por_cobrar"]);
	assert.equal(isCotizacionInterno("pendiente"), true);
});

check("el eje del cliente no ofrece salida de un estado final", () => {
	// The buttons on the note are rendered from this. If `autorizada` grew a way out, the counter
	// could quietly un-approve work the customer already agreed to pay for.
	assert.deepEqual([...siguientesCliente("borrador")], ["enviada", "rechazada"]);
	assert.deepEqual([...siguientesCliente("enviada")], ["autorizada", "rechazada", "vencida"]);
	for (const final of ["autorizada", "rechazada", "vencida"]) {
		assert.deepEqual([...siguientesCliente(final)], [], `${final} debe ser terminal`);
	}
	assert.deepEqual(siguientesCliente("inventado"), []);
});

console.log("Claves del SAT");

check("ClaveProdServ son 8 dígitos exactos", () => {
	// The database enforces the same with `producto_clave_prodserv_check`. Storing a description
	// here instead of the clave is the exact mistake that produced the VarChar overflow on clientes.
	assert.equal(esClaveProdServ("25172504"), true);
	assert.equal(esClaveProdServ("2517250"), false);
	assert.equal(esClaveProdServ("251725041"), false);
	assert.equal(esClaveProdServ("Balatas de freno"), false);
	assert.equal(esClaveProdServ(25172504), false, "debe ser string, como se guarda");
});

check("todas las claves del catálogo curado son válidas", () => {
	for (const c of CLAVES_PROD_SERV) {
		assert.ok(esClaveProdServ(c.clave), `${c.clave} no cumple el formato`);
	}
	for (const u of CLAVES_UNIDAD) {
		assert.ok(esClaveUnidad(u.clave), `${u.clave} no cumple el formato`);
	}
});

check("cada tipo de producto tiene una clave por omisión válida", () => {
	for (const [tipo, clave] of Object.entries(CLAVE_PROD_SERV_DEFAULT)) {
		assert.ok(esClaveProdServ(clave), `${tipo} tiene una clave por omisión inválida`);
	}
});

console.log("CFDI del proveedor");

const CFDI = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2026-08-01T10:30:00" Total="5800.00" SubTotal="5000.00" Moneda="MXN">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Refacciones del Norte SA de CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="Estacion 360"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="15101514" NoIdentificacion="ACE-5W30" Cantidad="10.000" ClaveUnidad="H87" Unidad="Pieza" Descripcion="Aceite 5W30" ValorUnitario="120.00" Importe="1200.00">
      <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="1200.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="192.00"/></cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
    <cfdi:Concepto ClaveProdServ="25172504" Cantidad="4.000" ClaveUnidad="H87" Unidad="Pieza" Descripcion="Filtro de aceite" ValorUnitario="50.00" Importe="200.00"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

check("se leen UUID, emisor, total y fecha", () => {
	const c = leerCfdi(CFDI);
	assert.ok(c);
	assert.equal(c.uuid, "A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D");
	assert.equal(c.emisorRfc, "AAA010101AAA");
	assert.equal(c.emisorNombre, "Refacciones del Norte SA de CV");
	assert.equal(c.total, 5800);
	assert.equal(c.fecha?.toISOString().slice(0, 10), "2026-08-01");
});

check("el Total sale del Comprobante, no del Receptor ni de otro atributo", () => {
	const c = leerCfdi(CFDI);
	assert.notEqual(c?.total, 5000, "no debe confundir SubTotal con Total");
});

check("un archivo que no es CFDI devuelve null en vez de reventar", () => {
	// A receipt with a bad or missing XML is still a receipt: the parse is a convenience, not a gate.
	assert.equal(leerCfdi("no soy xml"), null);
	assert.equal(leerCfdi("<html><body>hola</body></html>"), null);
	assert.equal(leerCfdi(""), null);
});

check("los conceptos del CFDI se leen para el asistente de compra", () => {
	const c = leerCfdi(CFDI);
	assert.ok(c);
	assert.equal(c.conceptos.length, 2);
	assert.equal(c.conceptos[0].noIdentificacion, "ACE-5W30");
	assert.equal(c.conceptos[0].cantidad, 10);
	assert.equal(c.conceptos[0].valorUnitario, 120);
	assert.equal(c.conceptos[0].descripcion, "Aceite 5W30");
	assert.equal(c.conceptos[1].noIdentificacion, null, "sin NoIdentificacion se lee como null, no revienta");
	assert.equal(c.conceptos[1].claveProdServ, "25172504");
});

check("sin bloque Conceptos, la lista sale vacía en vez de reventar", () => {
	const sinConceptos = CFDI.replace(/<cfdi:Conceptos>[\s\S]*<\/cfdi:Conceptos>/, "");
	assert.deepEqual(leerCfdi(sinConceptos)?.conceptos, []);
});

check("un CFDI sin timbre se lee igual, sólo sin UUID", () => {
	const sinTimbre = CFDI.replace(/<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/, "");
	const c = leerCfdi(sinTimbre);
	assert.ok(c);
	assert.equal(c.uuid, null);
	assert.equal(c.emisorRfc, "AAA010101AAA", "el resto se sigue leyendo");
});

console.log(`\n${ok} verificaciones OK`);
