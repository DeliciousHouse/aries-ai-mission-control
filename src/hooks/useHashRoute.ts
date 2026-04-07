import { useEffect, useMemo, useState } from "react";
import type { RouteId } from "../types";

const validRoutes = new Set<RouteId>(["org-chart", "command", "approvals", "knowledge", "build-lab", "runtime"]);

function parseHashRoute(): RouteId {
  const raw = window.location.hash.replace(/^#\/?/, "").trim();
  return validRoutes.has(raw as RouteId) ? (raw as RouteId) : "command";
}

export function useHashRoute() {
  const [route, setRoute] = useState<RouteId>(() => parseHashRoute());

  useEffect(() => {
    const handler = () => setRoute(parseHashRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = useMemo(
    () => (nextRoute: RouteId) => {
      if (nextRoute === route) return;
      window.location.hash = `#/${nextRoute}`;
    },
    [route],
  );

  return { route, navigate };
}
