import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { api, queryClient } from "./api";
import App from "./app";
import "./styles.css";
import type { CatalogParams } from "./domain";
const root = createRootRoute({
  component: App,
  validateSearch: (
    search: Record<string, unknown>,
  ): CatalogParams & { redirect?: string } => ({
    q: String(search.q || ""),
    categories: String(search.categories || ""),
    networks: String(search.networks || ""),
    min: /^\d+(\.\d{1,18})?$/.test(String(search.min))
      ? String(search.min)
      : "",
    max: /^\d+(\.\d{1,18})?$/.test(String(search.max))
      ? String(search.max)
      : "",
    tab: ["all", "new", "trending"].includes(String(search.tab))
      ? String(search.tab)
      : "all",
    sort: ["recent", "price-asc", "price-desc"].includes(String(search.sort))
      ? String(search.sort)
      : "recent",
    page: Number.isFinite(Number(search.page))
      ? Math.max(1, Math.floor(Number(search.page)))
      : 1,
    redirect:
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
        ? search.redirect
        : undefined,
  }),
});
async function guard({ location }: { location: { href: string } }) {
  try {
    await api.get("/session");
  } catch {
    throw redirect({ to: "/login", search: { redirect: location.href } });
  }
}
const routes = [
  createRoute({ getParentRoute: () => root, path: "/" }),
  createRoute({ getParentRoute: () => root, path: "/nft/$id" }),
  createRoute({ getParentRoute: () => root, path: "/cart" }),
  createRoute({ getParentRoute: () => root, path: "/login" }),
  createRoute({ getParentRoute: () => root, path: "/register" }),
  createRoute({
    getParentRoute: () => root,
    path: "/checkout",
    beforeLoad: guard,
  }),
  createRoute({
    getParentRoute: () => root,
    path: "/orders/$id",
    beforeLoad: guard,
  }),
  createRoute({
    getParentRoute: () => root,
    path: "/profile",
    beforeLoad: guard,
  }),
  createRoute({
    getParentRoute: () => root,
    path: "/wallets",
    beforeLoad: guard,
  }),
  createRoute({
    getParentRoute: () => root,
    path: "/favorites",
    beforeLoad: guard,
  }),
];
export const router = createRouter({
  routeTree: root.addChildren(routes),
  defaultNotFoundComponent: () => null,
  defaultPreload: "intent",
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
async function start() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
start().catch((error) => {
  console.error(error);
  document.getElementById("root")!.textContent =
    "Não foi possível iniciar o marketplace. Recarregue a página.";
});
