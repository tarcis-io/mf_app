# mf_app

**MassFlow AI** — the frontend for MassFlow: a [Next.js](https://nextjs.org)
web application that gives users access to MassFlow's metabolomics batch
processing.

`mf_app` is the browser-facing layer. It talks to
[mf_service](https://github.com/tarcis-io/mf_service) (`mf_service`) over
HTTP, which is itself a thin FastAPI boundary over
[mf_engine](https://github.com/tarcis-io/mf_engine) (`mf_engine`), the core
processing engine. `mf_app` never calls `mf_engine` directly — all backend
access goes through `mf_service`.

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

## Run

```bash
pnpm dev     # start the development server with hot reload
pnpm build   # production build
pnpm start   # run the production build
```

The dev server listens on [http://localhost:3000](http://localhost:3000).

## Pages

| Path     | Description                              | Access        |
| -------- | ---------------------------------------- | ------------- |
| `/`      | Home page (logged-in area).              | Authenticated |
| `/login` | Login page.                              | Public        |

All routes except `/login` require an authenticated session; unauthenticated
requests are redirected to `/login` by the proxy (see
[Authentication](#authentication) and `proxy.ts`). Logged-in pages (the home
page today, more to come) share a common shell via the `LoggedInTemplate`
component — see [Layout](#layout) below.

## Development

```bash
pnpm lint         # eslint (eslint-config-next core-web-vitals + typescript)
pnpm test         # run the test suite once (Vitest)
pnpm test:watch   # run tests in watch mode
```

Tests use [Vitest](https://vitest.dev) with React Testing Library in a jsdom
environment. Test files live next to the code they cover as `*.test.tsx`.

## Layout

```
mf_app/                                 # repository root
├── package.json
├── pnpm-workspace.yaml
├── next.config.ts                      # Next.js config (Turbopack + Tailwind)
├── tsconfig.json                       # path alias: "@/*" -> "./*"
├── eslint.config.mjs
├── vitest.config.ts                    # test runner config (jsdom + "@/*" alias)
├── vitest.setup.ts                     # global test setup (jest-dom matchers)
├── auth.ts                             # Auth.js (NextAuth) config — Google provider
├── proxy.ts                            # route protection (Next 16 proxy/middleware)
├── .env.example                        # template for required env vars
├── README.md
├── public/                             # static assets
├── components/
│   ├── neural-network-background.tsx   # decorative animated login backdrop
│   ├── user-menu.tsx                   # signed-in user + sign-out control
│   └── templates/
│       └── logged-in-template.tsx      # shared shell for logged-in pages
└── app/
    ├── layout.tsx                      # root layout (fonts, metadata, <html>/<body>)
    ├── globals.css                     # Tailwind entrypoint + theme tokens
    ├── page.tsx                        # "/" — home page (logged-in)
    ├── api/
    │   └── auth/[...nextauth]/route.ts # Auth.js OAuth endpoints
    └── login/
        └── page.tsx                    # "/login" — login page
```

This uses the Next.js **App Router** (`app/`). Routes map to folders:
`app/page.tsx` is `/`, `app/login/page.tsx` is `/login`. New logged-in pages
should wrap their content in `LoggedInTemplate` from
`components/templates/logged-in-template.tsx` to stay visually consistent with
the rest of the logged-in area — and are protected automatically by `proxy.ts`,
with no per-page code.

## Backend

| Repository                                            | Role                                                     |
| ----------------------------------------------------- | -------------------------------------------------------- |
| [mf_service](https://github.com/tarcis-io/mf_service) | HTTP API `mf_app` talks to (FastAPI).                    |
| [mf_engine](https://github.com/tarcis-io/mf_engine)   | Core processing engine, used internally by `mf_service`. |

User authentication is handled in `mf_app` itself (see
[Authentication](#authentication)). `mf_app` does not yet point at a live
`mf_service` instance — wiring up the API base URL, and passing the session
through to `mf_service`, is expected as this project grows.
