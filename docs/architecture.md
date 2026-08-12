## Conventions

- Spanish for all user-facing copy and error messages. English for code and comments.
- Server-only code lives in `src/lib/server/` so SvelteKit refuses to bundle it clientward.
- `src/lib/server/bootstrap.ts` uses relative imports only — `prisma/seed.ts` runs it under
  tsx, where `$lib` and `$env` do not resolve.
- Comments explain _why_, not _what_. Mark deliberate shortcuts with a `ponytail:` comment
  naming the ceiling and the upgrade path.
