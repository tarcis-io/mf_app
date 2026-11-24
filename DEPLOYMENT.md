# Deployment

`mf_app` ships as a multi-stage Docker image (Next.js [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)) and is designed to run on **Google Cloud Run**. This guide covers building the image, the required environment variables, the Google OAuth setup, and the first deploy.

> **TL;DR of the part people get wrong:** on Cloud Run you **must** set `AUTH_URL` to the service's public origin and `AUTH_TRUST_HOST=true`, and register `https://<origin>/api/auth/callback/google` as an Authorized redirect URI in Google. Miss these and sign-in fails with an `UntrustedHost` or redirect-mismatch error. The app now fails fast at startup if `AUTH_SECRET`/`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` (and, in production, `AUTH_URL`, `AUTH_TRUST_HOST`, and `MF_SERVICE_URL`) are missing — see [Environment variables](#environment-variables).

## Prerequisites

- A Google Cloud project with billing enabled.
- `gcloud` CLI authenticated (`gcloud auth login`) and the project selected (`gcloud config set project <PROJECT_ID>`).
- The following APIs enabled: Cloud Run, Artifact Registry, Cloud Build.
- A Google OAuth 2.0 **Web application** client (see [Google OAuth setup](#google-oauth-setup)).

## Environment variables

`mf_app` validates these at server startup (`env.ts`, called from `auth.ts`). A missing or empty required variable throws immediately with a descriptive error instead of failing later at first sign-in. Validation is skipped during `next build` (secrets are injected at deploy, not build).

| Variable             | Required                   | Description                                                                                                                                                                                                                    |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_SECRET`        | Always                     | Encrypts the session cookie / JWT. Generate with `npx auth secret`. Keep it secret.                                                                                                                                            |
| `AUTH_GOOGLE_ID`     | Always                     | Google OAuth client ID.                                                                                                                                                                                                        |
| `AUTH_GOOGLE_SECRET` | Always                     | Google OAuth client secret.                                                                                                                                                                                                    |
| `AUTH_URL`           | **Production**             | The deployed public origin, e.g. `https://mf-app-xxxxx.a.run.app`. Used to build OAuth callback URLs behind a proxy. Not needed locally (inferred from `localhost`).                                                           |
| `AUTH_TRUST_HOST`    | **Production (Cloud Run)** | Set to `true`. Tells Auth.js to trust the `Host`/`X-Forwarded-Host` headers set by Cloud Run's proxy. Without it, Auth.js rejects requests with `UntrustedHost`.                                                               |
| `MF_SERVICE_URL`     | **Production**             | Base URL of `mf_service`, called server-side for batch data (e.g. the home Batches card), e.g. `https://mf-service-xxxxx.a.run.app`. Optional locally — if unset, the card shows an error state and the rest of the app works. |

Store `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` in **Secret Manager**, not as plaintext env vars (see [Deploy](#deploy-to-cloud-run)). `AUTH_URL`, `AUTH_TRUST_HOST`, and `MF_SERVICE_URL` are not sensitive and can be plain env vars.

## Google OAuth setup

In the [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials):

1. Create an **OAuth client ID** of type **Web application** (or reuse the one from local dev).
2. Under **Authorized redirect URIs**, add one entry per environment:
   - Local dev: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://<your-cloud-run-origin>/api/auth/callback/google`
3. Copy the client ID and secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

The redirect URI must match the deployed origin **exactly** (scheme, host, no trailing slash). If you map a custom domain, add that domain's callback URI too.

> Chicken-and-egg: Cloud Run assigns the `*.a.run.app` URL only after the first deploy. Deploy once to obtain the URL, then add its callback URI to Google and set `AUTH_URL` to it (a redeploy/`services update` picks up the new env). With a custom domain, point `AUTH_URL` at the custom domain from the start.

## Build the image

The `Dockerfile` is multi-stage: install deps → `pnpm build` → copy the standalone server into a slim runtime image that runs as a non-root user and listens on `PORT` (default `8080`, which Cloud Run sets).

Build locally:

```bash
docker build -t mf-app:local .
```

Run it locally against your `.env.local`:

```bash
docker run --rm -p 8080:8080 --env-file .env.local mf-app:local
# open http://localhost:8080
```

(When running the container locally, set `AUTH_URL=http://localhost:8080`, `AUTH_TRUST_HOST=true`, and `MF_SERVICE_URL` in the env file, and add `http://localhost:8080/api/auth/callback/google` to Google. The image sets `NODE_ENV=production`, so the production-required vars — including `MF_SERVICE_URL` — are validated at startup; point it at a reachable `mf_service` or the container won't start.)

## Deploy to Cloud Run

### 1. Create secrets (once)

```bash
# AUTH_SECRET is just a high-entropy random string; this is what `npx auth
# secret` generates under the hood, without the interactive .env file write.
printf '%s' "$(openssl rand -base64 33)" \
  | gcloud secrets create AUTH_SECRET --data-file=-
printf '%s' "<google-client-id>"     | gcloud secrets create AUTH_GOOGLE_ID --data-file=-
printf '%s' "<google-client-secret>" | gcloud secrets create AUTH_GOOGLE_SECRET --data-file=-
```

Grant the Cloud Run runtime service account access to read them (`roles/secretmanager.secretAccessor`).

### 2. Build & push, then deploy

Using Cloud Build + Artifact Registry (adjust region/repo to yours):

```bash
REGION=us-central1
REPO=us-central1-docker.pkg.dev/$(gcloud config get-value project)/containers
IMAGE=$REPO/mf-app:latest

gcloud builds submit --tag "$IMAGE"

gcloud run deploy mf-app \
  --image "$IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --set-secrets "AUTH_SECRET=AUTH_SECRET:latest,AUTH_GOOGLE_ID=AUTH_GOOGLE_ID:latest,AUTH_GOOGLE_SECRET=AUTH_GOOGLE_SECRET:latest" \
  --set-env-vars "AUTH_TRUST_HOST=true,MF_SERVICE_URL=https://mf-service-xxxxx.a.run.app"
```

`--allow-unauthenticated` lets the public reach the app; MassFlow's own Google sign-in (not Cloud Run IAM) is what gates access.

`MF_SERVICE_URL` must be set on this **first** deploy — the app validates it at startup (see [Environment variables](#environment-variables)), so the container won't become healthy without it. Point it at your already-deployed `mf_service` origin (it's independent of mf-app's own URL). `AUTH_URL` is the one value that can't be known yet (it's mf-app's own assigned origin); it's set next.

### 3. Set `AUTH_URL` to the assigned origin

After the first deploy, read the service URL and set `AUTH_URL`:

```bash
URL=$(gcloud run services describe mf-app --region "$REGION" --format='value(status.url)')
gcloud run services update mf-app --region "$REGION" \
  --set-env-vars "AUTH_URL=$URL,AUTH_TRUST_HOST=true,MF_SERVICE_URL=https://mf-service-xxxxx.a.run.app"
```

(`--set-env-vars` replaces the whole set, so repeat `MF_SERVICE_URL` here to keep it. Alternatively use `--update-env-vars "AUTH_URL=$URL"` to set just that one without touching the others.)

Then add `$URL/api/auth/callback/google` to the OAuth client's Authorized redirect URIs (step 2 of [Google OAuth setup](#google-oauth-setup)).

### 4. Verify

- Visit the service URL → you should be redirected to `/login`.
- "Continue with Google" → Google consent → back to `/`.
- Confirm the response carries the security headers (`Content-Security-Policy`, `Strict-Transport-Security`, etc. — see [Security headers](#security-headers)).

## Security headers

`mf_app` sends a strict, **static Content-Security-Policy** (set in `proxy.ts`), plus static hardening headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`) from `next.config.ts`. No extra Cloud Run configuration is required for these.

The `script-src` is hash-based, not nonce-based: it allows same-origin scripts (`'self'`) plus the one inline theme-init script, authorized by its SHA-256 hash. This is deliberate — the app's pages are statically prerendered and served through Firebase App Hosting's CDN, and a per-request nonce can't match the nonce baked into cached HTML (it would block every script). A static policy is identical on a prerender, a CDN cache hit, and a dynamic render.

The directive-by-directive rationale (and the note on adding `mf_service`'s origin to `connect-src` once the API is wired up) lives next to the code in `proxy.ts`.

## Troubleshooting

| Symptom                                                                          | Likely cause                                   | Fix                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UntrustedHost` error on sign-in                                                 | `AUTH_TRUST_HOST` not set                      | Set `AUTH_TRUST_HOST=true`.                                                                                                                                              |
| `redirect_uri_mismatch` from Google                                              | Callback URI not registered / `AUTH_URL` wrong | Register `https://<origin>/api/auth/callback/google`; set `AUTH_URL` to the exact origin.                                                                                |
| Container crashes on startup with "Missing required environment variable(s)"     | A required secret/env is absent                | Provide the listed variables (see [Environment variables](#environment-variables)).                                                                                      |
| Blank page / scripts blocked, console shows `script-src` CSP violations          | The theme-script hash drifted from the script, or `script-src` was changed | The inline theme script is authorized by its SHA-256 hash (`THEME_INIT_SCRIPT_HASH` in `lib/theme.ts`). If the script was edited without updating the hash, `lib/theme.test.ts` fails with the correct value — update the constant. Don't reintroduce a per-request nonce (it can't match prerendered/CDN-cached HTML). |
| Styles missing / page renders unstyled, console shows `style-src` CSP violations | `'unsafe-inline'` was removed from `style-src` | Restore `style-src 'self' 'unsafe-inline'` in `proxy.ts`. Next/React inject inline styles that can't carry a hash, so this is required by design — don't "tighten" it. |
