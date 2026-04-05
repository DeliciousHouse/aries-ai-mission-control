import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { RouteId } from "../types";

const navItems: Array<{ id: RouteId; label: string; helper: string }> = [
  { id: "org-chart", label: "Org Chart", helper: "Episode 1 operating structure" },
  { id: "command", label: "Command", helper: "Execution board" },
  { id: "knowledge", label: "Knowledge", helper: "Memory, briefs, skills, and scheduler health" },
  { id: "build-lab", label: "Build Lab", helper: "Experiments + tracks" },
  { id: "runtime", label: "Runtime", helper: "Live OpenClaw state" },
];

type Props = {
  route: RouteId;
  onNavigate: (route: RouteId) => void;
  lastUpdated: string | null;
  children: ReactNode;
};

export function AppShell({ route, onNavigate, lastUpdated, children }: Props) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [route]);

  return (
    <div className={`app-shell ${navOpen ? "nav-open" : ""}`}>
      <header className="mobile-shell-bar panel">
        <div>
          <p className="eyebrow">Aries Mission Control</p>
          <strong>{navItems.find((item) => item.id === route)?.label ?? "Mission Control"}</strong>
        </div>
        <button
          className="mobile-nav-toggle"
          type="button"
          aria-expanded={navOpen}
          aria-controls="mission-control-nav"
          onClick={() => setNavOpen((current) => !current)}
        >
          {navOpen ? "Close" : "Menu"}
        </button>
      </header>

      <button
        className={`sidebar-overlay ${navOpen ? "is-visible" : ""}`}
        type="button"
        aria-label="Close navigation"
        onClick={() => setNavOpen(false)}
      />

      <aside className={`sidebar ${navOpen ? "is-open" : ""}`}>
        <div className="brand-card panel">
          <p className="eyebrow">Aries Mission Control</p>
          <h1>Internal delivery + runtime visibility</h1>
          <p className="muted">
            Primary mission: ship <code>aries-app</code> and expose truthful OpenClaw runtime state.
          </p>
        </div>

        <nav className="nav-stack panel" id="mission-control-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-button ${route === item.id ? "is-active" : ""}`}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <strong>{item.label}</strong>
              <span>{item.helper}</span>
            </button>
          ))}
        </nav>

        <div className="meta-card panel">
          <p className="eyebrow">Refresh state</p>
          <strong>{lastUpdated ? new Date(lastUpdated).toLocaleString() : "Waiting for data"}</strong>
          <p className="muted">
            Runtime surfaces must use real sources. Missing wiring stays visible as disconnected or unavailable.
          </p>
        </div>
      </aside>

      <main className="main-surface">{children}</main>
    </div>
  );
}
