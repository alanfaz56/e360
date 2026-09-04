# WhatsApp customer flows — implementation plan

Build order (per user): **0 (phone verify) → 5 (feedback) → 4 (quote authorize) → 3 (reminder) → 1 (status check)**.
Flow 0 ships first because 1/3/4 all need to resolve *which cliente* a conversation belongs to.

Existing WhatsApp integration (`src/lib/server/canales/whatsapp.ts`, `src/routes/api/whatsapp/webhook/+server.ts`, booking flow) is untouched scaffolding to build on — not touched structurally, only extended at the one insertion point below.

## Decided (confirmed with user, do not re-litigate)

- **Verification model**: code-confirm, not auto-match-by-phone. Shop already has the customer's number on file (`cliente.telefono` / `cliente_contacto.telefono` / `cliente_telefono`); bot sends a one-time code to that number via WhatsApp send, customer replies with it to link `canal_conversacion.clienteId` + `canal_identidad.clienteId`. Mirrors `identidad.ts`'s employee-linking shape but is a **new parallel module** — `identidad.ts` is hardcoded to `user`, not reusable as-is.
- **Quote authorize/reject over WhatsApp (flow 4) is a system/anonymous action**, not a new permission. Same class as `solicitarCitaPorCanal` — no `user` role involved. Security boundary is flow-0 phone verification + the existing `autorizador` contact-role check already inside `cambiarEstadoCotizacion` (comercial.ts:622-724) — that check is NOT bypassed; the WhatsApp path still must resolve/pass a `contactoId` the same way, or reject an `organización` cliente's self-approval the same way the panel does today.
- **Feedback survey (flow 5) exact content** (user-specified):
  1. ¿Los técnicos se presentaron por su nombre en tu ubicación? (sí/no)
  2. ¿Atención al cliente fue clara y respondió todas tus dudas? (sí/no)
  3. ¿Te dieron un diagnóstico acertado? (sí/no)
  4. ¿Recomendarías a Estación 360? (sí/no)
  5. Comentario adicional libre (free text)
  Plus an overall **1-5 rating**, collected FIRST via buttons (WhatsApp caps interactive messages at 3 buttons — 1-5 needs two button messages, e.g. "1-2-3" then "4-5", or a list message type), then Q1-4 as short replies, then Q5 open text.

## Known gaps to fill during implementation (not yet resolved — flag if blocking)

- `conversacion_estado` is keyed uniquely by `(canal, idExterno)` only — no flow-type discriminator. Booking (flow already live) and any new flow (verification, feedback survey) sharing that table means a customer literally cannot be mid-booking AND mid-verification/survey at once — last-write-wins on the row. Decide: add a `tipo` column to the unique key (small migration, touches `conversacion.ts`'s `leer`/`guardar`), or give each new flow module its own table. **Recommend the `tipo` column** — same TTL/upsert shape, smallest schema change, keeps one table instead of three.
- No "cliente's open cotizaciones" or "cliente's open nota" lookup exists. `listNotas({clienteId, abiertas:true})` composes today for notas. Cotizacion has no `clienteId` filter (linked via `notaId` → `nota.clienteId`) — needs one added to `listCotizaciones`'s `where` (comercial.ts:154-180).
- Zero cron/scheduler infra in the repo. Flow 3 (day-before reminder) needs new infrastructure — Vercel Cron (`vercel.json` crons array → new authenticated `/api/cron/recordatorios-citas` route) is the smallest addition; confirm deploy platform before choosing (no `vercel.json` present today to infer from).
- WhatsApp interactive buttons cap at 3 per message, 20-char labels — every flow's button design must respect this (already true of booking's `tipo`/`franja`/`confirmar` steps).

---

## Phase 0 — Phone verification (`canal_conversacion.clienteId` / `canal_identidad.clienteId`)

**Goal**: a WhatsApp conversation can be linked to a real `cliente` record, staff-triggered, customer-confirmed. Nothing downstream (flows 1/3/4) can resolve "whose conversation is this" without it.

