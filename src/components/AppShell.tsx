import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RouteId } from "../types";

type NavTone = "ok" | "warn" | "alert" | "neutral";

type NavSignal = {
  primary: string;
  secondary?: string;
  tone?: NavTone;
};

type NavItem = {
  id: RouteId;
  label: string;
  helper: string;
  icon: string;
  module: "ops" | "brain" | "lab";
};

const navItems: NavItem[] = [
  { id: "command", label: "Command", helper: "Execution board", icon: "⌘", module: "ops" },
  { id: "approvals", label: "Approvals", helper: "Pending decisions", icon: "✓", module: "ops" },
  { id: "org-chart", label: "Org Chart", helper: "Owner + chief state", icon: "◈", module: "brain" },
  { id: "knowledge", label: "Knowledge", helper: "Briefs, memory, skills", icon: "◇", module: "brain" },
  { id: "build-lab", label: "Build Lab", helper: "Experiments + research", icon: "⬢", module: "lab" },
  { id: "runtime", label: "Runtime", helper: "Live OpenClaw signals", icon: "◎", module: "ops" },
];

type Props = {
  route: RouteId;
  onNavigate: (route: RouteId) => void;
  lastUpdated: string | null;
  navSignals?: Partial<Record<RouteId, NavSignal>>;
  children: ReactNode;
};

export function AppShell({ route, onNavigate, lastUpdated, navSignals = {}, children }: Props) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [route]);

  const currentNav = navItems.find((item) => item.id === route) ?? navItems[0];
  const currentSignal = navSignals[route];

  const shellBadges = useMemo(() => {
    const badges = [] as Array<{ label: string; tone: NavTone }>;
    if (currentSignal?.primary) {
      badges.push({ label: currentSignal.primary, tone: currentSignal.tone ?? "neutral" });
    }
    if (currentSignal?.secondary) {
      badges.push({ label: currentSignal.secondary, tone: "neutral" });
    }
    badges.push({ label: lastUpdated ? `Synced ${formatAbsoluteTimestamp(lastUpdated)}` : "Awaiting first sync", tone: lastUpdated ? "ok" : "warn" });
    return badges;
  }, [currentSignal, lastUpdated]);

  return (
    <div className={`app-shell mission-control-shell route-${route} ${navOpen ? "nav-open" : ""}`}>
      <header className="mobile-shell-bar panel">
        <div className="mobile-shell-copy">
          <p className="eyebrow">Mission Control</p>
          <strong>{currentNav.label}</strong>
          <span>{currentNav.helper}</span>
        </div>
        <button
          className="mobile-nav-toggle"
          type="button"
          aria-expanded={navOpen}
          aria-controls="mission-control-nav"
          onClick={() => setNavOpen((current) => !current)}
        >
          {navOpen ? "✕" : "☰"}
        </button>
      </header>

      <button
        className={`sidebar-overlay ${navOpen ? "is-visible" : ""}`}
        type="button"
        aria-label="Close navigation"
        onClick={() => setNavOpen(false)}
      />

      <aside className={`sidebar mission-sidebar ${navOpen ? "is-open" : ""}`}>
        <div className="brand-card panel mission-brand-card">
          <div className="brand-kicker-row">
            <p className="eyebrow">Aries Mission Control</p>
            <span className="signal-badge tone-ok">Protected routing</span>
          </div>
          <h1>Operational command deck</h1>
          <p className="muted">
            Board truth, org truth, and runtime truth in one surface.
          </p>
          <div className="brand-micro-grid">
            <div>
              <span>Active module</span>
              <strong>{currentNav.label}</strong>
            </div>
            <div>
              <span>Last sync</span>
              <strong>{formatTimestamp(lastUpdated)}</strong>
            </div>
          </div>
        </div>

        <nav className="nav-stack panel mission-nav-dock" id="mission-control-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const signal = navSignals[item.id];
            const tone = signal?.tone ?? "neutral";
            return (
              <button
                key={item.id}
                className={`nav-button menuDockItem module-${item.module} ${route === item.id ? "is-active" : ""}`}
                onClick={() => onNavigate(item.id)}
                type="button"
              >
                <div className="nav-button-main">
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <div className="nav-copy">
                    <strong>{item.label}</strong>
                    <span>{item.helper}</span>
                  </div>
                </div>
                {signal ? (
                  <div className="nav-signal-row">
                    <span className={`signal-badge tone-${tone}`}>{signal.primary}</span>
                    {signal.secondary ? <span className="signal-badge tone-neutral">{signal.secondary}</span> : null}
                  </div>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="meta-card panel mission-meta-card">
          <div className="section-split">
            <div>
              <p className="eyebrow">Live shell state</p>
              <strong>{currentNav.label}</strong>
            </div>
            <span className="signal-badge tone-neutral">{currentNav.module}</span>
          </div>
          <div className="mission-meta-list">
            {shellBadges.map((badge) => (
              <span key={badge.label} className={`signal-badge tone-${badge.tone}`}>
                {badge.label}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <main className="main-surface">
        <section className={`shell-status-ribbon module-${currentNav.module}`}>
          <div className="shell-status-copy">
            <p className="eyebrow">{currentNav.label}</p>
            <strong>{currentNav.helper}</strong>
          </div>
          <div className="shell-status-badges">
            {shellBadges.map((badge) => (
              <span key={`${currentNav.id}-${badge.label}`} className={`signal-badge tone-${badge.tone}`}>
                {badge.label}
              </span>
            ))}
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}

function formatTimestamp(iso: string | null) {
  if (!iso) return "Waiting for data";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatAbsoluteTimestamp(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
