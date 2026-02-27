# Pancakemaker

*Stack your expenses. Keep your data.*

A personal and business expense tracker that works offline-first with optional cloud sync. Built as a PWA with an in-browser SQLite database, so your data stays on your device until you choose to sync. Open-source and privacy-respecting — no account required to start tracking.

**[Try the demo](https://demo.pancakemaker.com)** — explore with 7 pre-built spending personas, no sign-up needed.

## Features

- **Offline-first** — All data stored locally in wa-sqlite (IndexedDB-backed). Works without a network connection. No account required
- **Privacy by default** — Your data lives on your device. Cloud sync is opt-in, never forced
- **Open-source** — MIT licensed. Audit the code, self-host, or contribute
- **Recurring expenses** — Auto-generated monthly or annual expenses that keep your subscriptions and bills tracked
- **Dual tracking** — Separate personal and business expense routes with independent categories and panels
- **Panels** — Flexible containers for grouping expenses (monthly budgets, trips, projects)
- **Categories** — Color-coded spending categories with per-route customization
- **Multi-currency** — Track expenses in 33 currencies with daily exchange rates from Frankfurter API
- **Inline editing** — Click any expense amount or description to edit in place
- **Cloud sync** — Optional bidirectional sync via Cloudflare Workers + D1
- **Magic link auth** — Passwordless email authentication for sync
- **Export** — Download all expenses as CSV or JSON
- **PWA** — Installable on mobile and desktop, works like a native app

## Tech Stack

| Layer              | Technology                                           |
| ------------------ | ---------------------------------------------------- |
| Frontend           | React 19, React Router v7, Tailwind CSS v4, Recharts |
| Database (browser) | wa-sqlite with IndexedDB persistence                 |
| Backend            | Cloudflare Workers, Hono.js, Cloudflare D1           |
| Shared             | TypeScript, Zod validation schemas                   |
| Build              | Turborepo (npm workspaces), Vite, Vitest             |
| Auth               | Magic link emails via Resend                         |

## Project Structure

```
pancakemaker/
├── apps/
│   └── web/              # React PWA frontend
│       └── src/
│           ├── components/   # Reusable UI (Button, Card, Modal, Badge, etc.)
│           ├── db/           # SQLite queries, migrations, database interface
│           ├── hooks/        # React hooks (useExpenses, useCategories, usePanels)
│           ├── sync/         # Sync engine, API client, SyncContext
│           ├── views/        # Page components (Dashboard, RouteView, Settings)
│           └── lib/          # Utilities (export, formatting)
├── workers/
│   └── api/              # Cloudflare Worker backend
│       └── src/
│           ├── index.ts      # Hono routes (auth, sync, currency)
│           └── middleware/    # JWT auth middleware
├── packages/
│   └── shared/           # Shared types, Zod schemas, constants
├── turbo.json
└── package.json
```

## Prerequisites

- Node.js >= 20
- npm >= 10

For cloud sync and self-hosting the backend:

- A [Cloudflare](https://dash.cloudflare.com/) account (free tier works)
- A [Resend](https://resend.com/) account for magic link emails

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/momentmaker/pancakemaker.git
cd pancakemaker
npm install
```

### 2. Build shared packages

```bash
npm run build
```

### 3. Start development servers

```bash
npm run dev
```

This starts both the Vite dev server (frontend at `http://localhost:5173`) and the Wrangler dev server (API at `http://localhost:8787`).

The frontend works fully offline without the API — sync features require the backend.

### 4. Run tests

```bash
npm run test
```

## Self-Hosting

### Frontend only (no sync)

The frontend is a static PWA. Build and deploy to any static host:

```bash
npm run build
```

The output is in `apps/web/dist/`. Deploy to Cloudflare Pages, Netlify, Vercel, or serve with any static file server.

Without the API, the app works entirely locally — all data stays in the browser's IndexedDB.

### Full stack (with sync)

#### 1. Create a Cloudflare D1 database

```bash
cd workers/api
npx wrangler d1 create pancakemaker
```

Update `wrangler.toml` with the returned `database_id`.

#### 2. Run D1 migrations

```bash
npx wrangler d1 migrations apply pancakemaker
```

#### 3. Set secrets

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put RESEND_API_KEY
```

#### 4. Configure production vars

In `wrangler.toml`, update for production:

```toml
[vars]
ENVIRONMENT = "production"
APP_URL = "https://your-frontend-domain.com"
```

#### 5. Deploy the worker

```bash
npx wrangler deploy
```

#### 6. Point the frontend at your API

Set the API URL in your frontend deployment environment so the sync client connects to your worker.

## Contributing

### Development workflow

1. Fork the repo and create a feature branch
2. Install dependencies: `npm install`
3. Build once to compile shared types: `npm run build`
4. Start dev servers: `npm run dev`
5. Make changes, write tests
6. Run the full test suite: `npm run test`
7. Format code: `npm run format`
8. Commit with a clear message explaining "why"
9. Open a pull request

### Code style

- **Formatting** — Prettier with single quotes, no semicolons, trailing commas. Run `npm run format` before committing
- **TypeScript** — Strict mode. No `any` without justification. Prefer `unknown` over `any`
- **Testing** — Vitest with BDD-style comments (`#given`, `#when`, `#then`). Test behavior, not implementation
- **Naming** — PascalCase for types/components, camelCase for functions/variables, kebab-case for files

### Database migrations

Migrations are versioned and **immutable once applied**. The browser records applied version numbers in `schema_migrations` and skips them on subsequent loads.

- **Never** modify an existing migration
- **Always** add a new migration with the next version number
- Use `IF NOT EXISTS` / `IF EXISTS` for idempotency where possible
- Test that queries work against the migrated schema (FK constraints validate at statement preparation time with `PRAGMA foreign_keys=ON`)

### Architecture guidelines

- Composition over inheritance
- Single responsibility per function
- Explicit data flow — no singletons or global state
- Test-driven when possible — write the test first
- Match existing patterns — find 3 similar examples in the codebase before implementing

### Running specific workspace tests

```bash
npm run test -w @pancakemaker/web
npm run test -w @pancakemaker/api
npm run test -w @pancakemaker/shared
```

## License

[MIT](LICENSE)
