import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // No defaultOptions meant every query's staleTime was 0 — any remount or
  // even just switching back to the browser tab refetched every query on
  // the page from scratch (refetchOnWindowFocus's default is also true),
  // which is what made the app feel heavy/slow to come back to. A 30s
  // staleTime treats data as fresh for a short window (short enough that a
  // real change — a new upload, an edit — still shows up quickly on the
  // next normal navigation) instead of refetching reflexively, and turning
  // off refetchOnWindowFocus stops every open tab from re-fetching its
  // whole dashboard the moment it regains focus.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
