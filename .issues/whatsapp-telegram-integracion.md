# WhatsApp + Telegram bot integration — plan

## Context

User asked whether Estación 360 is Domain-Driven Design, ahead of adding WhatsApp/Telegram
bot flows: customers creating citas, and employees/mechanics commenting on notas and taking
other actions, all from chat.

**Verdict (confirmed by 3 parallel Explore agents against the actual code, not just docs):**
Estación 360 is **not DDD** — no aggregates, entities, value objects, repositories, or bounded
contexts. It's a clean, consistently-applied **layered/functional architecture**:
`UI → route (+page.server.ts / +server.ts) → domain function (src/lib/server/*.ts) → Prisma`,
exactly as `CLAUDE.md` mandates. ~30 domain files, one per resource (`citas.ts`, `notas.ts`,
`clientes.ts`, ...), each exporting plain functions that take an explicit `actor: Actor` and
call Prisma directly. State machines (cita/nota transitions) are expressed as plain data
(`src/lib/citas.ts`, `src/lib/notas.ts`), enforced both in the domain function and via DB
`CHECK` constraints.

**Decision (per user, after reviewing the verdict): do not migrate to DDD.** The existing
layering already gives a WhatsApp/Telegram bot exactly what it needs — a stable set of
domain functions to call. Introducing aggregates/repositories now would be pure ceremony on
working business logic, which `CLAUDE.md` explicitly warns against ("Do not replace...
architectural conventions without explicit approval"). This plan instead adds chat as a new
**channel** on top of the current architecture, reusing domain functions unchanged wherever
possible.

## Existing pieces this reuses

| Need | Existing code |
|---|---|
| Create a cita, no session | `solicitarCita(input: { body, turnstileToken, ip })` — `src/lib/server/citas.ts:519`, gated by Turnstile, stamps `ACTOR_PUBLICO` |
| Create a cita, staff | `crearCita(input: { actor, body })` — `citas.ts:580` |
| Comment on a nota | `comentarNota(input: { actor, id, texto, interno?, adjuntos? })` — `src/lib/server/notas.ts:1703`. Forces `interno: true` when actor lacks `nota:read` (mechanics never write customer-visible comments) — this rule fires unchanged for a bot-resolved actor |
| Nota state transitions | `avanzarNota`, `recibirDeTaller`, `entregarNota`, `cancelarNota` — `notas.ts`, all `actor`-gated, invariants (QA checklist, exit-taller-only-via-recibirDeTaller) already enforced |
| Tokenless customer read | `seguimientoPorToken(token)` — `notas.ts:180`, precedent for "no session, still scoped" |
| Permission check | `can(actor.role, "resource:action")` — `src/lib/roles.ts`, `Actor = { id, email, name, role, tallerId }` — `guard.ts:13` |
| Audit trail | `recordAudit(...)` — `src/lib/server/audit.ts:22` |
| Customer phone records | `src/lib/server/cliente-telefonos.ts` (`listTelefonos`, `crearTelefono`, ...) |
| Outbound push notifications | `notificar()` / `avisarClienteDeNota()` — `src/lib/server/notificaciones.ts`; `enviarPush`/`enviarCorreoCliente` are the exact fan-out shape `enviarChat` (new, in scope) slots into |
| Encrypted third-party credentials | `ajuste` table + `valorAjuste`/`guardarAjustes` — `src/lib/server/ajustes.ts`, `src/lib/ajustes.ts` (the `ClaveAjuste` registry) — same pattern PAC/Correo already use, WhatsApp/Telegram credentials follow it too |
| `cita.origen` | free `VarChar(16)` (`"publico" | "panel"`), not an enum — safe to add `"whatsapp"`/`"telegram"` without a schema change beyond the value itself |

No WhatsApp/Telegram SDK currently installed; the only existing "WhatsApp" code is `waHref()`
in `src/lib/empresa.ts` — a `wa.me` deep-link builder, not an integration.

## Architecture: channel adapters, not new domain logic

```
WhatsApp Cloud API  ──┐
                       ├─▶ webhook route ─▶ identity resolve ─▶ conversation step ─▶ domain function
Telegram Bot API    ──┘
```

New code lives in a new **channel layer**, thin and separate from business logic:

```
src/lib/server/canales/
  identidad.ts        # resolve (canal, idExterno) -> Actor | Cliente | "desconocido"
  conversacion.ts      # multi-turn state machine for booking (shared by both providers)
  whatsapp.ts           # Meta Cloud API client: send text/template/media, verify webhook signature
  telegram.ts           # Telegram Bot API client: sendMessage/sendPhoto, verify secret token

src/routes/api/whatsapp/webhook/+server.ts   # GET (Meta verification handshake) + POST (inbound)
src/routes/api/telegram/webhook/+server.ts    # POST (inbound); Telegram has no GET handshake
```

Each webhook route: verify the request is genuinely from the provider → normalize the payload
into `{ canal, idExterno, texto, adjuntos, boton? }` → resolve identity → route intent → call
the *existing* domain function → reply via the channel client. Business rules never move into
this layer — it only orchestrates.

### Identity: two different trust models, matching who's allowed to do what

**Customers (booking a cita)** — low stakes, already public via Turnstile today:
- New table `canal_identidad` (below) maps `(canal, idExterno)` → `clienteId?`.
- First contact: try to match the incoming phone number against `cliente_telefono` (existing
  table via `cliente-telefonos.ts`); if found, link and greet by name. If not, proceed as a new
  prospective customer — same as an anonymous web visitor hitting `/citas` today.
- Anti-abuse: the *provider's own webhook signature* (Meta `X-Hub-Signature-256` HMAC /
  Telegram `X-Telegram-Bot-Api-Secret-Token`) replaces Turnstile as the "is this really the
  provider" gate. Still add a small per-`idExterno` rate limit (e.g. N messages/minute) — no
  generic rate limiter exists yet in `src/lib/server/`, so this is new, small, and scoped to
  the webhook routes only.

