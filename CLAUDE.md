# Estación 360 — Sistema de administración de taller

SaaS to run the Estación 360 mechanic shop (Hermosillo, Sonora). Priorities, in order:
**speed**, **compatibility**, **integrability with other programs**.

## Stack

| Layer     | Technology                                   |
| --------- | -------------------------------------------- |
| Framework | SvelteKit 2 + Svelte 5 (runes mode enforced) |
| Language  | TypeScript                                   |
| Styling   | Tailwind CSS v4, CSS-first `@theme`          |
| ORM       | Prisma 7 (`pg` adapter)                      |
| Database  | PostgreSQL                                   |
| Auth      | Better Auth + `admin` plugin                 |

---

## Rule 1 — Every new function needs its permissions confirmed by role, before it is written

There are exactly four roles. They are fixed; do not invent a fifth without being told.

| Role            | Key        | Rank |
| --------------- | ---------- | ---- |
| Admin           | `admin`    | 1    |
| Gerente         | `gerente`  | 2    |
| Operador        | `operador` | 3    |
| Taller Mecánico | `taller`   | 4    |

**Claude must ASK which roles get access before implementing any new endpoint, action,
page, or capability.** Do not guess, do not infer from the rank ladder, do not copy the
role list from a neighbouring feature. Ask, then implement what was answered.

Ask in this shape:

> New: `orden:cerrar` (close a work order). Which roles? Admin / Gerente / Operador / Taller Mecánico.

Once answered:

1. Add the key to `PERMISSIONS` in [src/lib/roles.ts](src/lib/roles.ts) with the exact
   role list. Keys are `<resource>:<action>`.
2. Enforce it server-side with `requirePermission(locals, 'orden:cerrar')` from
   [src/lib/server/guard.ts](src/lib/server/guard.ts).
3. Never gate on role strings inline (`if (user.role === 'admin')`). The registry is the
   only source of truth — inline checks are what drift.

**Deny by default.** A permission absent from `PERMISSIONS` is denied for everyone. Never
add a wildcard or an "admin bypasses everything" shortcut; Admin is listed explicitly in
each key it holds.

Client-side hiding of UI is a courtesy, never a control. Every check runs on the server.

### Authority ladder

`ROLE_RANK` exists for one purpose: `canAssignRole` — you may only grant a role strictly
below your own. It does **not** cascade permissions. A Gerente does not automatically get
what an Operador has; each key lists its roles in full.

Two different ladders, do not confuse them:

| Action                          | Helper          | Rule                                        |
| ------------------------------- | --------------- | ------------------------------------------- |
| Inviting a **new** user         | `canAssignRole` | Strictly below your own rank. No exceptions |
| Re-ranking an **existing** user | `settableRoles` | Admin only, any role **including Admin**    |

Promotion to Admin is possible only through the second path. That is deliberate: without
it, a second Admin could only ever come from re-running the seed.

### Lockout guards

Role changes go through `changeUserRole` in [src/lib/server/users.ts](src/lib/server/users.ts),
which enforces two rules that exist purely to keep you from locking yourself out:

1. **No self-demotion.** Nobody can change their own role, ever. Another Admin has to.
2. **Never zero Admins.** The count is taken _after_ the write, inside a transaction that
   first does `SELECT ... FOR UPDATE` on the admin rows. The lock is load-bearing: without
   it two Admins demoting each other concurrently would each see the other as still an
   Admin and both commit. Do not remove it in the name of simplicity.

The same two guards apply to `setUserLockout`: you cannot lock yourself out, and the last
**active** Admin cannot be locked out either. Locking deletes the target's sessions, so an
open browser tab is cut off at once instead of at its next login. The account and its
history are kept — lockout is reversible, deletion is not, which is why there is no delete.

The `reason` given when locking is **shown to that user on their next login attempt**, so
the lockout drawer warns the person writing it. It is also recorded in the audit trail.

Why that is safe, and the rule to preserve: login errors are otherwise deliberately vague
so nobody can discover which addresses exist. The suspension notice is the one exception,
and only because better-auth throws `BANNED_USER` from its **session-create** hook, which
runs _after_ the password is verified. Reaching that error therefore proves the caller owns
the account. A wrong password on a locked account still gets the generic
"Correo o contraseña incorrectos". **Never move the lockout check before password
verification, and never surface `lockoutNotice` from anywhere but that error path.**

### Contact roles — the two-tier rule

A customer contact holds roles from `CONTACTO_ROLES` in
[src/lib/contacto-roles.ts](src/lib/contacto-roles.ts). Each carries an `autoridad` flag:

| Role          | `autoridad` |                                            |
| ------------- | ----------- | ------------------------------------------ |
| `entregador`  | **yes**     | may collect a unit and sign the handover   |
| `autorizador` | **yes**     | may approve a quote / authorize the repair |
| `facturacion` | no          | receives the invoice                       |
| `general`     | no          | just a phone number                        |

- `contacto:manage` (Admin, Gerente, Operador) — create and edit contacts.
- `contacto:grant-authority` (Admin, Gerente) — **additionally** required to add or remove a
  role flagged `autoridad`.

A front-desk Operador should never be the only person involved in making someone able to
drive a customer's vehicle off the lot. Use `canAssignContactoRole`; never check
`role === 'admin'` inline.

**The check runs on the delta, not the final state.** An Operador editing a contact that
already holds `entregador` may change its phone number — the save carries that role in the
payload and must not be refused. Only _adding or removing_ an authority role needs the extra
permission. Deleting a contact that holds one counts as removing it.

### Clientes, contactos y unidades

- A customer is `persona` or `organizacion`; the name fields required for each are enforced
  by a CHECK constraint, not just by the app.
- A **persona** customer is implicitly authorized to collect their own units — no contact
  row needed. An **organizacion** cannot sign, so it needs named people.
- Contacts are **scoped to one customer**. The same human on two customers is two rows;
  there is no shared person registry.
- `cliente_contacto.alcanceUnidades` is explicit (`todas` | `especificas`). Do not "optimize"
  it into "no rows in `contacto_unidad` means all units" — that silent default reads as a bug.
- Units require only `marca` + `modelo`. VIN is unique when present; **placas are not unique**,
  because plates get reassigned.
- **CFDI fields hold SAT catalog keys, never labels.** `regimenFiscal` and `usoCfdi` are picked
  from [src/lib/sat-catalogos.ts](src/lib/sat-catalogos.ts) and validated server-side; the column
  is `VarChar(8)` because a clave is `601` / `G03`, not its description. The picker filters by
  `cliente.tipo` (`fisica` / `moral`), so an organización is never offered a persona-only régimen.
- **Every string written to a `VarChar` column goes through `trim(value, max, label)`** from
  [src/lib/server/clientes.ts](src/lib/server/clientes.ts) — shared by contactos and unidades.
  Without the `max`, Postgres rejects the write with `value too long for the column's type.
Column: (not available)`, which names neither the field nor a fix. Adding a column means adding
  its length to the matching `trim` call.
- `unidad.clienteId` deliberately duplicates the open `unidad_propietario` row (`hasta` null).
  A partial unique index enforces at most one open period per unit, so a transfer that forgot
  to close the previous one fails loudly. Always write both in one transaction.
- **Transfer** (`unidad:transfer`, Admin only, `motivo` required): service history stays with
  the unit — future work orders must store the customer they were billed to, so old invoices
  stay with the old owner. Per-unit pickup authorizations are revoked on transfer; the new
  owner re-authorizes their own people.
- Archive is the normal removal path (Admin). Hard delete exists for genuine mistakes and is
  refused while a customer still owns units or appears in an ownership history.

### Citas (agenda)

Appointments come from two places and live in one table, `cita`, discriminated by `origen`:

| `origen`  | Who                                                        | Starts as                                           |
| --------- | ---------------------------------------------------------- | --------------------------------------------------- |
| `publico` | anonymous visitor at `/citas`, behind Cloudflare Turnstile | `solicitada`, **no hour** — only `fecha` + `franja` |
| `panel`   | staff at the counter                                       | `confirmada`, with `inicio`/`fin`                   |

- `cita:read` · `cita:create` · `cita:advance` — Admin, Gerente, Operador.
- `cita:update` · `cita:cancel` · `cita:assign` — Admin, Gerente only.
- **`cita:advance` is narrower than it looks.** An Operador may advance only an appointment
  whose `asignadoId` is them, and only forward. The check lives in `avanzarCita` and keys off
  _not_ holding `cita:update` — if anyone ever grants Operador `cita:update`, that ownership
  rule silently stops applying. `check-roles.ts` asserts the pairing for that reason.
- Cancelling is **not** reachable through `avanzarCita`. It is `cita:cancel`, it requires a
  `motivo`, and the reason is what gets read back to the customer.
- `TRANSICIONES` in [src/lib/citas.ts](src/lib/citas.ts) is the state machine **as data**. A move
  not listed is a 409. `completada`, `cancelada` and `no_asistio` are terminal — nothing reopens.
