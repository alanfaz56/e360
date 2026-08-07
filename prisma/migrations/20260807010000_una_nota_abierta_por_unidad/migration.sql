-- One open service note per vehicle, enforced by the database.
--
-- `crearNota` already refuses a second live note for the same truck, but it does so by READING
-- first and then writing: two requests arriving together — a double-tapped button on the shop's
-- wifi is the ordinary way this happens — both see "no open note" and both insert. The check was
-- correct and still lost the race.
--
-- Same discipline as `nota_transferencia_abierta_key`: the invariant that must not be violated
-- lives in an index, and the application check stays for the sake of a Spanish error message.
--
-- Partial, so history is unaffected: a unit can have any number of delivered or cancelled notes.
CREATE UNIQUE INDEX "nota_servicio_unidad_abierta_key"
    ON "nota_servicio" ("unidadId")
    WHERE "estado" NOT IN ('entregada', 'cancelada');
