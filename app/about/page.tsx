import Image from "next/image";
import { Suspense, type ReactNode } from "react";

import Card from "@/components/card";
import LoggedInTemplate from "@/components/templates/logged-in-template";
import {
  APP_NAME,
  APP_URL,
  APP_VERSION,
  DEVELOPER_EMAIL,
  REPOSITORY_URLS,
} from "@/lib/app-info";
import { getServiceInfo, type ServiceInfo } from "@/lib/mf-service";

export default function About() {
  return (
    <LoggedInTemplate title="About">
      {/* Three stacked, full-width cards (same shell as the home Batches card):
          the app itself, then the two backend components (mf_service and the
          mf_engine it wraps), each with its version and repository. */}
      <div className="flex flex-col gap-6">
        {/* The app: its own identity + links. The version is the app's own, from
            package.json via app-info — no runtime fetch. */}
        <Card id="about-application" title="Application" icon={<LogoIcon />}>
          <dl className="flex flex-col gap-3 text-sm">
            <Row label="Name">
              <span className="font-medium text-foreground/80">{APP_NAME}</span>
            </Row>
            <Row label="Version">
              <Version value={APP_VERSION} />
            </Row>
            <Row label="Developed by">
              <a
                href={`mailto:${DEVELOPER_EMAIL}`}
                className="font-medium text-foreground/80 underline-offset-4 outline-none transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary"
              >
                {DEVELOPER_EMAIL}
              </a>
            </Row>
            <Row label="Website">
              <ExternalLink href={APP_URL}>
                {APP_URL.replace(/^https?:\/\//, "")}
              </ExternalLink>
            </Row>
            <Row label="Repository">
              <RepoLink url={REPOSITORY_URLS.mf_app} />
            </Row>
          </dl>
        </Card>

        {/* The two backend components. Their versions come from mf_service's
            /version endpoint (per-request, uncached data), so both cards stream
            in behind a single Suspense boundary from one fetch — keeping the
            page prerenderable under PPR (same pattern as the home BatchesCard). */}
        <Suspense fallback={<ServiceCardsFallback />}>
          <ServiceCards />
        </Suspense>
      </div>
    </LoggedInTemplate>
  );
}

/**
 * The mf_service and mf_engine cards, fed by a single `GET /version` call to
 * mf_service (server-side via `@/lib/mf-service`, so `MF_SERVICE_URL` never
 * reaches the browser). On a failed/absent service call both versions show
 * "unavailable" rather than throwing, so a backend hiccup degrades just these
 * two cards and the Application card above still renders (mirrors `BatchesCard`).
 * Exported for direct unit testing (its resolved/failed output can't be asserted
 * through the page's Suspense boundary in jsdom).
 */
export async function ServiceCards() {
  // Only the fetch goes in the try/catch — JSX is constructed afterwards. A
  // try/catch can't catch a child component's render-time errors (see the
  // react-hooks/error-boundaries lint rule), and the fetch is the only thing
  // that throws here. On failure `info` stays null → both cards show
  // "unavailable", so a backend hiccup degrades just these two cards.
  let info: ServiceInfo | null = null;
  try {
    info = await getServiceInfo();
  } catch (error) {
    // Log server-side for diagnosability (status / DNS / missing URL); the null
    // `info` drives the quiet "unavailable" fallback below.
    console.error("About: failed to load mf_service version", error);
  }

  const serviceVersion = info ? <Version value={info.version} /> : <Unavailable />;
  const engineVersion = info ? (
    <Version value={info.engine_version} />
  ) : (
    <Unavailable />
  );

  return (
    <>
      <ComponentCard
        id="about-mf-service"
        title="Service"
        name="mf_service"
        version={serviceVersion}
        repoUrl={REPOSITORY_URLS.mf_service}
      />
      <ComponentCard
        id="about-mf-engine"
        title="Engine"
        name="mf_engine"
        version={engineVersion}
        repoUrl={REPOSITORY_URLS.mf_engine}
      />
    </>
  );
}

/** Placeholder: both component cards with a skeleton where the version will go. */
function ServiceCardsFallback() {
  const skeleton = (
    <span
      className="inline-block h-4 w-10 animate-pulse rounded-full bg-foreground/[.06] align-middle"
      aria-hidden="true"
    />
  );
  return (
    <>
      <ComponentCard
        id="about-mf-service"
        title="Service"
        name="mf_service"
        version={skeleton}
        repoUrl={REPOSITORY_URLS.mf_service}
      />
      <ComponentCard
        id="about-mf-engine"
        title="Engine"
        name="mf_engine"
        version={skeleton}
        repoUrl={REPOSITORY_URLS.mf_engine}
      />
    </>
  );
}

/**
 * A backend component card (mf_service / mf_engine): a generic title + an icon,
 * with the component's name, version, and repository as rows.
 */
function ComponentCard({
  id,
  title,
  name,
  version,
  repoUrl,
}: {
  id: string;
  title: string;
  name: string;
  version: ReactNode;
  repoUrl: string;
}) {
  return (
    <Card id={id} title={title} icon={<ServerIcon />}>
      <dl className="flex flex-col gap-3 text-sm">
        <Row label="Name">
          <span className="font-medium text-foreground/80">{name}</span>
        </Row>
        <Row label="Version">{version}</Row>
        <Row label="Repository">
          <RepoLink url={repoUrl} />
        </Row>
      </dl>
    </Card>
  );
}

/**
 * One `<dt>/<dd>` row in an info list: a muted label and its value, on one line
 * with the value right-aligned. For short values (name, version, a link).
 */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-foreground/50">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/** An external link, opening in a new tab with the app's standard link styling. */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-foreground/80 underline-offset-4 outline-none transition-colors hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
    </a>
  );
}

/** A repository link showing the "owner/repo" slug, derived from the GitHub URL. */
function RepoLink({ url }: { url: string }) {
  return <ExternalLink href={url}>{url.replace(/^https?:\/\/github\.com\//, "")}</ExternalLink>;
}

/** A version value, e.g. `v0.1.0`. */
function Version({ value }: { value: string }) {
  return (
    <span className="font-medium tabular-nums text-foreground/80">
      v{value}
    </span>
  );
}

/** Shown for a version that couldn't be fetched. */
function Unavailable() {
  return <span className="text-foreground/40">unavailable</span>;
}

/**
 * The app's brand mark, reused as the Application card's title icon (the "logo"
 * that means the application). Decorative — the title text beside it names the
 * card — so hidden from assistive tech. Rendered at the same 16px box as the
 * other cards' line icons.
 */
function LogoIcon() {
  return (
    <Image
      src="/logo.svg"
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      className="h-4 w-4 rounded-[3px]"
    />
  );
}

/**
 * Stacked-servers glyph for the backend component cards (mf_service, mf_engine).
 * Decorative line icon in the app's style; inherits `text-primary` via
 * `currentColor` from the heading.
 */
function ServerIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h.01" />
      <path d="M7 16.5h.01" />
    </svg>
  );
}
