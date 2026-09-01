import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="max-w-md text-center">
        <p className="num text-[14px] text-secondary-warm">404</p>
        <h1 className="display mt-2 text-[28px] text-primary-warm">
          That route hasn't been recorded yet
        </h1>
        <p className="mt-2 text-[14px] text-secondary-warm">
          The page you're looking for doesn't exist or has moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-[12px] bg-[#3FB8AF] px-5 text-[14px] font-medium text-[#100E0C] transition hover:brightness-110"
          >
            Go to start
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="max-w-md text-center">
        <h1 className="display text-[20px] text-primary-warm">This page didn't load</h1>
        <p className="mt-2 text-[14px] text-secondary-warm">
          Something went wrong on our end. Try again, or head back to start.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-11 items-center justify-center rounded-[12px] bg-[#3FB8AF] px-5 text-[14px] font-medium text-[#100E0C] transition hover:brightness-110"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-[12px] border border-hairline px-5 text-[14px] font-medium text-primary-warm transition hover:border-[#9C9388]"
          >
            Go to start
          </a>
        </div>
      </div>
    </div>
  );
}

import { getSessionFn } from "@/server/data";
import type { SessionPayload } from "@/server/services/auth.service";

export interface RouterContext {
  queryClient: QueryClient;
  session: SessionPayload | null;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#100E0C" },
      { title: "Tarang — Speak. See your signal." },
      {
        name: "description",
        content:
          "Tarang is a spoken-English coaching tool for Indian coaching institutes. Students record, see their waveform, and improve. Teachers monitor a batch and prove progress to parents.",
      },
      { property: "og:title", content: "Tarang — Speak. See your signal." },
      {
        property: "og:description",
        content: "Spoken-English coaching for tier-2/3 coaching institutes. Waveforms, not vibes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  beforeLoad: async () => {
    // Execute the server function to get the session from HTTP-only cookie
    const session = await getSessionFn();
    return { session };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
