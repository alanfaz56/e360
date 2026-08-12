# Estación 360 — Claude Project Constitution

## Purpose

Estación 360 is a business application. Preserve existing behavior and business
invariants unless the task explicitly changes them.

## Stack

Use the project's existing stack and patterns. Do not replace frameworks,
libraries, persistence layers, or architectural conventions without explicit
approval. Inspect the repository before making assumptions.

## Core Rules

### Inspect Before Coding
1. Inspect the relevant existing implementation.
2. Find the domain functions, database models, server actions/APIs, and tests involved.
3. Reuse established patterns.
4. Make the smallest change that satisfies the request.
5. Do not invent architecture that already exists elsewhere.

### Permissions and Authorization
- Permissions are deny-by-default.
- Every new capability requiring authorization must have an explicit permission.
- The centralized permission registry is the source of truth.
- New permissions must be assignable/editable per role through the admin permission system.
- Enforce authorization server-side.
- UI visibility checks are not security controls.
- Do not hard-code role strings when a permission check should be used.
- Do not create admin bypasses that weaken the permission model.

See `docs/permissions.md`.

### Security
- Never trust client-submitted ownership, roles, IDs, prices, totals, or state.
- Validate authorization and important invariants on the server.
- Validate input before database writes.
- Never spread arbitrary request bodies directly into database writes.
- Never expose secrets or privileged credentials to the client.
- Fail closed for security-sensitive configuration.
- Preserve audit requirements for sensitive operations.

See `docs/security.md`.

### Domain Logic
Business rules belong in shared server/domain functions rather than being
duplicated across pages, forms, APIs, or components.

Prefer:
UI → server action/API → domain function → database

Avoid bypassing domain functions with direct table writes.

### Database and Transactions
- Preserve existing schema and relationships.
- Enforce important business invariants at the database level when practical.
- Use transactions when multiple changes must be atomic.
- Avoid duplicated business rules across independent code paths.

### Money
- Use the project's integer/bigint representation for monetary arithmetic.
- Never use floating point for monetary calculations.
- Recompute authoritative totals server-side.
- Treat client-provided totals as untrusted.

See `docs/billing.md`.

### State Transitions
Represent business state transitions explicitly.
- Reject invalid transitions server-side.
- Do not create separate transition rules for different UI paths.
- Preserve audit/history behavior where the application already records it.

### Progressive Enhancement
Forms and important workflows should continue to work without JavaScript
unless the feature explicitly requires JavaScript.

JavaScript enhances UX; it is not the security boundary.

### Testing
When changing a business invariant:
- Update or add the relevant tests/checks.
- Preserve existing regression coverage.
- Do not remove a test merely to make an implementation pass.

### Documentation
Detailed subsystem behavior is stored under `docs/`. Consult the relevant
document before modifying that subsystem.

- `docs/permissions.md`
- `docs/appointments.md`
- `docs/billing.md`
- `docs/inventory.md`
- `docs/notifications.md`
- `docs/security.md`
- `docs/architecture.md`
- `docs/customers.md`
- `docs/workshops.md`
- `docs/service-notes.md`

If a more specific instruction file exists in a subdirectory, follow it too.

## Change Discipline
Do not clean up unrelated code while implementing a task.
Do not silently change business behavior.
If a requested change conflicts with an existing invariant, identify the
conflict and resolve it explicitly rather than weakening the invariant.

## Definition of Done
1. Verify the changed behavior.
2. Run the narrowest relevant tests/checks.
3. Check authorization and ownership paths.
4. Check regressions in affected workflows.
5. Update relevant documentation when behavior or invariants changed.
