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

## Run

```bash
pnpm dev     # start the development server with hot reload
pnpm build   # production build
pnpm start   # run the production build
```

The dev server listens on [http://localhost:3000](http://localhost:3000).

## Pages

| Path     | Description                              |
| -------- | ---------------------------------------- |
| `/`      | Home page (logged-in area).              |
| `/login` | Login page.                              |

Logged-in pages (the home page today, more to come) share a common shell via
the `LoggedInTemplate` component — see [Layout](#layout) below.

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
mf_app/                            # repository root
├── package.json
├── pnpm-workspace.yaml
├── next.config.ts                 # Next.js config (Turbopack + Tailwind)
├── tsconfig.json                  # path alias: "@/*" -> "./*"
├── eslint.config.mjs
├── vitest.config.ts               # test runner config (jsdom + "@/*" alias)
├── vitest.setup.ts                # global test setup (jest-dom matchers)
├── README.md
├── public/                        # static assets
├── components/
│   ├── neural-network-background.tsx  # decorative animated login backdrop
│   └── templates/
│       └── logged-in-template.tsx # shared shell for logged-in pages
└── app/
    ├── layout.tsx                 # root layout (fonts, metadata, <html>/<body>)
    ├── globals.css                # Tailwind entrypoint + theme tokens
    ├── page.tsx                   # "/" — home page (logged-in)
    └── login/
        └── page.tsx               # "/login" — login page
```

This uses the Next.js **App Router** (`app/`). Routes map to folders:
`app/page.tsx` is `/`, `app/login/page.tsx` is `/login`. New logged-in pages
should wrap their content in `LoggedInTemplate` from
`components/templates/logged-in-template.tsx` to stay visually consistent with
the rest of the logged-in area.

## Backend

| Repository                                            | Role                                                     |
| ----------------------------------------------------- | -------------------------------------------------------- |
| [mf_service](https://github.com/tarcis-io/mf_service) | HTTP API `mf_app` talks to (FastAPI).                    |
| [mf_engine](https://github.com/tarcis-io/mf_engine)   | Core processing engine, used internally by `mf_service`. |

`mf_app` does not yet point at a live `mf_service` instance — wiring up the API
base URL and authentication is expected as this project grows.