- **`REQUIEREN_HORA` mirrors the `cita_inicio_requerido_check` constraint.** A `solicitada` has no
  `inicio`, so it can only become `confirmada` (which grants the hour) or `cancelada`. Anything
  else — including "no asistió", which is meaningless before an appointment was granted — is
  refused by `avanzarCita` with a Spanish message and hidden from the detail screen. Without that
  guard the database rejects the write and the user sees a raw
  `DriverAdapterError: violates check constraint`. Change the list, change the migration.

**Recolección is the default and is listed first.** Going to collect the vehicle is a core part of
what the shop sells, not an afterthought. `CITA_TIPO_KEYS` order drives every picker, and
`check-agenda.ts` asserts it — a reorder silently changes what customers pick first.

### Vincular: a cita cannot be confirmed in the abstract

`confirmarCita` refuses (409) until the appointment points at a real `cliente` **and** a real
`unidad`. A confirmed appointment is a commitment to work on a specific car for a specific person,
and the work order that follows hangs off both.

`vincularCita` is how that happens, and it can **create** either side in one step from what the
customer already typed (`crearCliente` / `crearUnidad`). That shortcut is the point — the counter
should never have to leave the appointment, open Clientes, retype the same name, and come back to
search for it. It creates through `createCliente` / `createUnidad`, never by writing those tables
directly, so their own rules and audit entries still apply.

**A counter booking is born `confirmada`, so `crearCita` requires the same pair.** All three drawers
that ask for it — "nueva cita", "vincular" on the detail screen, and the board's confirm step —
render [ClienteUnidadPicker.svelte](src/lib/components/ClienteUnidadPicker.svelte), load their
options through `datosParaVincular` and resolve through `resolverClienteYUnidad`. One component, one
loader, one server function, so no two of those paths can drift on who a vehicle may belong to.

`crearCita` resolves the links **before** reading the contact snapshot: picking a registered
customer means the form never posts a name or a phone, so those come off the records instead.
Requiring them first would make choosing an existing customer impossible.

The two pickers use [EntitySearch.svelte](src/lib/components/EntitySearch.svelte) — debounced
type-to-search over `/api/clientes?q=` and `/api/unidades?q=` (name, teléfono, RFC / número
económico, placas, VIN, marca). Options render as cards: `hint` is the subtitle, `detalles` are the
chips that actually tell two identical trucks apart (económico, placas, VIN).

`sugerirUnidades` puts vehicles already on file at the top of the unit picker, **ranked** — VIN,
then exact placas, then partial placas, then marca+modelo, then marca. Ranked rather than filtered
because the signals differ enormously in strength: a plate identifies one vehicle, a marca only
says "a Nissan". Each card says _why_ it matched, so a wrong pick is obvious.

Scoping: with a customer chosen, the search and the suggestions stay inside their fleet. With
none, both search the whole registry — **picking a vehicle then fills the customer**, because a
vehicle already knows who owns it. That is how a returning customer is recognised from plates
alone, and it is why `vincularCita` derives `clienteId` from `unidadId` when only the latter is
given.

Two traps in that drawer, both hit in practice:

- **The suggestion radios post `sugeridaId`, not `unidadId`.** With JavaScript off the search
  `<select>` is in the same form; two inputs sharing a name means the last in the DOM silently
  wins. The server prefers `sugeridaId` explicitly instead of relying on DOM order.
- **Radios cannot be unpicked**, so the suggestion list needs an explicit "Ninguna de estas"
  option or a no-JS user is stuck with their first click.

Two rules that fall out of Rule 7 and are easy to break here:

- **Both halves of an either/or render server-side.** Radios cannot hide anything without JS, so
  a no-JS user would be trapped in whichever branch SSR happened to pick. `EntitySearch` renders a
  real `<select>` until hydrated, and the drawer renders the "choose existing" _and_ "create new"
  blocks; hiding one is a JS-only courtesy.
- **Nothing in the unused branch may be `required`**, or the browser blocks a submit on a field the
  user cannot see. Gate `required` on `hydrated && creando…`.

`cita.entregadorId` is who hands the unit over when it is not the customer. A foreign key cannot
say "a contact **of this customer** holding the `entregador` role", so `resolverEntregador` checks
it — and re-checks whenever the cita's cliente changes. Letting another customer's contact through
would authorize a stranger to drive a vehicle away.

**The public endpoint holds no permission at all**, on purpose: it is anonymous, and Turnstile is
its gate. `solicitarCita` therefore builds the row field by field from a whitelist and _forces_
`origen`, `estado`, and null `inicio` / `notas` / `clienteId` / `unidadId` / `asignadoId` no matter
what the body says. Never spread a request body there, and never widen what it returns — the
response is `{ folio, fecha, franja }` only, with no id, so it cannot be used to read back or
enumerate somebody else's appointment.

Turnstile fails **closed**: no secret configured means 503, never an open door. There is no dev
bypass flag — `.env.example` ships Cloudflare's always-pass test keys so local development runs the
real verification path. This is the one form in the app that requires JavaScript; `/citas` carries a
`<noscript>` block with phone and WhatsApp, and every `/panel` form stays no-JS (Rule 7).

**Time is always the shop's.** `src/lib/agenda.ts` pins `America/Hermosillo` (UTC-7, no DST since 1998) as a fixed offset. Never format an appointment with the viewer's clock — a Gerente on a laptop
set to CDMX has to see the same grid as the counter. `datetime-local` values are wall-clock and are
read with `enZona`, not `new Date()`.

The calendar is server-rendered CSS grid with no client JS and no calendar library; `acomodar`
computes the overlap columns before the data reaches the browser. Requests with no hour yet are
never guessed onto the time grid — they sit in the per-day "Sin hora" strip, which _is_ the cue that
somebody still has to confirm them.

**Home and the agenda are two screens.** `/panel` is Home — the KPI dashboard and nothing else, the
first thing anybody sees. `/panel/agenda` is the week calendar. `/panel/citas` is the same data as a
filterable table. They were one page, which meant the calendar you open twenty times a day always
sat below a wall of counters, and the counters always sat above a calendar nobody scrolled past.

**Home's gate is the KPIs themselves, not a permission.** Every block in `kpisPara` is already gated
by the data it summarises, so a role with zero blocks has an empty home and is redirected to the
first section it can open — which is why that redirect must skip `/panel` itself or it loops
forever. The sidebar entry is gated on `cita:read` because that is exactly the set of roles with at
least one block today; if that ever drifts, the worst case is a link that bounces, not a leak.

**Four views, one component.** `VISTAS` in [src/lib/agenda.ts](src/lib/agenda.ts) is the registry and
its key order is the button order, narrowest first:

| Vista    | Shape                                 | Steps by |
| -------- | ------------------------------------- | -------- |
| `dia`    | one column of the hour grid           | 1 day    |
| `semana` | seven columns, **rolling** from today | 7 days   |
| `mes`    | 6×7 cells, **Monday-aligned**         | 1 month  |
| `agenda` | flat chronological list, 30 days      | 30 days  |

The week view is a **rolling seven days from the anchor date**, not a Monday-aligned calendar week,
so today is always the first column. On a Friday, a Monday-aligned week would spend five of its
seven columns on days that already happened. The **month** view is the opposite and deliberately
so: you read a month against "the 15th falls on a Tuesday", which only works if the columns are
weekdays. Always six rows, so the grid never changes height between months.

- **Each view steps by its own span** (`pasoDeVista`), or "siguiente" stops meaning "the next
  screenful" — a month stepped by 7 days shows the same month four times.
- **Switching view keeps the anchor date.** Jumping to today on every switch is what makes a
  calendar feel like it is fighting you; you were looking at the 15th for a reason.
- `sumarMeses` **clamps**: 31 Jan + 1 month is 28 Feb, never 3 Mar. `check-agenda.ts` pins the month
  arithmetic — a wrong padding day shifts every cell after it and the grid still _looks_ right.
- `rangoVista("mes")` covers the padding days too, or a visible cell renders empty because its
  appointments were never fetched.

`/panel/citas` reads the same rows as a **board, and the board is the default** (`?vista=tabla` opts
out): one column per estado, filters preserved. "Where is everything stuck" is the question asked
twenty times a day, and a table sorted by date cannot answer it. The board is **not paginated** — a
paginated Kanban hides work — so it takes the whole filtered pipeline, capped at 200.

**Dragging a card opens the confirmation for that move; it never writes on release.** Each move
still needs exactly what it always needed — an hour to confirm, a reason to cancel — and a card that
silently changed column would have lied about that. The drop is a `goto` to `?mover=&a=`, ordinary
URL state like every other drawer, and the form inside posts to the same `avanzarCita` /
`confirmarCita` / `cancelarCita` the detail screen posts to. The board is a shortcut, never a second
set of rules — which is also why the drawer posts a `volver`: without it every move would drop the
operator back onto an unfiltered board.

**`puedeMoverCita` decides which columns light up**: cancelling needs `cita:cancel`, confirming needs
`cita:update`, an Operador advances only what is assigned to them, and nothing that requires an hour
is offered before one exists. A column that does not accept the card simply never calls
`preventDefault`, which is what shows the "no entra" cursor — so a card cannot drop into a refusal.
`check-agenda.ts` pins those cases; the server re-checks all of them anyway.

