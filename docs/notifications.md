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
