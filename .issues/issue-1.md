# Prompt: Implement Cross-Platform Notification System

Your task is to design and implement a robust notification system for this project.

## Before writing any code

**First, perform a complete analysis of the existing codebase. Do not assume anything.**

Review and document:

* Project architecture
* Framework(s) and versions
* Existing authentication flow
* Database schema
* Existing notification or messaging features
* Background jobs / queues
* Service Worker implementation (if any)
* Push notification implementation (if any)
* Browser compatibility considerations
* Build system
* Deployment environment
* Any existing third-party integrations

After the analysis, determine whether the proposed solution is compatible with the current architecture.

If you identify conflicts, explain them and propose the least disruptive solution.

**Do not introduce unnecessary dependencies or rewrite existing architecture if a simpler integration is possible.**

---

## Compatibility Review

Before implementation, verify:

* Is the solution compatible with the current framework?
* Is it compatible with the authentication system?
* Is it compatible with the deployment platform?
* Is it compatible with modern browsers?
* Will it work on Chromium browsers?
* Will it work on Firefox?
* What level of support exists for Safari (desktop and iOS)?
* Does the project already contain a Service Worker that should be extended instead of replaced?
* Are there any security concerns?
* Are there any performance concerns?
* Does this solution fit naturally into the existing project?

If a better implementation exists based on the existing codebase, choose that instead and explain why.

---

## Usability Review

Do not focus only on technical implementation.

Evaluate the user experience.

Questions to answer:

* Is requesting notification permission at this point appropriate?
* Is the onboarding experience smooth?
* Can users easily enable or disable notifications?
* Can users manage multiple devices?
* What happens when notification permission is denied?
* What happens when a subscription expires?
* Are error messages clear?
* Is the implementation intuitive for both employees and customers?

Recommend UX improvements whenever appropriate.

---

# Goal

Implement a notification system capable of notifying both:

* Internal employees
* Customers

The system should support:

* Browser push notifications
* In-app notifications
* Multiple devices per user
* Read/unread status
* Notification history
* Notification preferences
* Graceful fallback when browser push is unavailable

---

# Browser Push

Use the native Web Push API.

Implement:

* Service Worker registration
* Push subscription
* Subscription renewal
* VAPID keys
* Secure backend endpoints
* Subscription persistence
* Notification delivery
* Notification click handling

Store subscriptions per device.

Users may have multiple subscriptions simultaneously.

---

# In-App Notification Center

Create a notification center containing:

* Unread badge
* Notification history
* Read status
* Mark as read
* Mark all as read
* Optional notification categories
* Timestamp
* Deep links into the application

Notifications should continue to exist even if browser notifications are disabled.

---

# Suggested Notification Events

Customer:

* Appointment confirmed
* Appointment reminder
* Vehicle checked in
* Inspection completed
* Estimate available
* Estimate approved
* Parts ordered
* Parts received
* Repair started
* Repair completed
* Vehicle ready for pickup
* Invoice generated
* Payment received

Employee:

* New appointment
* Customer arrived
* New work order assigned
* Estimate approved
* Estimate rejected
* Parts arrived
* Job reassigned
* Technician mentioned
* High priority job
* Payment received
* Vehicle picked up

---

# Database

Design a normalized schema for:

* Notifications
* Notification preferences
* Push subscriptions
* Delivery status
* Read status

Support multiple devices per user.

---

# API Design

Create clean backend APIs for:

* Register subscription
* Remove subscription
* Send notification
* Mark notification as read
* List notifications
* Update preferences

Ensure APIs follow existing project conventions.

---

# Security

Validate:

* User authorization
* Ownership of subscriptions
* Rate limiting where appropriate
* CSRF considerations
* Authentication on all endpoints
* Proper validation of payloads

---

# Performance

Minimize:

* Database queries
* Duplicate notifications
* Unnecessary Service Worker updates
* Network requests

Batch operations where appropriate.

---

# Code Quality

Produce production-ready code.

The implementation should be:

* Modular
* Maintainable
* Type-safe
* Well documented
* Consistent with the existing project structure

Reuse existing utilities whenever possible.

Avoid duplicated logic.

---

# Deliverables

Provide:

1. Codebase analysis.
2. Compatibility assessment.
3. UX assessment.
4. Implementation plan.
5. Database changes.
6. API design.
7. Service Worker implementation.
8. Frontend implementation.
9. Backend implementation.
10. Testing strategy.
11. Browser compatibility notes.
12. Future improvement recommendations.

Think like a senior software architect. Prioritize compatibility with the existing codebase, usability for end users, maintainability, and long-term scalability over introducing unnecessary complexity.

---

# ✅ COMPLETADO — 2026-08-05

Implementado en su totalidad. Nada commiteado a git.

## 1. Análisis del código existente