**A drop starts a flow, it does not write — which is why `pasoParaMover` is a second function.**
Dropping an unlinked request on Confirmada asks for the cliente and the unidad FIRST, in the same
drawer, and comes back to it for the hour: `?/vincular` redirects to `?mover=<id>&a=confirmada`, so
the move somebody started is the move they finish. Vincular is a **step of** confirming, not a
precondition to go satisfy on another screen — refusing the drop and saying "open the cita first"
sends the counter away to do by hand exactly what the drawer already knows how to do. It is the same
`ClienteUnidadPicker` and the same `vincularCita`, loaded through `datosParaVincular` so the board
and the detail screen cannot drift; `confirmarCita` still answers 409 to anyone who posts straight
past it.

Dragging is an **enhancement**, in the Rule 7 sense: HTML5 drag and drop does not exist on a phone
and is not reachable from a keyboard, so the card stays a plain link to the detail screen where
every move already lives. Nothing is reachable by dragging that is not reachable without it, and
`draggable` is switched off on a cita with nowhere legal to go so a dead card never picks up.

The card also carries a **`Nota #folio` badge** once the unit arrived. That the vehicle is here and
the job is open is a different fact from the estado, and it is the one that says the counter is done
with the appointment.

`?mias=1` filters both views to the caller's own assignments. It resolves against the **session**,
never against an id in the URL — otherwise it would just be `asignadoId` with extra steps, and
"mine" could be read as somebody else.

`/panel/usuarios/[id]` is one person's profile and their appointment numbers over a period
(`user:stats` — Admin and Gerente). Reading how a colleague is performing is deliberately a
separate key from `user:list`: seeing that somebody has an account is not the same as seeing how
they are doing. The `cumplimiento` figure counts completed over appointments that actually reached
an outcome — counting the ones still in flight as failures would punish someone for having work
scheduled.

**`?? ` vs `||` on form values.** The `v(name)` helper returns `""` for an absent field, and `""`
is not nullish — so `v("tipo") ?? DEFAULT` silently never applies the default and leaves the form
with nothing selected. Use `||` for these. This shipped as a real bug on the public form.

### Notas de servicio

A `cita` is a promise; a **nota de servicio** is the vehicle physically being here. It opens from
an appointment on arrival ("Recibir unidad") or standalone for a walk-in, and it is the spine
everything else hangs off: inspection, evidence, comments, transfers, quotes, invoices, payments.

| Permission                                                                | Admin | Gerente | Operador | Taller |
| ------------------------------------------------------------------------- | :---: | :-----: | :------: | :----: |
| `nota:read` · `create` · `inspect` · `advance` · `transfer` · `comment`   |  ✅   |   ✅    |    ✅    |   —    |
| `nota:close` · `nota:cancel`                                              |  ✅   |   ✅    |    —     |   —    |
| `taller:read`                                                             |  ✅   |   ✅    |    ✅    |   —    |
| `taller:manage`                                                           |  ✅   |   ✅    |    —     |   —    |
| `taller:review` — decide who gets certified                               |  ✅   |   ✅    |    —     |   —    |
| `notificacion:send` — mandar un aviso a mano                              |  ✅   |   ✅    |    —     |   —    |
| `nota:asignar-mecanico`                                                   |  ✅   |   ✅    |    ✅    |   —    |
| `nota:asignadas` · `nota:diagnostico` · `nota:evidencia` · `nota:comment` |  ✅   |   ✅    |    ✅    |   ✅   |

**The `taller` ROLE is a mechanic on the floor — not the partner workshop.** `taller` the _entity_
is a shop Estación 360 sources jobs out to, and the role must never acquire anything about it
(`taller:read`, `taller:manage`, `taller:review` are all denied to it). The role's own five keys and
the reasoning behind each are in "Taller Mecánico: el rol por fin tiene pantalla" below;
`check-roles.ts` pins both halves.

`NOTA_TRANSICIONES` is the state machine as data. Three destinations are deliberately unreachable
through `avanzarNota`, because each needs more than a status: `en_taller` (needs a shop and a
reason), `entregada` (records who collected it) and `cancelada` (needs a reason).

- **One open note per unit.** A second live note for the same truck is how work gets done twice
  and billed twice.
- **Delivery names a person.** The collector must be the customer themselves or one of their
  `entregador` contacts — the same rule the cita's handover follows.
- **Intake does NOT.** Whoever shows up with the truck is often a driver, a relative, the neighbour
  who was free, so `entregoNombre` is free text with an optional `entregoContactoId` beside it —
  the same shape as `cita`. Handing a vehicle OVER carries no risk of releasing it to the wrong
  person; that rule belongs at the other end. A registered contact still gets its name snapshotted
  (`nota_servicio_entrego_nombre_check`), so the record reads after that contact is archived.
- **Receiving completes the cita.** The appointment's whole job was getting the vehicle here;
  leaving it `en_proceso` meant somebody had to close it by hand later, and nobody does — the
  "citas sin procesar" counter filled with appointments that had succeeded. A request that never
  got an hour is stamped with the arrival time first, because `completada` is in `REQUIEREN_HORA`
  and the database would otherwise refuse the write.
- Receiving lands the operator **in the inspection drawer**, not on the note. The two are one act
  at the counter, and a unit that reaches the bay with no walk-around on file is the exact thing
  the inspection protects the shop from.
- **Transfers are a history, not a flag.** `nota_servicio.tallerActualId` denormalizes the open
  `nota_transferencia` row, written in one transaction, with a partial unique index guaranteeing at
  most one open transfer per note. A vehicle is never at two shops at once.

#### El taller aliado es invisible para el cliente

Estación 360 sources the job out and is the one the customer holds responsible. Handing them the
partner's name invites them to go straight there next time, cutting out the shop that found the
work, priced it and warranties it. So:

- **A quote line is customer-facing data too.** The customer reads the conceptos on
  `/seguimiento`, so `exigirSinTaller` refuses a description naming an active partner shop when the
  quote is written — the same rule and the same `tallerMencionado` detector a visible comment uses,
  which is why that helper lives in `server/talleres.ts` and not in either caller. Checked on the
  way IN, never filtered on the way out: redacting a money document after the fact would silently
  change what somebody was quoted.
- **`notaParaCliente` is the only mapper that may build customer-facing note data.** It omits the
  taller entirely — name, transfer history, internal comments — and uses `NOTA_ESTADO_CLIENTE`,
  where `en_taller` reads "En proceso de reparación" like ordinary progress.
- **A comment marked visible to the customer is customer-facing data**, so `comentarNota` refuses
  one that names an active partner shop, matching on the full name or any distinctive word in it.
  It catches the honest slip — pasting "ya lo mandamos a El Sahuaro" into the wrong box — not a
  determined leak, which is a people problem.
- Internal comments may name the taller freely: that is the shop's own record.

#### QA al recibir del taller

**Nothing comes back from a partner shop without somebody signing off.** `recibirDeTaller` is the
ONLY way out of `en_taller` — `avanzarNota` refuses that estado outright — so the check cannot be
skipped by advancing the status.

