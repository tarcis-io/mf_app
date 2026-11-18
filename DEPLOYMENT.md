# Deployment

`mf_app` ships as a multi-stage Docker image (Next.js [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)) and is designed to run on **Google Cloud Run**. This guide covers building the image, the required environment variables, the Google OAuth setup, and the first deploy.

> **TL;DR of the part people get wrong:** on Cloud Run you **must** set `AUTH_URL` to the service's public origin and `AUTH_TRUST_HOST=true`, and register `https://<origin>/api/auth/callback/google` as an Authorized redirect URI in Google. Miss these and sign-in fails with an `UntrustedHost` or redirect-mismatch error. The app now fails fast at startup if `AUTH_SECRET`/`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` (and, in production, `AUTH_URL`) are missing — see [Environment variables](#environment-variables).

## Prerequisites

- A Google Cloud project with billing enabled.
- `gcloud` CLI authenticated (`gcloud auth login`) and the project selected (`gcloud config set project <PROJECT_ID>`).
- The following APIs enabled: Cloud Run, Artifact Registry, Cloud Build.
- A Google OAuth 2.0 **Web application** client (see [Google OAuth setup](#google-oauth-setup)).

## Environment variables

`mf_app` validates these at server startup (`env.ts`, called from `auth.ts`). A missing or empty required variable throws immediately with a descriptive error instead of failing later at first sign-in. Validation is skipped during `next build` (secrets are injected at deploy, not build).

| Variable             | Required                | Description                                                                                 |
| -------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`        | Always                  | Encrypts the session cookie / JWT. Generate with `npx auth secret`. Keep it secret.         |
| `AUTH_GOOGLE_ID`     | Always                  | Google OAuth client ID.                                                                     |
| `AUTH_GOOGLE_SECRET` | Always                  | Google OAuth client secret.                                                                 |
| `AUTH_URL`           | **Production**          | The deployed public origin, e.g. `https://mf-app-xxxxx.a.run.app`. Used to build OAuth callback URLs behind a proxy. Not needed locally (inferred from `localhost`). |
| `AUTH_TRUST_HOST`    | **Production (Cloud Run)** | Set to `true`. Tells Auth.js to trust the `Host`/`X-Forwarded-Host` headers set by Cloud Run's proxy. Without it, Auth.js rejects requests with `UntrustedHost`. |

Store `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` in **Secret Manager**, not as plaintext env vars (see [Deploy](#deploy-to-cloud-run)). `AUTH_URL` and `AUTH_TRUST_HOST` are not sensitive and can be plain env vars.

### Why `AUTH_URL` + `AUTH_TRUST_HOST` are mandatory on Cloud Run

Cloud Run terminates TLS at its edge and forwards requests to the container over HTTP with `X-Forwarded-*` headers. Auth.js, for security, does not trust those headers by default — so it can't know the real external origin and will either reject the request (`UntrustedHost`) or construct an OAuth `redirect_uri` that doesn't match what you registered with Google. Setting `AUTH_TRUST_HOST=true` opts into trusting the proxy headers, and `AUTH_URL` pins the canonical origin used to build callback URLs. This is the single most common cause of "sign-in works locally but not in prod."

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

(When running the container locally, set `AUTH_URL=http://localhost:8080` and `AUTH_TRUST_HOST=true` in the env file, and add `http://localhost:8080/api/auth/callback/google` to Google.)

## Deploy to Cloud Run

### 1. Create secrets (once)

```bash
printf '%s' "$(npx auth secret --raw 2>/dev/null || openssl rand -base64 33)" \
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
  --set-env-vars "AUTH_TRUST_HOST=true"
```

`--allow-unauthenticated` lets the public reach the app; MassFlow's own Google sign-in (not Cloud Run IAM) is what gates access.

### 3. Set `AUTH_URL` to the assigned origin

After the first deploy, read the service URL and set `AUTH_URL`:

```bash
URL=$(gcloud run services describe mf-app --region "$REGION" --format='value(status.url)')
gcloud run services update mf-app --region "$REGION" --set-env-vars "AUTH_URL=$URL,AUTH_TRUST_HOST=true"
```

Then add `$URL/api/auth/callback/google` to the OAuth client's Authorized redirect URIs (step 2 of [Google OAuth setup](#google-oauth-setup)).

### 4. Verify

- Visit the service URL → you should be redirected to `/login`.
- "Continue with Google" → Google consent → back to `/`.
- Confirm the response carries the security headers (`Content-Security-Policy` with a `nonce-…`, `Strict-Transport-Security`, etc. — see [Security headers](#security-headers)).

## Security headers

`mf_app` sends a strict, per-request **Content-Security-Policy** with a fresh nonce (set in `proxy.ts`), plus static hardening headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`) from `next.config.ts`. No extra Cloud Run configuration is required for these.

When you wire up `mf_service`, add its origin to the CSP `connect-src` directive in `proxy.ts` (it's `'self'` only today), or browser fetches to the API will be blocked.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `UntrustedHost` error on sign-in | `AUTH_TRUST_HOST` not set | Set `AUTH_TRUST_HOST=true`. |
| `redirect_uri_mismatch` from Google | Callback URI not registered / `AUTH_URL` wrong | Register `https://<origin>/api/auth/callback/google`; set `AUTH_URL` to the exact origin. |
| Container crashes on startup with "Missing required environment variable(s)" | A required secret/env is absent | Provide the listed variables (see [Environment variables](#environment-variables)). |
| Blank page / scripts blocked in console | CSP nonce not reaching the renderer | Ensure `proxy.ts` is deployed unmodified; the matcher must run on page routes. |
| Styles missing but page works | `style-src` too strict | The CSP allows `'unsafe-inline'` for styles by design; don't remove it. |
