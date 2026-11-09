import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { RouterContext } from "./routes/__root";

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {
      session: null, // Will be injected by root beforeLoad
    } as RouterContext,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    defaultPreloadStaleTime: 60 * 1000,
    defaultStaleTime: 60 * 1000,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });

  return router;
};