**The verdict and where the unit ends up are two separate answers.** `qaResultado` judges the WORK;
`destino` says who has the vehicle afterwards. Collapsing them meant a rejection chained the truck
to the shop that botched it — the honest response to a bad repair ("take it back, I'll finish it
here or send it elsewhere") was unreachable without approving work nobody approved.

| Verdict                     | `destino`             | Effect                                                                       |
| --------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| `aprobado` / `con_detalles` | forced `retorno`      | Transfer closes, note returns to `en_diagnostico`                            |
| `rechazado`                 | `retrabajo` (default) | Transfer stays **open**: the unit is still theirs, for rework                |
| `rechazado`                 | `retorno`             | Transfer **closes carrying the rejection**; note returns to `en_diagnostico` |
| `no_aplica`                 | —                     | Set only by cancellation, never offered in the UI                            |

`qaSigueEnTaller(resultado, destino)` is that rule as one pure function, and `check-notas.ts` pins
all six combinations — the unit stays out in exactly one of them. `destino` left unsaid means
`retrabajo` on a rejection, so an API caller written before this keeps the behaviour it had.

- A rejection **must** say why — it is what gets claimed back from the shop, and it is recorded
  against them either way. Recovering the unit is not forgiving the work.
- **You cannot hand a unit from one partner to the next** without receiving it first. That was the
  exact gap this step closes, so `transferirNota` refuses while the note is `en_taller`. Rejecting
  with `destino: "retorno"` is how you get out of that in one step and re-send it.
- `nota_transferencia_cerrada_qa_check` enforces it in the database: a closed transfer without a
  verdict is impossible, whatever writes to the table.
- The odometer is taken on the way back too — shops return units with more kilometres on them.

### Kilometraje: every intake is a data point

Recording the odometer writes `unidad.kilometraje` **and** a `unidad_kilometraje` row in the same
transaction. The denormalized value keeps the unit list free of subqueries; the history is what
makes "how much has this truck run between visits" and "how often does it come in" answerable —
`origen: 'nota'` readings are exactly the shop visits.

Registering a unit with an odometer also writes an `origen: 'alta'` reading. Without it the curve
only starts at the first visit and there is nothing to measure the first interval against.

**A reading below the previous one is refused** (409, naming both numbers) unless it is explicitly
flagged a correction. A correction is stored and audited but does **not** move `unidad.kilometraje`
backwards. A typo here silently poisons every usage figure that follows.

### Evidencia: Cloudflare R2, presigned, direct

Uploads are two-step: the server signs a short-lived PUT, the browser sends the file **straight to
R2**, then the server records it. Photos never pass through the backend, because a serverless
request body limit is a few megabytes and a phone photo is routinely more.

- SigV4 is hand-rolled in [src/lib/sigv4.ts](src/lib/sigv4.ts) — pure, no `$env`, no SDK — and
  `scripts/check-r2.ts` pins it to **AWS's published test vector**. Hand-rolled crypto is only
  defensible when something else checks the answer.
- The object **key is generated server-side** and validated by prefix on the way back in. A
  caller-chosen key could overwrite another note's evidence.
- The content type is checked **before** anything is signed. `image/svg+xml` and `text/html` are
  refused: a bucket that serves them is an XSS.
- Rows store the KEY, never a signed URL — a stored signature expires and rots into a broken image.
- No keys configured → 503. It fails closed rather than pretending to store things.

### Dinero: cotizaciones, facturas, pagos, crédito

| Permission                                              | Admin | Gerente | Operador |
| ------------------------------------------------------- | :---: | :-----: | :------: |
| `cotizacion:read` · `create` · `send` · `authorize`     |  ✅   |   ✅    |    ✅    |
| `factura:read` · `pago:read` · `pago:register`          |  ✅   |   ✅    |    ✅    |
| `factura:create` · `factura:cancel` · `cliente:credito` |  ✅   |   ✅    |    —     |

`cotizacion:send` and `cotizacion:interno` stay two keys even though the same three roles hold both
today: one is what the CUSTOMER was told, the other is what the shop is doing. The line that matters
is not who talks to the customer — it is who creates a **receivable**, and that is still Admin and
Gerente only.

**Money is integer cents (`bigint`) wherever it is added up**, and only becomes a `Decimal` at the
database boundary. Never a float. `centavos()` is the single place a string from a form becomes
money, and it rejects anything ambiguous rather than guessing.

- **Totals are always recomputed** from the line items. A total sent by a client is a number nobody
  checked — and `cotizacion_montos_check` / `factura_montos_check` enforce `total = subtotal + iva`
  in the database too.
- **IVA is computed on the rounded subtotal**, not per line, so a CFDI adds up the way the SAT
  expects and the total never disagrees with the sum of its own lines by a cent.
- Money leaves the API through `.toFixed(2)`, never `.toString()` — Decimal drops trailing zeros,
  so `5050.00` would serialize as `"5050"` and an integrator would silently disagree.
- A quote is editable only while `borrador`. Once the customer has seen it, changing the numbers
  underneath them is what the state machine exists to prevent — reject it and make a new one.
- **Who authorized is a `cliente_contacto` holding `autorizador`.** An organización cannot approve
  its own quote; that is the entire reason the role exists.
- `factura.pagada` is reached by **arithmetic**, never by a button. Overpayment is refused, and a
  cancellation is refused once payments exist — that case is a credit note.
- **Credit terms are copied onto the invoice** at issue (`diasCredito`, `vence`), so changing the
  customer's limit later never rewrites what was already agreed.
- **Over the limit is a 409** naming the overage. Admin/Gerente can force it with a reason, and the
  override is its own audit entry (`cliente.credito_override`) — the exception has to be visible.
  The check runs _inside_ the transaction, so two invoices issued at the same instant cannot both
  slip under the same headroom.

### Registro de talleres — solicitud pública y certificación

Partner workshops apply from the public page at `/talleres`. Certification is a **status on the one
`taller` row**, not a separate applications table — approving is a status change instead of a copy
between two tables that can quietly disagree about who is certified.

| `taller.estado` | Meaning                                                   |
| --------------- | --------------------------------------------------------- |
| `solicitado`    | Applied from `/talleres`, waiting for a person            |
| `aprobado`      | Certified. **The only estado that may receive a vehicle** |
| `rechazado`     | Turned down. `revisionMotivo` is mandatory                |

- `taller:review` (Admin, Gerente) — read the application queue and decide. Deliberately **not**
  `taller:read`: an Operador picks a shop to send a truck to, but who gets certified is a commercial
  decision and the application carries the shop's RFC and the private notes written while judging it.
  `listTalleres` enforces this on the **query**, not the UI — without the key, `?estado=solicitado`
  still returns the certified registry.
- `transferirNota` refuses any taller that is not `aprobado`. The gate is on the write, not on which
  options got rendered, so a shop that merely applied can never end up holding a customer's vehicle.
- Rejecting a shop that still holds one of our units is refused: receive it back first.
- `solicitarTaller` is anonymous, Turnstile-gated, and builds the row **field by field from a
  whitelist**, forcing `origen`/`estado`/`revisado*`. Never spread the body — an
  `{ estado: "aprobado" }` in the payload would certify the applicant itself. It returns
  `{ nombre, estado }` only, with no id.
- Staff creating a taller by hand get `estado: 'aprobado'`: typing it in **is** the decision.

**Sucursales.** A workshop has branches, each with its own named contact (`contactoNombre`,
`contactoPuesto`, `contactoTelefono`, `contactoEmail`) — a phone number with nobody to ask for is
not a contact. The head office is a sucursal too (`esPrincipal`), so "where is this shop" has one
answer shape. `taller_sucursal_principal_unica` is a partial unique index allowing at most one live
principal, so promoting a second without demoting the first **fails the write** — always go through
`despromoverPrincipal` inside the same transaction. Archiving the principal leaves the shop without
one rather than silently promoting another: which branch is the head office is a decision.

### Notificaciones

Two channels, one system of record. **The `notificacion` row is the truth; Web Push is a courtesy
on top of it.** A shop with no VAPID keys configured still has a fully working notification centre —
this is the one integration that degrades instead of failing closed, because a notification gates
nothing.

`NOTIFICACION_EVENTOS` in [src/lib/notificaciones.ts](src/lib/notificaciones.ts) is the catalogue,
same shape as `audit-actions.ts`. Adding an event means adding its key there in the same change.

|                         |                                                                          |
| ----------------------- | ------------------------------------------------------------------------ |
| `audiencia: "empleado"` | Staff inbox. May say anything, including which partner shop has the unit |
| `audiencia: "cliente"`  | The customer. **Never names a partner taller**                           |
| `alcance: "difusion"`   | Everyone holding `permiso`                                               |
| `alcance: "directo"`    | One named recipient, decided at the emit site                            |

**A broadcast's audience is a permission, never a role list**, so the audience of a notification can
never be wider than the audience of the screen it links to. `check-roles.ts` asserts every
`difusion` event points at a key that actually exists — a typo would silently mean "nobody".

**Customer events are prefixed `cliente_`, and the prefix must match the audience** — asserted in
`check-push.ts`. That is what makes a miswired emit obvious in review, because `cliente_*` copy is
the only copy that must never name a taller.

#### Permissions

- **Reading your own inbox, clearing it, and managing your own devices carry NO permission key.**
  They are inherent to having an account, so they go through `requireUser`, not `requirePermission`.
  That is also what keeps `permissionsFor('taller')` empty — a `notificacion:read` key would put a
  permission on the `taller` role for the first time, which is a decision nobody has made.
  `check-roles.ts` asserts no other `notificacion:*` key ever appears.
- `notificacion:send` (Admin, Gerente) — pushing a message **at** somebody, by hand.

There is deliberately no "read anyone's inbox" capability. A notification is a message to a person;
oversight is what the audit trail is for.

#### notificar() never throws

It is called from inside business operations — receiving a vehicle, registering a payment — and a
slow push service must not fail the request that took the money. Everything is caught and logged.

It runs **after** the transaction commits, deliberately: a notification about a change that rolled
back is a lie. This is the opposite of `recordAudit`, which must commit _with_ its write (Rule 3) —
the audit row is part of the invariant, the notification is not.

`avisarClienteDeNota` is the **single door for customer-facing notifications**: it pins the deep
link to `/seguimiento/<token>` and constrains the event key to the `cliente_*` half of the
catalogue. Never call `notificar` with a `clienteId` directly from a note flow.

#### Web Push: hand-rolled, pinned to the RFC

[src/lib/webpush.ts](src/lib/webpush.ts) implements RFC 8291 (`aes128gcm` payload encryption) and
RFC 8292 (VAPID) on `node:crypto` — no SDK, same reasoning as `sigv4.ts`. Pure: no `$env`, no
database, no fetch, so it runs under tsx.

Hand-rolled crypto is only defensible when something else checks the answer, so
`scripts/check-push.ts` does two things:

1. pins `cifrarPayload` to the **published test vector in RFC 8291 §5**, and
2. **decrypts it back the way a browser does**, from the receiver's private key, with a
   reimplementation written from the RFC rather than by reusing the library. A test that calls the
   same helpers it is testing only proves the code agrees with itself.

Details that are easy to get wrong and are asserted:

- ES256 must be raw `r||s` (`dsaEncoding: "ieee-p1363"`). Node defaults to DER, which every push
  service rejects.
- `aud` is the endpoint's **origin**, not the URL, so a token for FCM is not valid at Mozilla.
- salt and the ephemeral key are fresh on **every** message; reusing them breaks the scheme.

Delivery lives in [src/lib/server/push.ts](src/lib/server/push.ts). A **404 or 410** from the push
service means the subscription is dead — the row is deleted on the spot, which is what keeps the
device list honest. Anything else increments `fallos`. `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` come
from `npm run vapid`; **rotating them invalidates every existing subscription.**

#### El cliente no tiene cuenta: /seguimiento/<token>

There is no public registration, so a customer subscription cannot hang off a session. Every
`nota_servicio` gets a 256-bit `seguimientoToken` at intake, handed over by WhatsApp from the note
detail screen.

- **The token IS the credential.** The page sends `X-Robots-Tag: noindex` and
  `Cache-Control: no-store`, and `/seguimiento/` is disallowed in `robots.txt`.
- The subscription is filed against the **cliente**, not the note, so it keeps working on their next
  visit instead of dying with the job.
- Everything rendered there comes from `seguimientoPorToken`, which builds through `notaParaCliente`
  and filters comments to `interno: false`. **The partner taller is absent by construction, not by
  remembering to omit it.**
- The customer endpoints are a **separate route group** (`/api/seguimiento/[token]`) from the staff
  ones, rather than `/api/push` accepting an optional token. Both call the same shared functions, so
  the rules cannot drift — but mixing anonymous token auth into staff endpoints is how one bug turns
  into somebody reading a staff inbox.

#### Service worker

`src/service-worker.ts` handles **push and notificationclick only**. It caches nothing: offline
caching of an authenticated panel is its own decision with its own failure mode (a stale page
showing a vehicle as still in the shop), and "we added a service worker for notifications" is not
consent for it. `build` and `files` are intentionally untouched.

Register with `{ type: dev ? "module" : "classic" }` — SvelteKit emits an ES module in dev and a
classic script in the build, and getting it wrong is a silent registration failure.

#### Pedir permiso es una decisión de UX, no un detalle

**Only ever prompt from a user gesture.** Chrome ignores `Notification.requestPermission()` outside
one, and a prompt on page load is the fastest way to get permanently blocked — the browser remembers
the "no" and nothing in the page can ask again. `PushToggle.svelte` explains what the notifications
are for first; the OS prompt only appears after a tap.

Four failure modes, four different messages, because "nothing happened" is otherwise the normal Web
Push experience: unsupported browser · iOS needing the home-screen install (Web Push only works
there from an installed PWA, 16.4+) · the person said no · push not configured on the server.

The bell and its drawer are **server-rendered**: the badge count comes from the layout load, the
list is HTML, "marcar todo como leído" is a real `<form method="POST">`. The whole notification
centre works with JavaScript off; only _turning push on_ needs it, because the Push API is
JavaScript. The count refreshes on ordinary navigation — no polling, no SSE, and the shop's phones
spend no battery on a heartbeat.

`NotificationBell` is the button and `NotificationDrawer` is the inbox, split because the bell
renders at two breakpoints and two mounted drawers would double the DOM and the Escape handler.

#### Preferencias: sólo se guardan las excepciones

An absent `notificacion_preferencia` row means both channels on. Only writing the opt-outs means a
new hire needs no backfill and a new event key needs no migration — the default is always current.

The preferences form walks the **catalogue**, not the submitted keys: an unchecked checkbox posts
nothing, so reading only what arrived would make "turn everything off" indistinguishable from an
empty submit.

#### Un aviso SIEMPRE le llega a alguien

A staff notification that resolves to nobody is worse than no notification: the shop believes it
was told. Three ways that happens, all real:

1. nobody holds the permission — a role list narrowed, an account suspended;
2. the only person who did is the one who caused it (`excepto`);
3. everybody who did has switched that event off.

In all three, `notificar` falls back to the **Admins, ignoring their opt-out for the fallback**.
Somebody being able to silence the whole shop by unchecking a box is exactly the failure this
prevents. If there is not even one live Admin it logs loudly rather than dropping the message.

Push is _not_ forced along with it: the fallback guarantees the message is READABLE in the inbox,
it does not override somebody's choice about being buzzed on their phone at 9pm.

**Customer notifications have no fallback.** There is nobody else it could correctly go to, and
misdirecting it would be worse than dropping it.

### Catálogo de productos y claves SAT

`producto` is what the shop sells: parts, labour, consumables, sublet work. Same vocabulary as
`cotizacion_concepto.tipo`.

**SAT keys are carried from day one even though nothing is stamped yet.** Adding them later means
going back over every line ever quoted to guess which `ClaveProdServ` it should have had, and
nobody remembers. They cost nothing now and cannot be backfilled honestly.

- `claveProdServ` is 8 digits, enforced by `producto_clave_prodserv_check`. **Claves, never
  labels** — the same rule as `cliente.regimenFiscal`, and the same mistake that produced the
  original `value too long for the column's type` bug.
- [src/lib/sat-catalogos.ts](src/lib/sat-catalogos.ts) ships a **curated slice**, not the full
  52,000-entry catalogue, and the field accepts any well-formed clave besides. The picker is a
  shortcut, not a whitelist.
- `controlaInventario` separates a part from an hour of labour: you cannot run out of labour, so it
  has no stock, no layers and no movements. `producto_inventario_fisico_check` enforces it.
- `producto:read` (Admin, Gerente, Operador) · `producto:manage` (Admin, Gerente). The counter
  quotes from the catalogue but does not set prices — the same split as `cliente:credito`.

### Inventario FIFO

**Stock is layers, not an average.** Ten filters bought at $80 and ten more at $95 are not twenty
at $87.50: the next one out costs $80 until the first ten are gone, and a margin computed any other
way is fiction the moment prices move.

- Every receipt opens an `inventario_capa`: a quantity at a cost, consumed oldest first.
- Every issue writes **one `inventario_movimiento` per layer it touched**, each at that layer's
  cost. A single issue of 15 units spanning three layers is three rows — which is what makes cost
  of sale reconstructible instead of an average nobody can defend.
- `producto.existencia` is denormalized from the open layers and written in the **same
  transaction**, exactly like `unidad.kilometraje`. The layers and the ledger are the truth.
- `cantidad` is always POSITIVE; `tipo` carries the direction. A signed quantity plus a type are
  two sources of truth for one fact, and they drift.
- **All or nothing.** A short part rolls the whole issue back rather than supplying half a job
  without telling anybody.
- If `existencia` says there is enough but the layers do not add up, `consumirFifo` throws a 500
  and rolls back. That is corruption, not a business case.

| Permission             | Admin | Gerente | Operador | Taller |
| ---------------------- | :---: | :-----: | :------: | :----: |
| `inventario:read`      |  ✅   |   ✅    |    ✅    |   —    |
| `inventario:entrada`   |  ✅   |   ✅    |    —     |   —    |
| `inventario:salida`    |  ✅   |   ✅    |    ✅    |   —    |
| `inventario:ajuste`    |  ✅   |   ✅    |    —     |   —    |
| `inventario:solicitar` |  ✅   |   ✅    |    ✅    |   ✅   |

**An adjustment always says why** — `inventario_ajuste_motivo_check`. An adjustment with no reason
is shrinkage nobody will ever explain. An increase opens a layer: stock with no cost behind it
makes every later margin wrong. A decrease consumes layers FIFO like any other issue, then the
movements are relabelled `ajuste` so a shrinkage never reads as a sale.

#### CFDI del proveedor, opcional

`inventario_entrada` optionally carries the supplier's CFDI. **The XML is stored verbatim** — the
stamped document is what the SAT and the supplier both recognise, and re-deriving it from columns
is impossible. `cfdiUuid` is unique, so the same invoice cannot be received into stock twice, the
mistake that quietly doubles inventory and halves apparent cost.

`leerCfdi` in [src/lib/cfdi.ts](src/lib/cfdi.ts) is a few regexes over the four attributes we use,
not an XML parser — pure, so `check-inventario.ts` pins it. It returns null for anything that is
not a CFDI rather than throwing: a receipt with a bad or missing XML is still a receipt. **The
parse is a convenience, not a gate.**

### Cotizaciones: dos ejes

A quote has **two statuses**, and the split is the point:

|                 |                                                                                     |
| --------------- | ----------------------------------------------------------------------------------- |
| `estado`        | what the CUSTOMER has said — borrador · enviada · autorizada · rechazada · vencida  |
| `estadoInterno` | what the SHOP is doing — pendiente · en_proceso · completada · por_cobrar · cobrada |

Squeezing both into one column means every new answer to one multiplies the states of the other,
and "autorizada pero todavía no cobrada" — the single most common situation in the shop — cannot
be expressed at all.

- **The internal track never runs ahead of the customer.** Nothing leaves `pendiente` until they
  authorized, enforced in `avanzarInterno` and by
  `cotizacion_interno_requiere_autorizacion_check`.
- **`cobrada` is arithmetic, never a button.** `sincronizarCobranza` derives it from the payments
  on the linked invoices — the same numbers `factura.pagada` turns on — and runs **both ways**, so
  a cancelled invoice drops it back to `por_cobrar`. `check-inventario.ts` asserts no transition
  reaches it.
- `por_cobrar` requires an invoice to exist: without one there is nothing to collect.
- `cotizacion:interno` (Admin, Gerente, Operador) is separate from `cotizacion:send` — moving the
  shop's own track is not the same as telling the customer something.

**A nota can have several cotizaciones**, and always could. What is new is that each carries its
own internal track, so "the brake job is paid and the bodywork is still being argued about" is
expressible on one vehicle.

#### El constructor, y por qué son arreglos paralelos

The quote is built in a drawer on the nota, and it posts **parallel arrays** — `tipo[]`,
`descripcion[]`, `cantidad[]`, `precioUnitario[]`, `productoId[]` — because that is what a plain
`<form>` can send. The action zips them back into objects and calls the same `crearCotizacion` the
API route calls, so the money rules cannot drift between the two paths.

- **Every row must render all five inputs, always.** A `<select>` that disappears when the catalogue
  is empty shifts every later row's fields by one, and the quote silently describes the wrong parts.
- Three rows are server-rendered so the drawer works with JavaScript off; "agregar renglón" is the
  enhancement, not the mechanism. **Blank rows are dropped, not rejected** — shipping spare rows and
  then failing on "I only needed two" would be the form fighting the user.
- The running total is computed in the browser with the **same** `centavos` / `totales` helpers the
  server uses. Two implementations of IVA is how the number on screen stops matching the number
  written.
- **A catalogue line may leave the description blank**: `resolverProductos` fills it from the
  product's name. Making somebody retype what the catalogue already knows is how a quote ends up
  describing a part differently from the thing that leaves the shelf. A line with neither a
  description nor a `productoId` is still a 400.

The customer axis renders from `siguientesCliente(estado)`, so a terminal state shows no buttons
instead of ones the server would refuse. "Enviar" is one click; rejecting opens a drawer because it
needs its `motivo`, and authorising opens one because it has to name **who** approved.

`/panel/cotizaciones` is the cross-cutting list, filterable on both axes at once — "autorizadas por
cobrar" is a question about the shop, and asking it one note at a time is not asking it.

#### Conceptos ligados al catálogo

`cotizacion_concepto.productoId` is optional — a one-off line ("mandar rectificar la cabeza con el
del torno") is a real quote line that will never be a product.

**The SAT keys are COPIED onto the line**, never read through the relation. Re-classifying a
product next year must not silently rewrite what was already quoted — the same reasoning as
copying credit terms onto an invoice at issue.

`surtirCotizacion` issues the catalogue lines FIFO. It is guarded on `cantidad - surtido` read off
the row, so calling it twice cannot double-consume, and `surtido` is a SUM of movements rather than
a checkbox — that is how stock and paperwork stop agreeing.

### Taller Mecánico: el rol por fin tiene pantalla

`taller` the **role** is a mechanic. `taller` the **entity** is a partner workshop we source jobs
OUT to. Two different things sharing a word — and the role still administers no workshop
(`taller:read` / `manage` / `review` are all denied to it), which `check-roles.ts` asserts.

**A mechanic may now BELONG to a partner workshop** — `user.tallerId`, set from the taller screen
through `asignarMecanicoATaller` (`taller:manage`). That is the one place the two meanings touch,
and it grants no permission: it only widens **which notes are in scope**.

- **Only a `taller` role may carry a `tallerId`.** An Operador or Gerente with one would be an
  account holding the counter's permissions AND an outside shop's scope.
  `user_taller_solo_rol_taller_check` refuses it in the database, whatever writes to the table.
- `tallerId` must be declared in better-auth's `user.additionalFields`, or the column is never
  selected and `locals.user.tallerId` is `undefined` on every request — a scope that silently
  evaluates to "none". `input: false`, so it can never be set from a sign-up or update payload.
- `requireUser` reads it only for a `taller` role, so a stale session cannot widen anybody's scope.
- Accounts are still born **only** from an invitation. The crew drawer deliberately has no "create
  the user here" shortcut: a second way to mint accounts is a second place the role decision lives.

**`alcanceDeTaller(actor)` is the boundary, and it is a `where`.** One of ours sees the notes
assigned to them; a partner shop's mechanic ALSO sees every note their workshop has held — past
transfers included, because "what did we do to this truck last time" is what stops them redoing
it. `misNotas`, `getNotaDeTaller` and `exigirNotaPropia` all route through it, so read scope and
write scope cannot drift apart.

**`notaParaTaller` carries no customer at all** — no name, no phone, no price — and now carries
`motivoTaller`: what WE asked their shop to do, which is a different fact from why the vehicle came
to Estación 360. Free-text comments are still free text; the mapper is the guarantee, not the prose
inside it.

The role holds exactly five keys, and the scope is the whole point:

| Permission             | What it allows                                                          |
| ---------------------- | ----------------------------------------------------------------------- |
| `nota:asignadas`       | See the notes assigned to THEM. Not `nota:read` — never the whole floor |
| `nota:diagnostico`     | Write what they found; mark their own work finished                     |
| `nota:evidencia`       | Photograph the job                                                      |
| `nota:comment`         | Comment, **forced internal**                                            |
| `inventario:solicitar` | Ask for a part                                                          |

- `misNotas` scopes by `mecanicoId` **in the query**, never by filtering a full list afterwards.
  That difference has to be a different query or it is not a boundary.
- A note that is not theirs answers **404, not 403** — probing ids must not confirm somebody else's
  job exists.
- **`notaParaTaller` is the mapper**, and it carries no price and no customer contact. A mechanic
  needs the vehicle, the fault and the history; what the shop charges is not their decision. This
  is why `producto:read` is NOT theirs: the parts picker goes through `buscarParaTaller`, a
  different mapper with names and stock and no price at all.
- The partner taller IS visible to a mechanic. The invisibility rule is about the customer, not
  about staff.

**`trabajoTerminadoAt` is not a nota estado.** "The work is finished" and "the car can be handed to
the customer" are two different facts owned by two different people; collapsing them is how a
vehicle gets promised before anybody checked it. The mechanic marks the first, the counter decides
the second. Re-assigning a note clears it — the new mechanic has not finished anything yet.

**Asking is not taking.** `solicitud_refaccion` writes no stock movement. Somebody at the counter
fills it — which is what issues the stock, in the same transaction — or turns it down with a
mandatory reason. The pending list is also the record of the gap between what jobs needed and what
was on the shelf, which is the thing that tells you what to keep in stock.

`/panel/taller` is their whole app, and `NAV.ocultarSi` hides it from anybody who also holds
`nota:read` — a Gerente is not a mechanic and already has the full floor two rows down.

### Who can cancel an invitation

Two permissions, deliberately:

- `invitation:revoke` — cancel a pending invitation **you sent**. Admin and Gerente.
- `invitation:revoke-any` — cancel anybody's. Admin only.

`canRevokeInvitation` combines them and is exported so the table hides the button on rows
the server would reject. Never check `role === 'admin'` inline to approximate this.

Role changes take effect on the target's **existing** session immediately, because
`session.cookieCache` is off and every request re-reads the role from the database. Do not
enable cookie caching without dealing with the stale-privilege window it opens.

Every role change is appended to the audit trail — see Rule 3.

---

## Rule 2 — DDL for every schema change

The database is a shared integration surface, not a private detail of this app. Other
programs will read and write it.

- Every schema change ships as a checked-in SQL migration under
  [prisma/migrations/](prisma/migrations/). `npx prisma migrate dev --name <what_changed>`.
- **Never** `prisma db push` outside a throwaway scratch DB. It leaves no DDL artifact.
- Never hand-edit an already-applied migration. Write a new one.
- Migrations are forward-only and must be safe to run against a live database: add
  nullable columns or columns with defaults, backfill, then tighten in a later migration.
- Table and column names are part of the public contract. Renaming one is a breaking
  change — say so out loud before doing it.

## Rule 3 — Every CRUD is auditable. Only Admin can read the audit

**Every operation that creates, updates or deletes anything writes an audit entry.** No
exceptions, no "this one is minor". If a row changes, the log says who changed it and when.
Reads are not audited.

Adding a mutation means, in the same change:

1. Register its action key in [src/lib/audit-actions.ts](src/lib/audit-actions.ts) as
   `<entity>.<action>` with a Spanish label.
2. Call `recordAudit` from [src/lib/server/audit.ts](src/lib/server/audit.ts) inside the
   shared server function — not in the route, or the form action path will skip it.
3. If the write is in a transaction, pass the transaction handle as `db` so the change and
   its audit entry commit or roll back **together**. A committed change with no audit row,
   or an audit row for a change that rolled back, are both lies. `changeUserRole` is the
   pattern to copy.

Fill `before`/`after` with the state that actually changed, and `entityLabel` with
something human-readable (an email, a plate number) — it is a snapshot that survives the
audited row being deleted.

**Never write secrets into the audit.** No passwords, no password hashes, no raw invite
tokens. The log must never become a way to obtain access.

**`audit_log` is append-only.** Never `UPDATE` or `DELETE` a row in it. Never expose an
endpoint that could. A trail someone can edit is not a trail.

**Reading it is Admin-only** (`audit:read`). It is the record that holds everyone —
Gerentes included — accountable, so it does not widen without an explicit decision.

The screen is `/panel/auditoria`; the API is `GET /api/audit-logs`, paginated
(`page`, `perPage`, capped at 100) and filterable by `action`, `entity`, `entityId`,
`actor`, free-text `q`, and a `desde`/`hasta` date range.

## Rule 4 — API for everything

Business logic is reachable over HTTP, always. Assume an external program (accounting,
DMS, WhatsApp bot, the Shopify storefront) will call it.

- Every capability gets a route under [src/routes/api/](src/routes/api/) returning JSON.
- Pages and form actions **call the same shared function** the API route calls. They never
  re-implement a rule. See `issueInvitation` in
  [src/lib/server/invitations.ts](src/lib/server/invitations.ts) — the JSON API and the
  `/panel` form action both route through it, so the authority checks cannot drift.
- Naming: `/api/<recurso>` plural, REST verbs (`GET` list, `POST` create, `PATCH` update,
  `DELETE` remove). Errors use real HTTP status codes with a Spanish `message`.
- Never return internal columns clients shouldn't see. Shape responses through an explicit
  mapper (e.g. `publicInvitation`) — never spread a Prisma row straight into JSON.
- `GET /api/me` reports the caller's role and effective permissions so integrators read
  their capabilities instead of hardcoding the role table.

## Rule 5 — Components over repetition. DRY is not optional here

This project is going to get big. Every pattern copy-pasted a second time is a change you
will later have to make in N places and will miss in one of them.

**Before writing markup, look in [src/lib/components/](src/lib/components/).** If something
close already exists, use it — extend it with a prop rather than forking a variant.

Current shared components:

| Component             | Use for                                                               |
| --------------------- | --------------------------------------------------------------------- |
| `Button`              | Every action. Renders `<a>` with `href`, `<button>` without           |
| `Field`               | Label + control + hint. Pass `children` for a `<select>`              |
| `DataTable`           | Any table. Owns the scroll container and header row                   |
| `Badge`               | Status pills                                                          |
| `PageHeader`          | Section title + description + action buttons                          |
| `EmptyState`          | "Nothing here yet" panels                                             |
| `Drawer`              | Anything that would otherwise have been a modal                       |
| `Icon`                | Icon lookup by serializable key, for nav data                         |
| `SatSelect`           | SAT catalog picker, filtered by customer type                         |
| `StatCard`            | Dashboard counter. Renders a link when given `href`                   |
| `Calendar`            | Agenda grid. Week and day share one component via `vista`             |
| `EntitySearch`        | Debounced type-to-search picker. Falls back to a `<select>`           |
| `ClienteUnidadPicker` | Pick or create cliente + unidad + entregador. Both cita drawers       |
| `NotificationBell`    | Bell + unread count. The button only — the inbox is its own component |
| `NotificationDrawer`  | The in-app inbox. Mounted once by the panel layout                    |
| `PushToggle`          | Turn browser notifications on for this device. Staff and customer     |
| `Flash`               | What just happened. Success from `?ok=`, failure from `form.message`  |
| `CombustibleGauge`    | The fuel gauge as a slider in eighths, not a dropdown of fractions    |

### Un submit por formulario

Every write is a real `<form method="POST">` that redirects, so the only thing between a double-tap
and a duplicate row is how fast the server answers. On a phone in the bay that is not fast: the
button looks dead, it gets tapped again, and **two identical citas land 250 ms apart** — which is
exactly what happened, and what also produced doubled comments.

[src/lib/una-vez.ts](src/lib/una-vez.ts) is ONE capture-phase `submit` listener installed in the
root layout. It covers the panel, the public booking form and anything added later, because a
per-form guard is one somebody eventually forgets to add. GET forms are exempt — resubmitting a
filter costs nothing and blocking it strands whoever edited the query.

Two details that break it if changed:

- **Disable the buttons on the next tick, never synchronously.** Disabling before the browser has
  serialized the form drops the button's own name/value and, in some browsers, cancels the submit.
- **Release every form on `afterNavigate`.** A failed action re-renders the same page with the same
  DOM nodes, and a form left marked would be permanently dead — "fix the field and try again"
  would be impossible.

It is a courtesy, not a control: with JavaScript off a double submit still gets through. Anything
that genuinely cannot happen twice defends itself in the database — `nota_servicio_unidad_abierta_key`
(one open note per unit), `nota_transferencia_abierta_key`, `cita_id` unique on a nota. The app's
own read-then-write checks stay for the sake of the Spanish message, but they lose the race; the
index is what wins it, and `crearNota` translates the P2002 back into that same 409.

### Feedback: `?ok=` en la URL, no un store

Every panel action ends in `redirect(303, …)` — that is what stops a refresh from repeating a write
— and a redirect throws away anything the action wanted to say. So the result travels in the URL
(`conFlash(ruta, "nota.inspeccionar")` → `?ok=nota.inspeccionar`) and `Flash.svelte` reads it back
against the registry in [src/lib/flash.ts](src/lib/flash.ts).

The URL and not a store: it survives the redirect, works with JavaScript off, reloads, and is the
same place drawers and filters already live. A store would need JS and would be empty on exactly
the page load that is supposed to report the result.

An **unregistered key still renders "Listo."** rather than nothing. A message somebody forgot to
add is a smaller failure than silence — "nothing happened" is what the user must never be left
thinking, and it is what the panel used to say after half its actions.

### Errores: nada falla en silencio, y nadie lee un error del servidor

Two rules, pulling against each other, which is why they live in one place:

1. **Every failure reaches the person who caused it.** A caught exception that ends in a
   `console.error` and a page that looks unchanged is the worst outcome in the app — the user
   believes the write happened.
2. **The user never reads an internal error.** A driver message names columns, constraints and
   connection strings; a browser message is English written for whoever builds browsers. Neither
   tells anybody at the counter what to do, and the first tells an attacker about the schema.

The sentences themselves are in [src/lib/errores.ts](src/lib/errores.ts) — pure, browser-safe, and
pinned by `check-errores.ts`, because "an internal message never reaches a screen" is a security
rule and a rule nothing checks is a rule that drifts. The check asserts a raw
`violates check constraint …` is replaced, that a `TypeError` from a dead `fetch` becomes "revisa
tu internet", and that a 5xx says whose fault it is.

**The exception is a message somebody WROTE to be shown:** `ClienteError` / `InviteError` /
`UserError` on the server and `ErrorVisible` in the browser. Those pass through untouched. Anything
else becomes `MENSAJE_INTERNO` plus a six-character reference, and the real error goes to the log
against that same reference — which is what makes "me salió el 4F2A91" findable.

Four doors, and every failure goes through one of them:

| Where | What to call | Lives in |
| --- | --- | --- |
| A form action's `catch` | `return fallo(err)` — or `fallo(err, { valores })` | `server/errores.ts` |
| A `load`'s `catch` | `fallaEnCarga(err)` — a load cannot `fail()` | `server/errores.ts` |
| Anything that escapes | `handleError` in `hooks.server.ts` → `+error.svelte` | the backstop |
| A `fetch` from the browser | `toasts.error(mensajeDeExcepcion(err, …))` | `toasts.svelte.ts` |

- **`fallo` rethrows `redirect()` and `error()`.** Both throw, both are control flow, and a catch
  that swallowed a redirect would quietly turn every successful action into one that appears to do
  nothing. This is the single easiest thing to get wrong here.
- **A load that forgets `fallaEnCarga` answers 500 with the right words.** `handleError` can fix the
  message but not the status, so a "no encontrado" reaches a monitor, a crawler and the browser
  cache as an outage. `/panel/citas/<id>` shipped that way.
- Actions never `throw err` any more — that produced a full-page 500 that threw away whatever the
  user had typed.

**Toasts, and they are still `?ok=` underneath.** `Flash.svelte` renders the server's message inline
during SSR and, once hydrated, hands it to `toasts` and stops rendering itself — so a no-JS user
gets the panel (Rule 7) and everybody else gets the toast, from one message and one transport.
[Toaster.svelte](src/lib/components/Toaster.svelte) is mounted **once**, by the root layout, so the
public pages report failures the same way and nothing has to remember to include it.

- Top of the screen at every size: the primary action of a form lives at the bottom where a thumb
  reaches, and a toast covering the button somebody is pressing is worse than no toast.
- **A confirmation clears itself after five seconds; a failure never does.** Good news is expected,
  bad news is news and waits to be read.
- Identical messages collapse into one — a search retried against a service that is down is one
  piece of news, not three.
- Toasts are cleared on navigation but **never on `enter`**, which fires on the first load right
  after `Flash` handed over the result of the action that redirected here.

**A search that failed is not a search that found nothing.** `EntitySearch` used to render "Sin
resultados" for a 500, which reads as "this customer is not on file" and sends somebody off to
register a duplicate of a customer the shop already has. It now has its own `fallo` state with a
retry, and the pickers check `res.ok` before touching the body.

New self-checks: `npm test` also runs `check-errores.ts` (what a failure may say), `check-push.ts`
(RFC 8291/8292 vectors) and `check-inventario.ts` (quantities, the two-axis quote machine, SAT key
formats, CFDI parsing).

Rules of thumb:

- **Second occurrence = extract.** The first time a pattern appears, write it inline. The
  moment you need it again, pull it into `src/lib/components/` and update both callers in
  the same change. Do not leave one copy behind "for now".
- Raw Tailwind class soup repeated across files is the smell. If two elements carry the
  same 6+ classes, that is a component.
- Same rule server-side: shared logic goes in `src/lib/server/` and both the API route and
  the page action call it. `issueInvitation` and `listUsers` are the pattern to copy — an
  endpoint and a form action must never re-implement the same rule.
- Do not build a component for something used once and unlikely to recur. DRY means
  removing real duplication, not predicting it.
- Extend by prop (`variant`, `size`, `tone`), never by copying a component to tweak a class.

## Rule 6 — UI conventions

**Icons: lucide only.** `@lucide/svelte`, no exceptions — no emoji as UI icons, no Heroicons,
no Font Awesome, no hand-drawn SVG, no icon fonts. One icon set or the interface looks
assembled from parts.

Import per icon, never the barrel — the barrel drags thousands of components through Vite:

```svelte
import UserPlus from '@lucide/svelte/icons/user-plus'; // yes import {UserPlus} from '@lucide/svelte'; // no
```

Icon names are kebab-case in the path, PascalCase as the component. Always pass
`aria-hidden="true"` when the icon sits next to a text label, and give the control its own
`aria-label` when the icon is the only content. Default size 18 in navigation and buttons,
20–22 for standalone controls.

Icon keys that cross the server/client boundary (nav data, for instance) stay strings —
components are not serializable. Map them in [src/lib/components/Icon.svelte](src/lib/components/Icon.svelte).

**Password fields.** Always use `Field` with `type="password"` — it renders the
show/hide toggle. Never hand-roll a password input, and never build a second toggle.
The button only appears after hydration (`$effect` never runs during SSR), so a no-JS
user is not left with a dead control.

**"Recordar mi sesión 30 días"** on the login form is `rememberMe` on
`auth.api.signInEmail`, nothing more. It is NOT "remember my password":

- checked → session cookie gets `maxAge = session.expiresIn` (30 days)
- unchecked → cookie has no `maxAge` and dies with the browser

The password is never written to a cookie, to `localStorage`, or anywhere else on the
device. If you are ever asked to "save the password", build session lifetime instead and
say so.

**Drawers, not modals.** There are no modal dialogs in this app. Anything that would have
been a modal is a drawer sliding in from the **right**. Use
[src/lib/components/Drawer.svelte](src/lib/components/Drawer.svelte).

- Open state lives in the URL (`?drawer=<name>`), never in a `$state` boolean. That makes
  drawers deep-linkable, survivable across a form action round-trip, and openable with a
  plain `<a>` when JavaScript is off.
- No `<dialog>`, no focus trap, no scrim on desktop — the page behind stays readable and
  clickable. That is the point of a drawer.
- Phones get full width plus a scrim, because at that size there is no "behind" to preserve.

**Layout.** `/panel` is a dashboard: fixed left sidebar from `md` up, off-canvas from the
left on phones (also URL state, `?menu=1`). Sidebar entries come from
[src/lib/nav.ts](src/lib/nav.ts) and are filtered server-side by permission, so a role
never receives a link to a screen it cannot open.

### Mobile first, always

**The phone is the primary target, not the fallback.** An Operador uses this standing next to a
truck in the bay or in a customer's driveway on a recolección — the desk is where the work gets
written up afterwards. A screen that only makes sense at 1440px is a screen that fails where the
job actually happens.

- **Write the phone layout first, then widen with `sm:` / `md:` / `lg:`.** Tailwind is mobile-first
  by default: unprefixed classes are the small screen. `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`
  is right; `grid-cols-4 max-lg:grid-cols-1` is the same thing written backwards and will drift.
- **Design at 360px.** Every screen has to work there before it is considered done — that is a
  cheap Android in a mechanic's pocket, not an iPhone Pro.
- **Tap targets stay finger-sized.** Minimum ~44px of touch area on anything interactive. Buttons
  and links never shrink below `size="sm"` on phones, and rows of icon-only actions need spacing.
- **Tables scroll, pages never do.** `DataTable` owns the horizontal scroll container for exactly
  this reason. The page body must never scroll sideways; wide content scrolls inside its own box.
- **Prefer stacked cards to cramped columns.** Below `sm`, a four-column stat row becomes four
  readable cards, not four unreadable slivers.
- **Drawers take the full width on phones**, with a scrim — already handled by `Drawer.svelte`.
- **Test the thumb, not just the viewport.** The primary action belongs where a thumb reaches:
  bottom of the form, not floating top-right.
- `capture="environment"` on file inputs so the camera opens directly — evidence gets photographed
  in the bay, not uploaded later from a laptop.

## Rule 7 — Speed and compatibility

- Prerender anything static (`export const prerender = true`). The landing page is one
  static HTML file with zero client JS.
- Forms are real `<form method="POST">` + SvelteKit actions, so they work with JavaScript
  disabled and on old phones in the shop. Add JS enhancement on top, never as a requirement.
- No new runtime dependency for something a few lines of stdlib or a native platform
  feature already covers.
- Style with the Tailwind tokens in [src/routes/layout.css](src/routes/layout.css). Do not
  introduce raw hex values in components — the palette comes from the customer's brand.

---

## Auth model

**Invitation only. There is no public registration.**

`emailAndPassword.disableSignUp: true` in
[src/lib/server/bootstrap.ts](src/lib/server/bootstrap.ts) blocks `POST /sign-up/email`
entirely, including server-side calls. Accounts can only be created two ways:

1. `npx prisma db seed` — bootstraps the first Admin (`alan@maieutica.mx`) into an empty DB, plus
   a demo dataset: one account per role (`gerente@` / `operador@` / `taller@estacion360.test`,
   sharing `SEED_DEMO_PASSWORD`), an organización with three contacts covering both contact tiers,
   a fleet unit, and one **unconfirmed** public request to exercise the vincular → confirmar flow.
   Every part is idempotent (fixed ids, existence-checked) and audited under a `semilla@sistema`
   actor with a null `actorId`, so demo rows are never mistaken for something a person did.
   The demo addresses use `.test`, a reserved TLD that can never resolve or receive mail.
2. Redeeming an invitation — `acceptInvitation` in
   [src/lib/server/invitations.ts](src/lib/server/invitations.ts).

Both go through `auth.api.createUser` called **without** headers, which better-auth treats
as a trusted server call.

### Invitation flow

1. Admin or Gerente calls `POST /api/invitations` (or uses the `/panel` form) with
   `{ email, role }`.
2. Server checks `invitation:create` **and** `canAssignRole` — the target role must sit
   strictly below the inviter's. A Gerente can never mint an Admin or another Gerente.
3. A 256-bit token is generated. Only its SHA-256 is stored; the raw token is returned
   once, in that response, and never again.
4. The inviter sends the link by hand (WhatsApp). `deliverInvitation` is a deliberate
   no-op — when Resend/Twilio/SendGrid is chosen, that one function body changes and
   nothing else does.
5. The invitee opens `/invitacion/<token>`, sets a name and password, and the account is
   created with the role **taken from the stored invitation row**, never from the request
   body. Links expire in 72 hours and are single-use.

Security invariants — do not weaken these without being asked:

- Raw invite tokens are never persisted, logged, or emailed back.
- Role and email on acceptance come from the DB row, never the client.
- Accepting claims the row atomically (`updateMany` with the liveness conditions in the
  `WHERE`), so a double-submit produces one account, not two.
- Login failures are deliberately vague — never reveal whether an address exists.

## Commands

```sh
npm run dev                                  # dev server
npm run build                                # production build
npm run check                                # svelte-check
npm run format                               # prettier
npx prisma migrate dev --name <change>       # new DDL migration
npx prisma migrate deploy                    # apply migrations
npx prisma db seed                           # bootstrap the primary admin
npm run vapid                                # generate a Web Push keypair (once per environment)
```

## Conventions

- Spanish for all user-facing copy and error messages. English for code and comments.
- Server-only code lives in `src/lib/server/` so SvelteKit refuses to bundle it clientward.
- `src/lib/server/bootstrap.ts` uses relative imports only — `prisma/seed.ts` runs it under
  tsx, where `$lib` and `$env` do not resolve.
- Comments explain _why_, not _what_. Mark deliberate shortcuts with a `ponytail:` comment
  naming the ceiling and the upgrade path.