| Área | Hallazgo |
| --- | --- |
| Arquitectura | SvelteKit 2 + Svelte 5 (runes), TypeScript, rutas server-first |
| Framework | `@sveltejs/kit` 2.57, `svelte` 5.55, Vite 8, Tailwind v4 CSS-first |
| Autenticación | Better Auth + plugin `admin`. **Solo por invitación**, `disableSignUp: true`. `session.cookieCache` apagado |
| Base de datos | PostgreSQL + Prisma 7 (adaptador `pg`), generador `prisma-client` a `src/generated/prisma` |
| Notificaciones previas | **Ninguna.** `deliverInvitation` es un no-op deliberado; era la única costura |
| Jobs / colas | **No existen.** Sin cron, sin worker, sin scheduler |
| Service Worker | **No existía.** `static/` sólo tenía `robots.txt` |
| Push | No existía. VAPID tampoco |
| Build | `prisma generate && vite build`; `adapter-auto` (detecta Vercel al desplegar) |
| Integraciones | Cloudflare Turnstile, Cloudflare R2 (SigV4 a mano), Better Auth |

## 2. Compatibilidad

- **Framework:** compatible. Service worker vía `src/service-worker.ts`, soporte nativo de SvelteKit.
- **Auth:** compatible sin tocarla. Las suscripciones del personal cuelgan de `user`; el dueño se
  toma de la sesión, nunca del body.
- **Despliegue:** compatible con serverless. El envío es un `fetch` por dispositivo con timeout, sin
  proceso de fondo. `notificar()` no arroja y corre después del commit.
- **Navegadores:** Chromium ✅ · Firefox ✅ · Safari macOS 16+ ✅ · **iOS 16.4+ sólo como PWA
  instalada** — detectado y explicado en la UI en vez de un botón muerto.
- **Service Worker existente:** no había ninguno que extender.
- **Seguridad:** ver §6. Sin dependencias nuevas (Regla 7): RFC 8291/8292 a mano sobre `node:crypto`,
  fijado al vector publicado del RFC **y** verificado descifrando como lo hace un navegador.
- **Rendimiento:** el badge sale de un `COUNT` en el layout; la lista sólo se carga con el cajón
  abierto. Un `findMany` por difusión y un `createMany`. Sin polling ni SSE.

**Conflicto real encontrado y resuelto:** *los clientes no tienen cuenta*. No hay registro público,
así que una suscripción de cliente no puede colgar de una sesión. Solución de menor impacto: token
opaco de 256 bits por `nota_servicio` → `/seguimiento/<token>`. Cero cambios a la autenticación.

## 3. UX

- **Momento del permiso:** sólo tras un tap, nunca al cargar. Un prompt en carga es la forma más
  rápida de quedar bloqueado para siempre.
- **Onboarding:** el cliente llega por WhatsApp a una página que ya le sirve; activar avisos es
  opcional y está junto al estado de su unidad, donde el valor es obvio.
- **Activar/desactivar:** por dispositivo, en `/panel/notificaciones` (personal) y en la página de
  seguimiento (cliente). Lista de dispositivos con baja individual.
- **Multi-dispositivo:** sí, hasta 20 por destinatario, con etiqueta legible ("Chrome en Android").
- **Permiso denegado:** mensaje propio explicando cómo revertirlo desde el candado del navegador.
- **Suscripción caducada:** 404/410 del servicio de push borra la fila en el acto.
- **Sin push:** la bandeja sigue completa. Es la degradación, no un 503.

## 4–9. Implementación

| | |
| --- | --- |
| Migración | `20260805120000_notificaciones_y_registro_talleres` — 3 tablas nuevas, CHECKs, índice único parcial, backfill |
| Registro de eventos | `src/lib/notificaciones.ts` (19 eventos, audiencia + alcance + permiso) |
| Cripto | `src/lib/webpush.ts` (puro) · `src/lib/server/push.ts` (entrega) |
| Dominio | `src/lib/server/notificaciones.ts` |
| API | `/api/notificaciones`, `/leer`, `/preferencias`, `/api/push`, `/api/seguimiento/[token]` |
| Service Worker | `src/service-worker.ts` — sólo push y click, **sin caché** |
| Cliente | `src/lib/push-cliente.ts` · `PushToggle` · `NotificationBell` · `NotificationDrawer` |
| Pantallas | `/panel/notificaciones` · `/seguimiento/[token]` |
| Emisión | citas, notas, taller/QA, cotizaciones, facturas, pagos, comentarios visibles |

Eventos del prompt **no** implementados, con motivo: *recordatorio de cita* (necesita un scheduler,
que este proyecto no tiene) y *refacciones pedidas/recibidas* (no existe módulo de refacciones).

## 10–11. Pruebas y navegadores

- `scripts/check-push.ts` — 15 verificaciones. Vector del RFC 8291 §5, descifrado como navegador,
  JWT VAPID verificado, coherencia del registro de eventos.
- 16 verificaciones con SQL crudo contra la base (constraints, no la app).
- 37 verificaciones e2e contra el servidor: permisos, aislamiento de bandejas, propiedad de
  dispositivos, y que **el taller aliado no aparece** en el JSON ni en el HTML del cliente.
- `npm run check` 0 errores · `npm run build` limpio.

## 12. Siguientes pasos sugeridos

1. Recordatorios de cita — necesitan un scheduler (cron de Vercel o similar).
2. Digest por correo para quien apaga el push.
3. WhatsApp como canal, reusando la misma costura.
4. Rate limiting por IP en `/api/seguimiento/[token]` si el token llegara a filtrarse.