**Employees/mechanics (comments, state changes)** — high stakes, must stay deny-by-default:
- Never auto-trust an inbound phone/chat id for a privileged action. Linking is **admin- or
  self-service-initiated from inside the panel**, not from chat: `/panel/usuarios` gains a
  "Vincular WhatsApp/Telegram" action that generates a short-lived one-time pairing code; the
  employee sends that code to the bot once, which links `idExterno` → `usuarioId` in
  `canal_identidad`. After that, `identidad.ts` resolves an `Actor` with the usuario's real
  `role`/`tallerId`, and every subsequent bot action goes through `can(actor.role, ...)` exactly
  like the panel does — no new authorization path to audit.

### Conversation state (webhooks are stateless HTTP calls)

Booking a cita needs several fields (`nombre`, `telefono`, `motivo`, `fecha`, `franja`, `tipo`,
same shape `solicitarCita` already validates) gathered over multiple messages. New table:

```
conversacion_estado {
  id            String  @id @default(cuid())
  canal         String  @db.VarChar(16)
  idExterno     String  @db.VarChar(64)
  paso          String  @db.VarChar(32)   // e.g. "esperando_fecha"
  datos         Json                       // partial body accumulated so far
  expiraAt      DateTime
  @@unique([canal, idExterno])
}
```
Expired/abandoned conversations just get overwritten on the next message — no cleanup job
needed for a first version.

### One small refactor needed: `solicitarCita` couples validation to Turnstile

`solicitarCita(input: { body, turnstileToken, ip })` currently does anti-bot check + validation
+ create in one function. The bot path is authenticated differently (webhook signature +
conversation completion), not by Turnstile. Split it:
- Extract the existing validation/creation body into an unexported `crearCitaPublicaValidada(body, origen)`.
- `solicitarCita(...)` keeps the public form's shape: verify Turnstile, then call the shared core with `origen: "publico"`.
- New `solicitarCitaPorCanal(input: { body, canal, idExterno })` calls the same shared core with `origen: canal`, after `conversacion.ts` confirms the gathered fields are complete.

This is the only change to existing domain logic — everything else (`comentarNota`,
`avanzarNota`, etc.) is called as-is.

## Schema changes (new migration)

