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
