# Estacion360 — Issues & Feature Requirements

Claude already has access to the codebase. Please review the existing architecture and implement the following requirements. **Do not make assumptions about the current implementation; inspect the relevant code, models, permissions, workflows, and UI components first.**

## 1. Role & Permission Management

Create an **admin-only screen for managing role permissions**.

Requirements:

* Only users with the `Admin` role should be able to access this screen.
* Administrators should be able to view all available permissions.
* Administrators should be able to enable/disable permissions for each role.
* The permission system should be designed so that **every new permission added to the application can be assigned and edited per role** without requiring a new hardcoded permission-management implementation.
* Update `CLAUDE.md` with this rule:

  > Every new application permission must be implemented through the centralized role/permission system and must be editable per role from the admin permission-management screen.
* Review the existing authorization checks and migrate/refactor them if necessary so this becomes the source of truth.

## 2. Automatic Cita Confirmation

A `Cita` should be **automatically confirmed** once all three required values have been assigned:

* `Unidad`
* `Cliente`
* `Hora`

The confirmation should happen automatically when the third required value is assigned.

Please verify the existing Cita state/status workflow before implementing this so we don't introduce conflicting states.

## 3. Operator — Entregar Unidad

The `Operator` role should have permission to perform the **"Entregar Unidad"** action.

Requirements:

* Add the appropriate permission to the centralized permission system.
* Show the action only when the operator has the required permission.
* Ensure the backend authorization also allows the operation.
* Do not rely solely on hiding the UI button for security.

## 4. Estacion360 Bank Account Catalogue

Add a catalogue for **Estacion360 bank accounts**.

The catalogue should support, at minimum:

* Bank
* Account holder / owner
* CLABE
* Account number
* Additional relevant banking information if the existing architecture supports it
* Active/inactive status

Administrators should be able to manage these accounts.

### Cotizaciones

The selected/appropriate Estacion360 bank account information should be displayed in **cotización emails**.

Please inspect the existing cotización email generation flow and integrate the catalogue rather than hardcoding banking information into email templates.

## 5. Nota — Checklist de Entrega

In the **Nota** screen, add a button:

**"Checklist Entrega"**

Clicking this button should open the existing drawer pattern (or create a consistent drawer if one does not exist) where the user can complete the delivery checklist associated with the unit/nota.

Please reuse existing UI components, validation, persistence patterns, and permissions where possible.

## 6. Cita Drawer — Unidad Service History

In the **Cita Drawer**, when a `Unidad` is selected, display the service history for that unit.

The history should show relevant previous:

* Notas de servicio
* Dates
* Work performed
* Relevant status information
* Warranty information, when applicable

### Link Previous Work to New Nota

When the Cita generates a new `Nota`, the user should be able to:

1. Review previous service notes for the selected unit.
2. Select/link previous work that is relevant to the new Nota.
3. Indicate that the new work is a **"Garantía"** / warranty follow-up.
4. Preserve the relationship between the new Nota and the previous Nota/work that originated the warranty follow-up.

Please design the data relationship properly rather than simply storing a text reference.

## 7. Warranty History

We need a clear way to review previous notes specifically for **warranty purposes**.

A user should be able to determine:

* Which previous work was performed.
* Which work resulted in a warranty follow-up.
* Which Nota originated the warranty.
* Which subsequent Nota resolved or continued the warranty issue.
* The current status of the warranty-related work.

This should be accessible from the relevant Nota/Unidad workflow without requiring users to manually search through all historical notes.

## 8. Company Contact Information

Add an administration/configuration area where authorized users can modify Estacion360's contact information.

At minimum:

* Phone number
* Contact information currently displayed throughout the application
* Any other company contact fields that are currently hardcoded and should logically be configurable

Please search the codebase for existing hardcoded phone numbers/contact information and migrate those values to the appropriate configuration/company settings where applicable.

## 9. Utility Margin %

For all relevant costs/prices throughout the application, show the **utility/profit margin percentage**.

The calculation should clearly distinguish between:

* Cost
* Sale price / revenue
* Utility/profit
* Utility margin %

Use the correct margin formula:

`Utility Margin % = ((Sale Price - Cost) / Sale Price) × 100`

Do not confuse margin with markup.

Apply this consistently wherever costs and sale prices are displayed, especially in quotations and other financial views where users need to understand profitability.

## General Implementation Requirements

Before implementing:

1. Inspect the existing database schema and relationships.
2. Inspect the current authentication and authorization system.
3. Inspect existing roles and permissions.
4. Inspect the Cita → Nota workflow.
5. Inspect existing drawers, catalogues, forms, and admin screens.
6. Identify existing company/contact configuration.
7. Identify where costs, prices, and margins are currently calculated.
8. Reuse existing patterns instead of introducing duplicate architectures.

For every feature:

* Implement both frontend and backend authorization where applicable.
* Add/update database migrations and types as necessary.
* Preserve existing functionality.
* Follow the project's existing UI/UX conventions.
* Add appropriate validation.
* Avoid hardcoded business rules when they should be configurable.
* Add tests for important business logic and authorization rules.

After implementation, perform a full review of the affected flows and verify that the new role/permission architecture makes **future permissions editable per role by default**.
