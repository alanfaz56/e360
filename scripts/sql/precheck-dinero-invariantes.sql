-- Ejecutar ANTES de migrate deploy. Si alguna consulta devuelve filas, el índice único fallará
-- y hay que resolver el duplicado primero.
SELECT 'factura duplicada' AS problema, "cotizacionId", count(*)
  FROM "factura"
 WHERE "cotizacionId" IS NOT NULL AND "estado" <> 'cancelada'
 GROUP BY "cotizacionId" HAVING count(*) > 1;

SELECT 'nota_venta duplicada' AS problema, "cotizacionId", count(*)
  FROM "nota_venta"
 WHERE "cotizacionId" IS NOT NULL AND "estado" <> 'cancelada'
 GROUP BY "cotizacionId" HAVING count(*) > 1;

SELECT 'monto negativo' AS problema, 'nota_venta' AS tabla, count(*) FROM "nota_venta" WHERE "total" < 0
UNION ALL SELECT 'monto negativo', 'nota_venta_concepto', count(*) FROM "nota_venta_concepto"
  WHERE "cantidad" <= 0 OR "precioUnitario" < 0 OR "importe" < 0
UNION ALL SELECT 'monto negativo', 'cotizacion_interna', count(*) FROM "cotizacion_interna" WHERE "total" < 0
UNION ALL SELECT 'monto negativo', 'cotizacion_interna_concepto', count(*) FROM "cotizacion_interna_concepto"
  WHERE "cantidad" <= 0 OR "costoUnitario" < 0 OR "importe" < 0;
