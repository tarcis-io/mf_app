import Image from "next/image";

import { signInAction, signInDevAction } from "@/app/actions";
import NeuralNetworkBackground from "@/components/neural-network-background";
import { isDevLoginEnabled } from "@/env";

// Resolved once when the module is evaluated (build/prerender time), so the
// copyright line stays current without pulling runtime data into this
// otherwise-static page under Partial Prerendering.
const COPYRIGHT_YEAR = new Date().getFullYear();

export default function Login() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center gap-8 overflow-hidden bg-background px-8 text-center">
      <NeuralNetworkBackground />
      <div className="relative flex flex-row items-center gap-4">
        <Image src="/logo.svg" alt="MassFlow AI" width={64} height={64} priority />
        <span className="text-4xl font-semibold tracking-tight text-foreground">
          MassFlow <span className="text-foreground/50">AI</span>
        </span>
      </div>
      <div className="relative flex flex-col items-center gap-3">
        <form action={signInAction}>
          <button
            type="submit"
            className="relative flex h-12 cursor-pointer items-center justify-center gap-3 rounded-full bg-primary px-6 text-base font-medium text-background transition-colors hover:bg-primary-hover"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>
        </form>

        {/* Dev-only shortcut: sign in as a fake user with no Google OAuth, so the
            authenticated pages can be browsed locally. Rendered only when dev
            login is enabled (never in production — see `@/env`). */}
        {isDevLoginEnabled() ? (
          <form action={signInDevAction}>
            <button
              type="submit"
              className="flex h-10 cursor-pointer items-center justify-center rounded-full border border-dashed border-foreground/25 px-5 text-sm font-medium text-foreground/60 transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
            >
              Continue as dev user
            </button>
          </form>
        ) : null}
      </div>
      <footer className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 py-6 text-sm text-foreground/40">
        <p>&copy; {COPYRIGHT_YEAR} MassFlow AI</p>
        <p>
          Developed by{" "}
          <a
            href="mailto:t@rcis.io"
            className="font-medium text-foreground/60 underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            t@rcis.io
          </a>
        </p>
      </footer>
    </div>
  );
}