**Schema** (migration required):
- Add `tipo` to `conversacion_estado`'s unique constraint: `@@unique([canal, idExterno, tipo])`, `tipo String @default("booking") @db.VarChar(16)`. Existing booking rows get `tipo:"booking"` by default — no backfill needed since default applies to new rows and existing rows during migration get the column added with the default. New verification module uses `tipo:"verificacion"`.
- New model `cliente_verificacion` (parallel to `canal_vinculacion`, scoped to `clienteId` not `userId`):
  ```prisma
  model cliente_verificacion {
    id         String    @id
    clienteId  String
    cliente    cliente   @relation(fields: [clienteId], references: [id], onDelete: Cascade)
    canal      String    @db.VarChar(16)
    idExterno  String    @db.VarChar(64)  // the WhatsApp number attempting to verify — set BEFORE claim, so the code can only be redeemed from the number it was sent to
    codigoHash String    @unique
    expiraAt   DateTime
    usadoAt    DateTime?
    revocadoAt DateTime?
    creadoAt   DateTime  @default(now())
    @@index([clienteId])
    @@map("cliente_verificacion")
  }
  ```
  Unlike `canal_vinculacion` (self-service, staff proves account control first), this is **staff-initiated**: a staff member on a cliente's detail page clicks "Enviar código de verificación por WhatsApp", server picks the cliente's phone on file, sends the code via `whatsapp.enviarMensaje`, and stores `idExterno` as that same number — so redemption is a match against the number that received it, not open to any number typing a guessed code.