```prisma
model canal_identidad {
  id            String    @id @default(cuid())
  canal         String    @db.VarChar(16)   // "whatsapp" | "telegram"
  idExterno     String    @db.VarChar(64)   // WhatsApp: E.164 phone. Telegram: numeric chat_id — see note below.
  nombreCanal   String?   @db.VarChar(64)   // Telegram @username, display-only, never the lookup key
  clienteId     String?
  usuarioId     String?
  verificadoAt  DateTime  @default(now())
  cliente       cliente?  @relation(fields: [clienteId], references: [id])
  usuario       usuario?  @relation(fields: [usuarioId], references: [id])
  @@unique([canal, idExterno])
}

model conversacion_estado {
  id        String    @id @default(cuid())
  canal     String    @db.VarChar(16)
  idExterno String    @db.VarChar(64)
  paso      String    @db.VarChar(32)
  datos     Json
  expiraAt  DateTime
  @@unique([canal, idExterno])
}
```
Standard reminder that applies here: run `prisma migrate dev` locally **and** deploy the same
migration to the Neon production database — never hand-edit Neon directly.

## Credentials: `ajustes`, not `.env` — same as Facturación (PAC) and Correo (Resend)

Checked `src/lib/server/ajustes.ts` and `.env.example`: PAC and Resend credentials are
deliberately **not** environment variables. They're rows in the `ajuste` table (`clave`,
`valor`, `cifrado`, `pista`), encrypted with AES-256-GCM under `AJUSTES_SECRET_KEY` (the one env
var that stays), captured through the generic `/panel/ajustes` screen, and read via
`valorAjuste`/`valoresAjuste`. That's the established pattern here, not raw env vars — so
WhatsApp/Telegram credentials follow it exactly:

- Add new `ClaveAjuste` registry entries (in `src/lib/ajustes.ts`, same file that defines the
  PAC/Correo keys) grouped under e.g. `"Canales"`: `whatsapp_token`, `whatsapp_phone_id`,
  `whatsapp_app_secret`, `whatsapp_verify_token`, `telegram_bot_token`,
  `telegram_webhook_secret` — each `secreto: true`.
- No new UI code: `/panel/ajustes` is metadata-driven off that registry already, same as it is
  for PAC/Correo today.
- Same access gate as PAC/Correo (`requireDueno` / `OWNER_EMAILS`-narrowed `ajustes:manage`).
- Webhook routes read them with `valorAjuste("whatsapp_verify_token")` etc. at request time,
  same call shape `factura-com.ts` uses for `cfg.apiKey`. Missing/undecryptable credential →
  501/503, fail closed — same as PAC and Web Push already do, never a silent no-op for a
  security-relevant check (verify token / webhook signature). Outbound *sending* failing closed
  is not required — same "degrade, don't block the underlying action" treatment as Correo/Web
  Push (see the outbound-notifications section below).
- `AJUSTES_SECRET_KEY` (already exists) is the only actual env var involved.

## Telegram identity — do we need to link a username?

