/**
 * The audit action registry. Every state-changing operation in the system appears here.
 *
 * Key format: `<entity>.<action>`. The label is what the Auditoría screen and its filter
 * dropdown show. Safe to import from the browser: data only.
 *
 * ADDING A CRUD OPERATION? Add its actions here in the same change that adds the
 * operation — see CLAUDE.md Rule 3. An unregistered action still records fine, it just
 * renders as its raw key and cannot be picked from the filter.
 */
export const AUDIT_ACTIONS = {
	"user.role_change": "Cambio de rol",
	"user.ban": "Usuario bloqueado",
	"user.unban": "Usuario desbloqueado",
	"invitation.create": "Invitación creada",
	"invitation.revoke": "Invitación revocada",
	"invitation.accept": "Invitación aceptada",
} as const satisfies Record<string, string>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** Entities that appear in the log, derived from the action keys. */
export const AUDIT_ENTITIES = [
	...new Set(Object.keys(AUDIT_ACTIONS).map((key) => key.split(".")[0])),
] as string[];

export const auditActionLabel = (action: string): string =>
	(AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
