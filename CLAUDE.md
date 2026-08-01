# Estación 360 — Sistema de administración de taller

SaaS to run the Estación 360 mechanic shop (Hermosillo, Sonora). Priorities, in order:
**speed**, **compatibility**, **integrability with other programs**.

## Stack

| Layer     | Technology                                    |
| --------- | --------------------------------------------- |
| Framework | SvelteKit 2 + Svelte 5 (runes mode enforced)  |
| Language  | TypeScript                                    |
| Styling   | Tailwind CSS v4, CSS-first `@theme`           |
| ORM       | Prisma 7 (`pg` adapter)                       |
| Database  | PostgreSQL                                    |
| Auth      | Better Auth + `admin` plugin                  |

---

## Rule 1 — Every new function needs its permissions confirmed by role, before it is written

There are exactly four roles. They are fixed; do not invent a fifth without being told.

| Role      | Key         | Rank |
| --------- | ----------- | ---- |
| Admin     | `admin`     | 1    |
| Gerente   | `gerente`   | 2    |
| Operador  | `operador`  | 3    |
| Taller Mecánico | `taller` | 4 |

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

| Action                              | Helper           | Rule                                       |
| ----------------------------------- | ---------------- | ------------------------------------------ |
| Inviting a **new** user             | `canAssignRole`  | Strictly below your own rank. No exceptions |
| Re-ranking an **existing** user     | `settableRoles`  | Admin only, any role **including Admin**    |

Promotion to Admin is possible only through the second path. That is deliberate: without
it, a second Admin could only ever come from re-running the seed.

### Lockout guards

Role changes go through `changeUserRole` in [src/lib/server/users.ts](src/lib/server/users.ts),
which enforces two rules that exist purely to keep you from locking yourself out:

1. **No self-demotion.** Nobody can change their own role, ever. Another Admin has to.
2. **Never zero Admins.** The count is taken *after* the write, inside a transaction that
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
runs *after* the password is verified. Reaching that error therefore proves the caller owns
the account. A wrong password on a locked account still gets the generic
"Correo o contraseña incorrectos". **Never move the lockout check before password
verification, and never surface `lockoutNotice` from anywhere but that error path.**

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

| Component      | Use for                                                    |
| -------------- | ---------------------------------------------------------- |
| `Button`       | Every action. Renders `<a>` with `href`, `<button>` without |
| `Field`        | Label + control + hint. Pass `children` for a `<select>`     |
| `DataTable`    | Any table. Owns the scroll container and header row          |
| `Badge`        | Status pills                                                 |
| `PageHeader`   | Section title + description + action buttons                 |
| `EmptyState`   | "Nothing here yet" panels                                    |
| `Drawer`       | Anything that would otherwise have been a modal              |
| `Icon`         | Icon lookup by serializable key, for nav data                |

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
import UserPlus from '@lucide/svelte/icons/user-plus';   // yes
import { UserPlus } from '@lucide/svelte';               // no
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

1. `npx prisma db seed` — bootstraps the first Admin (`alan@maieutica.mx`) into an empty DB.
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
```

## Conventions

- Spanish for all user-facing copy and error messages. English for code and comments.
- Server-only code lives in `src/lib/server/` so SvelteKit refuses to bundle it clientward.
- `src/lib/server/bootstrap.ts` uses relative imports only — `prisma/seed.ts` runs it under
  tsx, where `$lib` and `$env` do not resolve.
- Comments explain *why*, not *what*. Mark deliberate shortcuts with a `ponytail:` comment
  naming the ceiling and the upgrade path.