**No.** A Telegram username is optional (many users don't set one), mutable, and never
guaranteed unique-forever the way a numeric id is. Every webhook update — including the
pairing-code message — carries a stable numeric `chat_id` (`update.message.chat.id` /
`update.message.from.id`, same value for a private 1:1 chat), and that's what
`sendMessage`/`sendPhoto` target and what `canal_identidad.idExterno` stores. `nombreCanal`
(the `@username`, when present) is captured only as a display label — e.g. so `/panel/usuarios`
can show "linked as @juanperez" — and is never the lookup key. The pairing flow needs nothing
from the employee except "send this code to the bot"; Telegram hands over the `chat_id` for
free with that message.

## Outbound notifications — WhatsApp/Telegram as a channel in `notificar()`

In scope now, not deferred. `src/lib/server/notificaciones.ts:notificar()` already fans an event
out to multiple channels from one call site: it writes the `notificacion` row, calls
`enviarPush(...)`, and — for a curated subset of `cliente_*` events flagged
`def.correoCliente` — calls `enviarCorreoCliente(...)`. Chat is a new sibling of those two, same
shape:

- **Staff side** (`notificacion_preferencia`, currently `enApp`/`push` booleans, default-on when
  the row is absent): add a `chat Boolean @default(true)` column. `notificar()` computes
  `conChat` the same way it already computes `conPush`, then calls a new `enviarChat({ userIds:
  conChat, clienteIds }, base)`.
- **Customer side**: mirror `def.correoCliente` with a new `def.chatCliente` flag on the
  relevant `NOTIFICACION_EVENTOS` entries (e.g. `cliente_nota_lista`) in
  `src/lib/server/notificaciones.ts` / wherever that catalogue is defined.
- **`enviarChat()`** (new, next to `enviarPush`): for each `userId`/`clienteId`, look up
  `canal_identidad` rows; for each linked channel, call `whatsapp.ts`/`telegram.ts`'s send
  function with `titulo`/`cuerpo`/`url` (built into the deep link the same way
  `avisarClienteDeNota` already does for `seguimiento/<token>`). No identity linked → skip, same
  as push silently no-ops for a user with no subscription today. Failures logged, never thrown —
  matches the existing `try/catch` wrapping all of `notificar()` ("a notification that failed to
  send is not a reason to fail the work it was about").

**WhatsApp-specific constraint that affects rollout order:** Cloud API only allows free-form
business-initiated text within a 24-hour window after the customer last messaged the bot.
Outside that window (the common case for a proactive "tu unidad está lista" ping), WhatsApp
requires a pre-approved **Message Template** — fixed, parametrized copy submitted to Meta for
review, days of lead time, not something this plan can ship day one. Telegram has no such
restriction: once a chat is linked, the bot can message it anytime, free-form. So:

## Telegram setup prerequisite: yes, a bot via @BotFather

Telegram has no self-serve developer console — the only way to get a bot account and its API
token is talking to **@BotFather** inside Telegram itself:

1. Message `@BotFather` → `/newbot` → give it a display name and a unique `...bot`-suffixed
   username (e.g. `Estacion360Bot`). BotFather replies with the bot token
   (`123456:ABC-...`) — that's `telegram_bot_token` in the `ajuste` registry above.
2. Optional but recommended: `/setdescription`, `/setuserpic`, `/setcommands` (e.g. register
   `/start`, `/cita`, `/vincular <codigo>` so they autocomplete for users) — all via BotFather
   chat commands, no separate portal.
3. Registering the webhook itself (`https://api.telegram.org/bot<token>/setWebhook`) is a plain
   HTTPS call this app makes once (from a setup script or an ajustes-page action), pointing at
   `src/routes/api/telegram/webhook/+server.ts` and passing `secret_token` = the stored
   `telegram_webhook_secret` — Telegram echoes that secret back on every update in the
   `X-Telegram-Bot-Api-Secret-Token` header, which is what the webhook route checks.
4. No approval wait, no business verification, no cost — this is why Telegram ships first.

WhatsApp's equivalent is heavier: a Meta Business/Developer account, a WhatsApp Business
Platform app, phone number registration, and (per the outbound section above) Message Template
review — all handled in phase 2, not a blocker for Telegram.

## Rollout order

1. **Telegram first**, end to end: identity linking, `solicitarCitaPorCanal` booking,
   `comentarNota` via a linked mechanic, and outbound `enviarChat`. No approval wait, no template
   system — proves the whole channel-adapter design (`identidad.ts`/`conversacion.ts` core)
   cleanly before WhatsApp's extra constraints enter the picture.
2. **WhatsApp Cloud API adapter** on the same core, `whatsapp.ts` client only, plus:
   - submit the initial Message Templates to Meta for review (e.g. "tu unidad está lista",
     "tu cita fue confirmada") well before this phase starts, since approval lead time is the
     long pole;
   - outbound `enviarChat` on WhatsApp uses a template call outside the 24h window, a plain
     message inside it (i.e. the customer messaged the bot recently, e.g. right after booking).
3. Inbound flows (booking, comments) ship per-channel as soon as that channel's adapter lands —
   no reason to gate Telegram's inbound flows on WhatsApp being ready.

## Verification

- Unit-level: `puedeTransicionarNota`/`can()` calls are unchanged — existing coverage for those
  still applies since the bot never bypasses them.
- New coverage needed: `conversacion.ts` step transitions (pure functions, easy to test in
  isolation like the existing `src/lib/notas.ts` state-machine tests), and a smoke test per
  webhook route using a captured sample payload from each provider's docs (signature
  verification, identity resolution, and one full booking round-trip against a test DB).
- Outbound: a test that `enviarChat` skips cleanly when no `canal_identidad` is linked (must not
  throw, matching `enviarPush`'s no-subscription no-op), and one exercising the WhatsApp
  template-vs-freeform branch.
- Manual: use Telegram's `/setWebhook` against a tunneled local dev URL (e.g. ngrok) to drive a
  real conversation end-to-end (booking, then a linked-mechanic comment, then an outbound
  `enviarChat` ping) before wiring WhatsApp; Meta's webhook has a required GET verification
  handshake to test first (`hub.challenge` echo), and outbound WhatsApp testing needs at least
  one approved Message Template in the test/business account.
