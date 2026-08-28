import { createPrisma } from "../src/lib/server/bootstrap.js";
const p = createPrisma(process.env.DATABASE_URL);
const cot = await p.cotizacion.findFirst({
	where: { folio: 9 },
	select: {
		id: true, folio: true, total: true,
		conceptos: {
			select: {
				descripcion: true, precioUnitario: true, costoUnitario: true, cantidad: true,
				productoId: true, entradaId: true,
				producto: { select: { nombre: true, precioVenta: true, tipo: true } },
			},
		},
	},
});
console.log(JSON.stringify(cot, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
await p.$disconnect();
