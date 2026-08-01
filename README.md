# SaaS Starter

A minimal SvelteKit SaaS starter with PostgreSQL, Prisma, Better Auth, Tailwind CSS, and TypeScript.

## Stack

| Layer          | Technology                          |
|----------------|-------------------------------------|
| Framework      | SvelteKit 5 (Svelte 5 runes mode)   |
| Language       | TypeScript                          |
| Styling        | Tailwind CSS v4                     |
| ORM            | Prisma v7                           |
| Database       | PostgreSQL (via `pg` adapter)       |
| Auth           | Better Auth                         |
| Formatter      | Prettier + prettier-plugin-svelte   |

## Prerequisites

- Node.js 20+
- A running PostgreSQL instance

## Getting Started

### 1. Clone and install

```sh
git clone <your-repo-url> my-project
cd my-project
npm install
```

### 2. Configure environment

Copy the example env file and fill in your values:

```sh
cp .env.example .env
```

| Variable             | Description                                       |
|----------------------|---------------------------------------------------|
| `DATABASE_URL`       | PostgreSQL connection string                      |
| `BETTER_AUTH_SECRET` | Random secret (32+ chars) for signing auth tokens |

Generate a secret with: `openssl rand -hex 32`

### 3. Set up the database

Run migrations and generate the Prisma client:

```sh
npx prisma migrate dev
npx prisma generate
```

To seed the database (optional):

```sh
npx prisma db seed
```

To open Prisma Studio (visual DB browser):

```sh
npx prisma studio
```

### 4. Start the dev server

```sh
npm run dev
```

## Scripts

| Command              | Description                          |
|----------------------|--------------------------------------|
| `npm run dev`        | Start dev server                     |
| `npm run build`      | Build for production                 |
| `npm run preview`    | Preview production build             |
| `npm run format`     | Format all files with Prettier       |
| `npm run check`      | Type-check with svelte-check         |

## Project Structure

```
src/
├── generated/prisma/        # Auto-generated Prisma client (do not edit)
├── lib/
│   ├── prisma.ts            # Prisma client singleton
│   ├── auth.ts              # Better Auth server instance
│   └── auth-client.ts       # Better Auth browser client
├── hooks.server.ts          # Attaches user/session to event.locals
└── routes/
    └── api/auth/[...all]/   # Better Auth catch-all API route
prisma/
├── schema.prisma            # Database schema (includes auth tables)
├── migrations/              # Migration history
└── seed.ts                  # Optional seed script
```

## Authentication

Better Auth is set up with email/password enabled. The auth tables (`user`, `session`, `account`, `verification`) are already in `prisma/schema.prisma`.

### Using auth in server routes

```ts
// +page.server.ts
export const load = async ({ locals }) => {
    const { user } = locals; // null if not logged in
    return { user };
};
```

### Using auth in components

```ts
import { useSession, signIn, signOut, signUp } from '$lib/auth-client';

const session = useSession(); // reactive — $session.data?.user
```

### Adding OAuth providers

Extend `src/lib/auth.ts`:

```ts
socialProviders: {
    github: { clientId: GITHUB_CLIENT_ID, clientSecret: GITHUB_CLIENT_SECRET }
}
```

## When Forking

Checklist for starting a new project from this starter:

- [ ] Update `name` in `package.json`
- [ ] Copy `.env.example` to `.env` and fill in values
- [ ] Run `npx prisma migrate dev --name init` to create the initial migration
- [ ] Run `npx prisma generate` to regenerate the client
- [ ] Add your own models to `prisma/schema.prisma`
- [ ] Choose and install an adapter — see [SvelteKit adapters](https://svelte.dev/docs/kit/adapters)

## Recommendations

### Email
**[Resend](https://resend.com/)** — simple transactional email API with a clean TypeScript SDK. Integrates with Better Auth for verification/password reset emails.

```sh
npm install resend
```

### Payments
**[Stripe](https://stripe.com/)** — add billing, subscriptions, and webhooks.

```sh
npm install stripe
```

### Linting
**ESLint** with the Svelte plugin catches bugs Prettier won't.

```sh
npm install --save-dev eslint eslint-plugin-svelte @typescript-eslint/eslint-plugin
```

### Pre-commit hooks
**Husky + lint-staged** — run format/lint before every commit.

```sh
npm install --save-dev husky lint-staged
npx husky init
```

### Local database (Docker)
A `docker-compose.yml` for a local Postgres instance:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

Then use `DATABASE_URL="postgres://postgres:postgres@localhost:5432/dev"` in `.env`.
