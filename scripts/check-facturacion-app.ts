/**
 * Self-check for the app subscription cycle status. Run: npm test
 *
 * Pure — no DB. The rules here decide whether the whole panel gets blocked, so a boundary bug
 * (day 10 vs day 9, an extension that leaks into next month) has real consequences either way:
 * lock somebody out who paid, or leave the block dead for a month it was supposed to bite.
 */
import assert from "node:assert/strict";
import { estadoCiclo, inicioDeMes, vencimientoEfectivo } from "../src/lib/facturacion-app-ciclo.js";

const dia = (n: number) => new Date(Date.UTC(2026, 8, n)); // September 2026
const quince = new Date(Date.UTC(2026, 8, 15));

// --- Before the warning window, unpaid: still fine -------------------------------------------
assert.equal(estadoCiclo(dia(1), null, quince), "al_corriente");
assert.equal(estadoCiclo(dia(9), null, quince), "al_corriente", "day before the window opens");

// --- Warning window: días 10-15 inclusive, unpaid ---------------------------------------------
assert.equal(estadoCiclo(dia(10), null, quince), "por_vencer", "window opens exactly on day 10");
assert.equal(estadoCiclo(dia(12), null, quince), "por_vencer");
assert.equal(estadoCiclo(dia(15), null, quince), "por_vencer", "due date itself still warns, not blocks");

// --- Past due, unpaid: blocked ------------------------------------------------------------------
assert.equal(estadoCiclo(dia(16), null, quince), "bloqueado", "day after due date");
assert.equal(estadoCiclo(dia(28), null, quince), "bloqueado");

// --- Paid this month, any day: always fine ------------------------------------------------------
const cicloSeptiembre = inicioDeMes(dia(1));
assert.equal(estadoCiclo(dia(1), cicloSeptiembre, quince), "al_corriente");
assert.equal(estadoCiclo(dia(28), cicloSeptiembre, quince), "al_corriente", "paid covers the whole month regardless of day");

// --- Paid LAST month only: does not carry over ---------------------------------------------------
const cicloAgosto = inicioDeMes(new Date(Date.UTC(2026, 7, 1)));
assert.equal(estadoCiclo(dia(20), cicloAgosto, quince), "bloqueado", "an old payment never satisfies the current month");

// --- inicioDeMes normalizes across a year boundary ------------------------------------------------
assert.deepEqual(inicioDeMes(new Date(Date.UTC(2026, 11, 31))), new Date(Date.UTC(2026, 11, 1)), "Dec 31 -> Dec 1, not Jan 1");

// --- vencimientoEfectivo: extension within the current month wins --------------------------------
const veinte = new Date(Date.UTC(2026, 8, 20));
assert.deepEqual(vencimientoEfectivo(dia(1), "2026-09-20"), veinte);
assert.equal(estadoCiclo(dia(16), null, vencimientoEfectivo(dia(16), "2026-09-20")), "por_vencer", "extended past the 15th, still within the new window");
assert.equal(estadoCiclo(dia(21), null, vencimientoEfectivo(dia(21), "2026-09-20")), "bloqueado", "past the extended date too");

// --- vencimientoEfectivo: extension from a DIFFERENT month is ignored ----------------------------
assert.deepEqual(vencimientoEfectivo(dia(1), "2026-08-20"), quince, "stale extension from last month");
assert.deepEqual(vencimientoEfectivo(dia(1), "2026-10-05"), quince, "extension set ahead of time for next month");

// --- vencimientoEfectivo: empty/invalid text falls back to the 15th ------------------------------
assert.deepEqual(vencimientoEfectivo(dia(1), null), quince);
assert.deepEqual(vencimientoEfectivo(dia(1), ""), quince);
assert.deepEqual(vencimientoEfectivo(dia(1), "no es una fecha"), quince);

// --- The warning window always starts exactly 5 days before the EFFECTIVE due date ---------------
assert.equal(estadoCiclo(dia(14), null, veinte), "al_corriente", "still 6 days out from the extended date");
assert.equal(estadoCiclo(dia(15), null, veinte), "por_vencer", "exactly 5 days out from the extended date");

console.log("check-facturacion-app: OK");