**New file `src/lib/server/canales/verificacionCliente.ts`** (mirrors `identidad.ts`'s shape, adapted):
- `enviarCodigoVerificacion(actor: Actor, clienteId: string, canal: "whatsapp"): Promise<{expiraMinutos: number}>` — permission-gated (ask which roles below), looks up cliente's telefono (prefer `cliente_telefono` where `esPrincipal`, fallback `cliente.telefono`), 400s if none on file, generates code via same `generarCodigoLegible`-style helper (copy from identidad.ts:27-32), creates `cliente_verificacion` row with `idExterno` = that phone in E.164, sends via `whatsapp.enviarMensaje(telefono, "Tu código de verificación Estación 360: {codigo}")`, records audit `canal.verificacion_generada`.
- `redimirVerificacion(input: {canal; idExterno; codigo}): Promise<{clienteNombre: string} | null>` — called from the webhook. Looks up `cliente_verificacion` by `codigoHash`, checks `idExterno` matches the row's stored number (not just any redemption), claims via conditional `updateMany` (copy identidad.ts:79-83 pattern exactly), then upserts BOTH `canal_conversacion.clienteId` and `canal_identidad` (create if absent) for `(canal, idExterno)`. Returns null on any failure (bad code, expired, number mismatch) — webhook replies with a generic retry message, never leaks which check failed (same info-leak discipline as auth).
- `clientePorCanal(canal, idExterno): Promise<{id, nombreCompleto} | null>` — resolves `canal_conversacion.clienteId` (or `canal_identidad`, pick one as source of truth — recommend `canal_conversacion` since it's the persistent thread row already loaded on every webhook call, avoids an extra query).

**Webhook wiring** (`+server.ts`):
- Insert at top of `continuarFlujo` (before existing L136 `booking.enProgreso` check): check `verificacionCliente` pending state (new `tipo:"verificacion"` row in `conversacion_estado`) first — if pending, treat this message as the code attempt, call `redimirVerificacion`, reply accordingly, `return` before booking logic runs.
- New admin/panel trigger: a button on the cliente detail page (`/panel/clientes/[id]`) calling `enviarCodigoVerificacion` — new server action, follows existing action pattern in that route.

**Permission (confirmed with user)**: `canal:verificar-cliente` — Admin, Gerente, Operador. Add to `PERMISOS_DEFAULT` in `src/lib/roles.ts` alongside the existing `canal:chat` roster (same three roles).

**Verification checklist**:
- Migration applies cleanly locally AND against Neon (per user's standing rule — see memory).
- Staff can trigger send from cliente page; WhatsApp receives code.
- Replying with correct code from the SAME number links `canal_conversacion.clienteId`; replying from a DIFFERENT number (spoofed idExterno impossible over real WhatsApp, but test via API-sent message) does not match.
- Expired/reused code rejected with generic message.
- Booking flow still works independently (regression check on `tipo` migration).

---

## Phase 1 — Post-delivery feedback survey (flow 5)

**Goal**: on `entregarNota`, fire a WhatsApp survey to the cliente if their conversation is phone-verified (Phase 0); otherwise fall back to existing in-app/email notify only (no behavior change for unverified customers).

**Schema**: new model `nota_encuesta` (one per entrega):
```prisma
model nota_encuesta {
  id          String   @id
  notaId      String   @unique
  nota        nota_servicio @relation(fields: [notaId], references: [id], onDelete: Cascade)
  calificacion Int?     // 1-5, null until answered
  tecnicoNombre Boolean? // Q1 sí/no
  atencionClara Boolean? // Q2
  diagnosticoAcertado Boolean? // Q3
  recomendaria Boolean?  // Q4
  comentario  String?   // Q5
  paso        String   @default("calificacion") @db.VarChar(20) // calificacion|q1|q2|q3|q4|comentario|completa
  enviadaAt   DateTime @default(now())
  completadaAt DateTime?
  @@map("nota_encuesta")
}
```
Add `encuestas nota_encuesta[]` relation-less single row is simpler — use `@unique` on `notaId`, no back-relation array needed on `nota_servicio` unless the panel wants to show it inline (recommend adding `encuesta nota_encuesta?` to `nota_servicio` for the panel view in a later polish pass, not blocking).

**Hook point**: `entregarNota` (notas.ts:1622-1697), after existing `avisarCliente(nota, {evento:"cliente_unidad_entregada", ...})` call at the end. Add: if `clientePorCanal` resolves a verified WhatsApp conversation for `nota.clienteId`, create `nota_encuesta` row and send the first rating-buttons message. **Do not block/throw entrega on send failure** — same fire-and-forget discipline `notificar()` already follows (never rolls back business operations).

**New file `src/lib/server/canales/encuesta.ts`**: linear step handler (own module, own `conversacion_estado` row with `tipo:"encuesta"`) — same shape as booking's `avanzar`, adapted:
- `iniciarEncuesta(canal, idExterno, notaId)` 
- `avanzarEncuesta(canal, idExterno, entrada)` — steps: `calificacion` (1-5, split across 2 button messages: first "1️⃣2️⃣3️⃣", then if none of those tapped... actually simplest: send as TWO separate button messages back to back is confusing; **recommend a WhatsApp list message instead of buttons for the 1-5 rating** — Cloud API's `interactive.type:"list"` supports up to 10 options in one message, cleaner UX than splitting across two button taps. Add `enviarLista` to `whatsapp.ts` alongside `enviarMensaje`, same shape as the existing `interactive/button` branch but `type:"list"`.) → `q1`..`q4` (sí/no buttons, 2 buttons fits the cap easily) → `comentario` (free text) → `completa` (thank-you message, write results to `nota_encuesta`, clear `conversacion_estado` row).

**Webhook wiring**: same insertion point in `continuarFlujo`, checked alongside/after the verification check (order: verification pending → survey pending → booking).

**Notificaciones catalogue**: no new `NOTIFICACION_EVENTOS` key strictly needed (this doesn't go through `notificar()`'s inbox/push system, it's a direct WhatsApp send) — confirm with user if they also want an in-app copy of "encuesta enviada" for staff visibility; if yes, add `cliente_encuesta` — actually audience would be wrong (encuesta targets cliente but isn't inbox-relevant to them since it's a live chat, not a stored notification). Skip unless requested.

**Panel visibility**: new read-only section on `/panel/notas/[id]` showing survey results once `completa`. Small addition, follows existing detail-page pattern.

**Verification checklist**:
- Deliver a nota (test data) for a phone-verified cliente → confirm rating list message arrives, full sequence completes, `nota_encuesta` row populated correctly.
- Deliver for an UNVERIFIED cliente → confirm no WhatsApp send attempted, no error, existing notify path unaffected.
- Abandon mid-survey (no reply) → confirm no crash on next unrelated webhook call from same number (stale `conversacion_estado` row, same TTL discipline as booking).

---

## Phase 2 — Quote authorize/reject over WhatsApp (flow 4)

**Goal**: when a cotizacion moves to `enviada` (already fires `avisarClienteDeNota` with `cliente_cotizacion` event — comercial.ts:706-711), ALSO send it via WhatsApp with ✅/❌ buttons if the cliente's conversation is verified. Reuses `cambiarEstadoCotizacion` itself for the actual state change — this phase is purely about the WhatsApp send + button-tap → function-call wiring, never a parallel state machine.

**No schema change needed** — `cotizacion.autorizadaMedio` already has a slot for `"WhatsApp"` as a value (schema comment literally lists it as an anticipated option).

**Hook point 1** (outbound): `cambiarEstadoCotizacion`, in the `destino === "enviada"` branch (comercial.ts:706-711) — after the existing `avisarClienteDeNota` call, additionally: if `clientePorCanal` resolves a verified conversation for `cotizacion.nota.clienteId`, send `whatsapp.enviarMensaje(idExterno, resumenTexto, [{id:"cotizacion:autorizar:{id}", titulo:"✅ Autorizar"}, {id:"cotizacion:rechazar:{id}", titulo:"❌ Rechazar"}])`. The button `id` carries the cotizacion id — no separate state machine needed, the button IS the state.

**Hook point 2** (inbound): webhook's `continuarFlujo` — before booking's fallback, check `entrada.boton?.startsWith("cotizacion:")`. Parse `autorizar|rechazar` + cotizacion id, call `cambiarEstadoCotizacion({actor: SYSTEM_ACTOR_EQUIVALENT, id, estado, body})` — **this is the piece needing care**: `cambiarEstadoCotizacion` currently takes `actor: Actor` and permission-checks `cotizacion:authorize`/`cotizacion:send` via `can(actor.role, permiso)` (comercial.ts:631-632). A WhatsApp customer has no `Actor`/role. Per the earlier decision (system/anonymous action), this needs a **new thin wrapper**, not a bypass of the existing function's contract:

```ts
// src/lib/server/canales/cotizacionCanal.ts
export async function autorizarCotizacionPorCanal(
  canal: "whatsapp", idExterno: string, cotizacionId: string, estado: "autorizada" | "rechazada"
) {
  const cliente = await clientePorCanal(canal, idExterno);
  if (!cliente) throw new ClienteError(403, "Conversación no verificada.");
  const cotizacion = await getCotizacion(cotizacionId);
  if (cotizacion.nota.clienteId !== cliente.id) throw new ClienteError(403, "Esta cotización no pertenece a este cliente.");
  // organización case: cambiarEstadoCotizacion requires a contactoId with rol "autorizador" —
  // resolve it here from cliente_contacto where telefono matches idExterno, or reject with
  // a message telling the customer to have their authorized contact reply instead.
  ...
  return cambiarEstadoCotizacion({ actor: SYSTEM_ACTOR, id: cotizacionId, estado, body: { medio: "WhatsApp", contactoId } });
}
```
**Open question to resolve during implementation, not before**: `cambiarEstadoCotizacion` requires a real `Actor` for `recordAudit` (actor.id/email attribution) and the `can()` permission check. Two options: (a) define a fixed `SYSTEM_ACTOR` (e.g. `{id:"system-whatsapp", email:"sistema@whatsapp", role:"admin"}`) that satisfies `can()` trivially and shows in audit trail as system-originated — mirrors how `solicitarCitaPorCanal` already handles the equivalent gap for citas (check that function's exact approach first, since it solved this exact problem already); (b) add an internal-only variant of `cambiarEstadoCotizacion` that skips the `can()` check but keeps every other invariant (organización/contactoId check, transition validity, audit) — cleaner separation but more surface. **Recommend (a) if `solicitarCitaPorCanal` already established that pattern — copy it exactly, don't invent a second convention.**

**The `organización` self-approval guard is NOT weakened**: if the cliente is a `tipo:"organizacion"` and no matching `cliente_contacto` with `autorizador` role has the WhatsApp number on file, `autorizarCotizacionPorCanal` rejects with a message telling them an authorized contact must reply from their own verified number — same rule the panel enforces, just surfaced as a chat message instead of a form error.

**Verification checklist**:
- Send a cotizacion to a verified persona-type cliente → WhatsApp arrives with buttons → tap Autorizar → `cotizacion.estado` flips, `autorizadaMedio:"WhatsApp"`, audit row shows system attribution, panel reflects it live.
- Same for organización cliente where the replying number IS a contacto with `autorizador` role → succeeds, `autorizadaPorContactoId` set correctly.
- Organización cliente, unverified/non-autorizador number → rejected, cotizacion untouched, no audit row for a rejected attempt (or a distinct audit action for the rejected attempt — decide during build, lean toward logging attempts too for the paper trail).
- Double-tap / stale button after cotizacion already resolved → `cambiarEstadoCotizacion`'s existing `puedeTransicionarCotizacion` check already 409s this, confirm the WhatsApp reply surfaces a friendly "ya fue respondida" message instead of a raw error.

---

## Phase 3 — Appointment reminder + confirm/cancel (flow 3)

**Goal**: day-before a `cita`, send a WhatsApp reminder with confirm/cancel buttons to verified clientes.

**Infrastructure (confirmed with user: deploy target is Vercel)**: add `vercel.json` with a `crons` entry hitting a new authenticated route `GET /api/cron/recordatorios-citas`. Auth via shared-secret header — Vercel's cron requests carry `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` env var is set; route checks that header, 401s otherwise.

**Route**: `src/routes/api/cron/recordatorios-citas/+server.ts` — `GET` handler, validates a shared-secret header, queries citas with `fecha` = tomorrow and `estado` in confirmable states (check `whereVencidas`-style helper in citas.ts:197 for the query-building pattern already established), for each: if cliente's conversation is verified, send reminder with `[{id:"cita:confirmar:{id}", titulo:"✅ Confirmo"}, {id:"cita:cancelar:{id}", titulo:"❌ Cancelar"}]`.

**Inbound**: webhook `continuarFlujo`, new branch for `entrada.boton?.startsWith("cita:")` → calls existing `confirmarCita`/`cancelarCita` (citas.ts:1101, 1283) via the same system-actor pattern established in Phase 2 (reuse, don't reinvent).

**Idempotency**: track `recordatorioEnviadoAt` on `cita` (new nullable column) so the cron job is safe to run more than once a day / retry without double-sending — small migration.

**Verification checklist**:
- Cron route rejects requests without the correct secret (401).
- Running it twice in a row for the same day does not double-send (idempotency column check).
- Confirm/cancel buttons drive the real `confirmarCita`/`cancelarCita` functions, same invariants as the panel.

---

## Phase 4 — "¿Cómo va mi carro?" status check (flow 1)

**Goal**: verified customer texts in anytime (free text, not a button/menu-driven flow — keep it conversational) → bot recognizes intent → replies with current nota status.

**Simplest reuse-first design**: no new state machine needed. In `continuarFlujo`, AFTER the verification/survey/booking-continuation checks (i.e., only when no flow is already in progress for this chat) — add an intent check: if the customer's free text loosely matches a status-inquiry pattern (keyword match on "estado"/"cómo va"/"listo"/"mi carro", case-insensitive, accented-insensitive — reuse whatever normalization `tallerMencionado`'s false-positive fix already established for Spanish text matching, don't reinvent) AND the conversation is verified AND `listNotas({clienteId, abiertas:true})` returns exactly one open nota → reply with `notaEstadoLabel(nota.estado)` + last comment/avance. If zero or multiple open notas, reply listing folios and ask which one (or if zero, say there's nothing open right now).

**No schema change.** **No new domain function needed** — `listNotas` already composes this (confirmed by discovery: `{clienteId, abiertas:true}` works today).

**Ambiguity/simplicity call to make with user before building**: should this be free-text keyword matching (fragile, but zero extra taps — "just text and ask") or a persistent menu item (e.g., after verification, bot says "escribe 'estado' para ver tu servicio" — narrower match surface, less accidental triggering)? Recommend the narrower explicit-keyword version first (smallest, least false-positive risk against booking's own free-text fields), expand later if real usage shows people phrase it differently.

**Verification checklist**:
- Verified cliente, one open nota, texts "cómo va mi carro" → correct status back.
- Verified cliente, zero open notas → correct "nothing open" message, no crash.
- Verified cliente, 2+ open notas → lists both folios, asks to specify (folio reply routes to the specific one — small follow-up branch).
- Unverified cliente asking the same → bot doesn't leak any nota info, prompts verification instead (Phase 0 gate).
- Message during an ACTIVE booking/survey/verification flow does NOT get hijacked by this intent check — confirm ordering in `continuarFlujo` is respected (in-progress flows always win over fresh-intent detection).

---

## Cross-cutting

- **Every phase's new send path must fail closed on `whatsappConfigurado()===false`**, same as the existing webhook route — don't add a second unguarded send path.
- **Audit**: every server-initiated WhatsApp send that changes business state (verification link, cotizacion authorize, cita confirm/cancel) gets a `recordAudit` call, same discipline as the panel equivalents — Phase 2/3's wrapper functions are the right place for this, not the webhook route itself.
- **Docs**: update `docs/appointments.md` (Phase 3), `docs/billing.md` (Phase 2, cotizacion authorization medio), `.issues/whatsapp-telegram-integracion.md` (mark these flows as built, cross-reference this doc) once each phase ships.
- **Migrations**: every phase with a schema change — remind to run migrate deploy in BOTH local and Neon, per standing instruction. Never run destructive commands against Neon directly.
