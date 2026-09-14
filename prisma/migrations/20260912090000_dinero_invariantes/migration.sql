-- Invariantes de dinero que hasta ahora sólo vivían en código.
--
-- 1) Una cotización se cobra UNA vez. `crearFactura` y `crearNotaVenta` ya lo comprueban, pero la
--    lectura ocurre fuera de la transacción: dos llamadas simultáneas pasan las dos y dejan la
--    cotización cobrada por duplicado. Un índice único parcial lo cierra para todo camino, incluido
--    cualquier script o importación futura. Parcial porque un documento cancelado sí puede repetirse:
--    cancelar y volver a facturar es un flujo válido.
CREATE UNIQUE INDEX "factura_cotizacion_unica_activa"
    ON "factura" ("cotizacionId")
    WHERE "cotizacionId" IS NOT NULL AND "estado" <> 'cancelada';

CREATE UNIQUE INDEX "nota_venta_cotizacion_unica_activa"
    ON "nota_venta" ("cotizacionId")
    WHERE "cotizacionId" IS NOT NULL AND "estado" <> 'cancelada';

-- 2) `nota_venta` y `cotizacion_interna` eran las únicas tablas de dinero sin CHECK de montos, y
--    las dos alimentan la utilidad. Sus hermanas (`cotizacion`, `factura`, `cotizacion_concepto`,
--    `pago`) ya los tienen desde la migración inicial.
ALTER TABLE "nota_venta" ADD CONSTRAINT "nota_venta_total_check"
    CHECK ("total" >= 0);

ALTER TABLE "nota_venta_concepto" ADD CONSTRAINT "nota_venta_concepto_montos_check"
    CHECK ("cantidad" > 0 AND "precioUnitario" >= 0 AND "importe" >= 0);

ALTER TABLE "cotizacion_interna" ADD CONSTRAINT "cotizacion_interna_total_check"
    CHECK ("total" >= 0);

ALTER TABLE "cotizacion_interna_concepto" ADD CONSTRAINT "cotizacion_interna_concepto_montos_check"
    CHECK ("cantidad" > 0 AND "costoUnitario" >= 0 AND "importe" >= 0);
