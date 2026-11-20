# mf_app

**MassFlow AI** — the [Next.js](https://nextjs.org) frontend for MassFlow, the
metabolomics batch-processing platform.

`mf_app` is the browser-facing layer. It talks over HTTP to
[mf_service](https://github.com/tarcis-io/mf_service) (`mf_service`), a thin
FastAPI boundary over [mf_engine](https://github.com/tarcis-io/mf_engine)
(`mf_engine`), the core processing engine.

## Install

```bash
pnpm install
```

## Authentication

`mf_app` authenticates users with [Auth.js](https://authjs.dev) (NextAuth v5)
using Google as the sole identity provider. Every route is protected by
default: unauthenticated visitors are redirected to `/login`, where
"Continue with Google" starts the OAuth flow and returns them to the home page
once signed in. Sessions are stateless, encrypted-cookie JWTs — there is no
database.

### Google OAuth setup

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** of type **Web application**.
2. Add this **Authorized redirect URI** (for local development):

   ```
   http://localhost:3000/api/auth/callback/google
   ```

3. Copy `.env.example` to `.env.local` and fill in the values:

   ```bash
   cp .env.example .env.local
   ```

   | Variable             | Description                                        |
   | -------------------- | -------------------------------------------------- |
   | `AUTH_SECRET`        | Cookie/JWT encryption secret (`npx auth secret`).  |
   | `AUTH_GOOGLE_ID`     | OAuth client ID from the step above.               |
   | `AUTH_GOOGLE_SECRET` | OAuth client secret from the step above.           |

`.env.local` is git-ignored; only `.env.example` (with empty placeholders) is
committed.

These three are required in every environment and the app **fails fast at
startup** if any is missing (see `env.ts`). In production (e.g. Cloud Run) you
must also set `AUTH_URL`, `AUTH_TRUST_HOST=true`, and `MF_SERVICE_URL` (the
`mf_service` base URL — see [Backend](#backend)) — see
[Deployment](#deployment) and [`DEPLOYMENT.md`](./DEPLOYMENT.md).

## Run

```bash
pnpm dev     # start the development server with hot reload
pnpm build   # production build
pnpm start   # run the production build
```

The dev server listens on [http://localhost:3000](http://localhost:3000).

## Deployment

`mf_app` ships with a `Dockerfile` (multi-stage, Next.js standalone output)
and is set up to run on **Google Cloud Run**. See **[`DEPLOYMENT.md`](./DEPLOYMENT.md)**
for the full guide: building the image, the required production environment
variables (`AUTH_URL`, `AUTH_TRUST_HOST`, secrets via Secret Manager), the
Google OAuth redirect-URI setup, and troubleshooting.

## Security

Every response carries hardening headers. A strict **Content-Security-Policy**
with a fresh per-request nonce is set in `proxy.ts` (`script-src` is
nonce-based with `'strict-dynamic'` — no `'unsafe-inline'` scripts); the static
headers (`Strict-Transport-Security`, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy`) come from `next.config.ts`. When `mf_service` is
wired up, add its origin to the CSP `connect-src` directive in `proxy.ts`.

## Pages

| Path          | Description                                               | Access        |
| ------------- | --------------------------------------------------------- | ------------- |
| `/api/auth/*` | Auth.js OAuth endpoints (sign in/out, callback, session). | Public        |
| `/login`      | Login page.                                               | Public        |
| `/`           | Home page.                                                | Authenticated |
| `/about`      | About page.                                               | Authenticated |
| `/batches`    | Batches page.                                             | Authenticated |
| `/settings`   | Settings page.                                            | Authenticated |

All routes except `/login` require an authenticated session; unauthenticated
requests are redirected to `/login` by the proxy (see
[Authentication](#authentication) and `proxy.ts`). Logged-in pages share a
common shell via the `LoggedInTemplate` component — see [Layout](#layout)
below.

Two full-page error states are not routes but render for any path: a **404**
(`app/not-found.tsx`, shown for unmatched routes) and a **generic error**
(`app/error.tsx`, the client error boundary for a page that throws). Both are
standalone centered pages with a "Back to home" link and share the
`ErrorPage` component.

## Development

```bash
pnpm lint         # eslint (eslint-config-next core-web-vitals + typescript)
pnpm typecheck    # generate Next route types, then tsc --noEmit
pnpm test         # run the test suite once (Vitest)
pnpm test:watch   # run tests in watch mode
```

Tests use [Vitest](https://vitest.dev) with React Testing Library in a jsdom
environment. Test files live next to the code they cover as `*.test.tsx`.

## Layout

```
mf_app/                                    # repository root
├── package.json
├── pnpm-workspace.yaml
├── .nvmrc                                 # Node version for local dev (matches the Dockerfile)
├── next.config.ts                         # Next.js config (Turbopack + Tailwind)
├── tsconfig.json                          # path alias: "@/*" -> "./*"
├── eslint.config.mjs
├── vitest.config.ts                       # test runner config (jsdom + "@/*" alias)
├── vitest.setup.ts                        # global test setup (jest-dom matchers)
├── auth.ts                                # Auth.js (NextAuth) config + authorized/session callbacks
├── auth.test.ts                           # tests for the authorized + session callbacks
├── env.ts                                 # fail-fast validation of required env vars
├── env.test.ts
├── proxy.ts                               # route protection + per-request CSP (Next 16 proxy)
├── proxy.test.ts
├── .env.example                           # template for required env vars
├── DEPLOYMENT.md                          # Cloud Run deployment guide (env contract, OAuth)
├── README.md
├── types/
│   └── next-auth.d.ts                     # Auth.js type augmentation (session.user.id)
├── lib/
│   ├── mf-service.ts                      # server-side mf_service client (batches) + summary helper
│   └── mf-service.test.ts
├── public/
│   └── logo.svg                           # wordmark logo (login page + drawer)
├── components/
│   ├── neural-network-background.tsx      # decorative animated login backdrop
│   ├── neural-network-background.test.tsx
│   ├── error-page.tsx                     # shared centered layout for 404 / 500
│   ├── error-page.test.tsx
│   ├── batches-card.tsx                   # home-page card: batch total + per-status counts
│   ├── batches-card.test.tsx
│   ├── user-label.tsx                     # signed-in user's name/email (header)
│   ├── user-label.test.tsx
│   └── templates/
│       ├── logged-in-template.tsx         # server shell: reads session, composes AppShell
│       ├── logged-in-template.test.tsx
│       ├── app-shell.tsx                  # client chrome: fixed header, nav drawer, scrollable main
│       ├── app-shell.hooks.ts             # drawer drag-to-close + dismiss/scroll-lock hooks
│       └── app-shell.test.tsx
└── app/
    ├── layout.tsx                         # root layout (fonts, metadata, viewport)
    ├── globals.css                        # Tailwind entrypoint + theme tokens
    ├── actions.ts                         # server actions (sign-in, sign-out)
    ├── actions.test.ts
    ├── not-found.tsx                      # 404 page (unmatched routes)
    ├── not-found.test.tsx
    ├── error.tsx                          # generic error boundary (client)
    ├── error.test.tsx
    ├── favicon.ico
    ├── icon.svg
    ├── icon.png
    ├── apple-icon.png
    ├── page.tsx                           # "/" — home page (logged-in)
    ├── page.test.tsx
    ├── api/
    │   └── auth/[...nextauth]/route.ts    # Auth.js OAuth endpoints
    ├── login/
    │   ├── page.tsx                       # "/login" — login page
    │   └── page.test.tsx
    ├── about/
    │   ├── page.tsx                       # "/about" — about page
    │   └── page.test.tsx
    ├── batches/
    │   ├── page.tsx                       # "/batches" — batches page
    │   └── page.test.tsx
    └── settings/
        ├── page.tsx                       # "/settings" — settings page
        └── page.test.tsx
```

This uses the Next.js **App Router** (`app/`). Routes map to folders:
`app/page.tsx` is `/`, `app/login/page.tsx` is `/login`. New logged-in pages
should wrap their content in `LoggedInTemplate` from
`components/templates/logged-in-template.tsx` to stay visually consistent with
the rest of the logged-in area — and are protected automatically by `proxy.ts`,
with no per-page code. `LoggedInTemplate` is a Server Component that reads the
session and composes `AppShell`, the client component holding the shared chrome
(fixed header, navigation drawer, scrollable main). Tests live beside the code
they cover as `*.test.tsx` (and `*.test.ts`).

## Backend

| Repository                                            | Role                                                     |
| ----------------------------------------------------- | -------------------------------------------------------- |
| [mf_service](https://github.com/tarcis-io/mf_service) | HTTP API `mf_app` talks to (FastAPI).                    |
| [mf_engine](https://github.com/tarcis-io/mf_engine)   | Core processing engine, used internally by `mf_service`. |

User authentication is handled in `mf_app` itself (see
[Authentication](#authentication)). `mf_app` reaches `mf_service` server-side
through a small client in `lib/mf-service.ts`, pointed at the base URL in the
`MF_SERVICE_URL` environment variable. Each call identifies the end user with an
`X-User-Id` request header carrying the Google account id (the OAuth `sub`,
surfaced as `session.user.id`; see `auth.ts`), which `mf_service` uses to scope
every batch to its owner. The home page's **Batches** card is the first
consumer: it lists the signed-in user's batches (`GET /batches`) and shows the
total plus a per-status breakdown. `mf_service` has no counts endpoint, so the
totals are derived from the list client-side.

`MF_SERVICE_URL` is required in production (the app fails fast without it) and
optional locally — if it's unset, the Batches card shows an error state and the
rest of the app works. More of the `mf_service` surface (creating batches,
uploading files, per-batch views) is expected to be wired up as the project
grows.
