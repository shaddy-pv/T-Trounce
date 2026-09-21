import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { RouterContext } from "./routes/__root";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
      session: null, // Will be injected by root beforeLoad
    } as unknown as RouterContext,
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
