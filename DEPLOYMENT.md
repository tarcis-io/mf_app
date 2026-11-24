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

### 4. Allow mf-app to call mf-service (service-to-service auth)

In production, `mf_app` attaches a Google-signed **OIDC ID token** to every
request it makes to `mf_service` (audience = `MF_SERVICE_URL`; see
[Service-to-service authentication](#service-to-service-authentication) and
`lib/mf-service.ts`). This lets `mf_service` be deployed **privately** — without
`--allow-unauthenticated` — and accept calls only from mf-app's service account.

Grant mf-app's runtime service account the **Cloud Run Invoker** role on the
`mf-service` service (replace the account with mf-app's actual runtime SA — by
default the project's Compute Engine default SA, or a dedicated one if you
configured it):

```bash
# mf-app's runtime service account (the identity its container runs as).
MF_APP_SA="$(gcloud run services describe mf-app --region "$REGION" \
  --format='value(spec.template.spec.serviceAccountName)')"

gcloud run services add-iam-policy-binding mf-service \
  --region "$REGION" \
  --member "serviceAccount:${MF_APP_SA}" \
  --role roles/run.invoker
```

Notes:

- The token's audience **must** be the URL mf-app calls — i.e. exactly
  `MF_SERVICE_URL`. If `mf_service` sits behind a custom domain, set
  `MF_SERVICE_URL` to that same domain so the audience matches.
- No credentials or keys are configured for this: on Cloud Run the token is
  minted from the metadata server for the attached service account. Locally the
  token is skipped entirely (mf-app talks to an unauthenticated local
  `mf_service`), so nothing extra is needed for `pnpm dev`.
- If the binding is missing, mf-app's calls get a `403` from mf_service's front
  end and the Batches card / About version show their error state.

### 5. Verify

- Visit the service URL → you should be redirected to `/login`.
- "Continue with Google" → Google consent → back to `/`.
- Confirm the response carries the security headers (`Content-Security-Policy`, `Strict-Transport-Security`, etc. — see [Security headers](#security-headers)).
- The home **Batches** card and the **About** version load (not their error state) — this confirms mf-app's ID token is accepted by `mf_service`.

## Security headers

`mf_app` sends a strict **Content-Security-Policy** and a set of hardening headers (`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`) — all static, all from `next.config.ts` (applied via `headers()`). No extra Cloud Run / App Hosting configuration is required.

The CSP is **static** (no per-request nonce), which is what lets it work with `cacheComponents` (Partial Prerendering) and Firebase App Hosting's CDN: the header is identical on a build-time prerender, a CDN cache hit, and a dynamic render. `script-src` therefore allows `'unsafe-inline'` — a deliberate trade-off. A nonce-based policy was tried and abandoned on this stack: a per-request nonce can't match the nonce baked into prerendered / CDN-cached HTML, and Next emits an unbounded, per-build set of inline streaming scripts (`self.__next_f.push(...)`) that no fixed hash list can enumerate. The other directives stay strict (`default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`), so clickjacking, base-tag injection, and cross-origin form posts are still blocked. `form-action` additionally allows `https://accounts.google.com` for the Google sign-in POST.

The directive-by-directive rationale (and the note on adding `mf_service`'s origin to `connect-src` once the API is wired up) lives next to the code in `next.config.ts`. `proxy.ts` now only does auth route-protection — it sets no headers.

## Service-to-service authentication

`mf_app` calls `mf_service` **server-side** (never from the browser), and in
production authenticates those calls with a Google-signed **OIDC ID token**
rather than leaving `mf_service` open. The token is fetched directly from the
Cloud Run **metadata server** — no SDK or extra dependency — by a plain request to

```
GET http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=<MF_SERVICE_URL>
Metadata-Flavor: Google
```

which returns a token for mf-app's attached service account with the **audience**
set to `MF_SERVICE_URL`. mf-app caches the token until shortly before it expires,
and attaches it as `Authorization: Bearer <token>`; Cloud Run's front end
validates it before the request ever reaches `mf_service`. (See
`lib/mf-service.ts`.)

This is distinct from the per-user `X-User-Id` header mf-app also sends: the ID
token authenticates **the mf-app service** to Cloud Run, while `X-User-Id`
identifies **the end user** (the Google `sub`) to mf_service's own logic. Both
travel on the same request.

Operational requirements:

- Deploy `mf_service` privately (no `--allow-unauthenticated`) and grant mf-app's
  runtime service account `roles/run.invoker` on it — see
  [step 4](#4-allow-mf-app-to-call-mf-service-service-to-service-auth) above.
- Keep `MF_SERVICE_URL` equal to the host mf-app actually calls, because that
  value **is** the token audience; an audience mismatch is rejected.
- **Local dev needs none of this.** The token is minted only when
  `NODE_ENV=production` (which the Docker image sets); locally mf-app talks to an
  unauthenticated `mf_service`, so no Google credentials are required. If the
  token can't be obtained in production, mf-app fails the call loudly (logged
  server-side) rather than sending an unauthenticated request.

## Troubleshooting

| Symptom                                                                                      | Likely cause                                                                             | Fix                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UntrustedHost` error on sign-in                                                             | `AUTH_TRUST_HOST` not set                                                                | Set `AUTH_TRUST_HOST=true`.                                                                                                                                                                                                    |
| `redirect_uri_mismatch` from Google                                                          | Callback URI not registered / `AUTH_URL` wrong                                           | Register `https://<origin>/api/auth/callback/google`; set `AUTH_URL` to the exact origin.                                                                                                                                      |
| Container crashes on startup with "Missing required environment variable(s)"                 | A required secret/env is absent                                                          | Provide the listed variables (see [Environment variables](#environment-variables)).                                                                                                                                            |
| Batches card / About version show their error state in prod; `mf_service` logs a `401`/`403` | mf-app's service account lacks the Invoker role, or the token audience ≠ the called host | Grant `roles/run.invoker` on `mf-service` to mf-app's runtime SA ([step 4](#4-allow-mf-app-to-call-mf-service-service-to-service-auth)); ensure `MF_SERVICE_URL` is exactly the host mf-app calls (it's the token audience).   |
| Prod logs show "Failed to obtain a Google ID token for mf_service"                           | The metadata server is unreachable or the runtime SA can't mint ID tokens                | Confirm the service runs on Cloud Run with a service account attached; mf-app mints the token from the metadata server (see [Service-to-service authentication](#service-to-service-authentication)).                          |
| Blank page / scripts blocked, console shows `script-src` CSP violations                      | `'unsafe-inline'` was removed from `script-src`                                          | Restore `script-src 'self' 'unsafe-inline'` in `next.config.ts`. Next emits inline streaming scripts that a static CSP can't nonce or hash-list, so this is required by design here — see the CSP comment in `next.config.ts`. |
| `form-action` CSP violation on "Continue with Google"                                        | Google's OAuth origin isn't allowed                                                      | Keep `https://accounts.google.com` in the `form-action` directive in `next.config.ts` (alongside `'self'`).                                                                                                                    |
| Styles missing / page renders unstyled, console shows `style-src` CSP violations             | `'unsafe-inline'` was removed from `style-src`                                           | Restore `style-src 'self' 'unsafe-inline'` in `next.config.ts`. Next/React inject inline styles, so this is required by design — don't "tighten" it.                                                                           |
