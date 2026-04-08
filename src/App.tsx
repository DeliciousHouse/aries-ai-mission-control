import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { AppShell } from "./components/AppShell";
import { ApprovalsPage } from "./components/ApprovalsPage";
import { BuildLabPage } from "./components/BuildLabPage";
import { CommandPage } from "./components/CommandPage";
import { OrgChartPage } from "./components/OrgChartPage";
import { KnowledgePage } from "./components/KnowledgePage";
import { RuntimePage } from "./components/RuntimePage";
import { useHashRoute } from "./hooks/useHashRoute";
import { usePollingResource } from "./hooks/usePollingResource";
import { api } from "./lib/api";
import type {
  BriefingArchivePayload,
  BriefingPayload,
  BuildLabPayload,
  CommandPayload,
  CronHealthPayload,
  MemoryFilePayload,
  RoutingRequestPayload,
  RuntimePayload,
  OrgPayload,
} from "./types";

export default function App() {
  const { route, navigate } = useHashRoute();
  const deferredCommandOverview = useDeferredActivation(route === "command", 1500);

  const command = usePollingResource({ load: api.loadCommand, intervalMs: 30000, enabled: route === "command" });
  const buildLab = usePollingResource({
    load: api.loadBuildLab,
    intervalMs: 30000,
    enabled: route === "build-lab" || deferredCommandOverview,
    initialDelayMs: route === "build-lab" ? 0 : 300,
  });
  const runtime = usePollingResource({
    load: api.loadRuntime,
    intervalMs: 30000,
    enabled: route === "runtime" || deferredCommandOverview,
    initialDelayMs: route === "runtime" ? 0 : 500,
  });
  const org = usePollingResource({
    load: api.loadOrg,
    intervalMs: 30000,
    enabled: route === "org-chart" || route === "knowledge" || deferredCommandOverview,
    initialDelayMs: route === "org-chart" || route === "knowledge" ? 0 : 700,
  });
  const briefing = usePollingResource({
    load: api.loadBriefing,
    intervalMs: 30000,
    enabled: deferredCommandOverview,
    initialDelayMs: 900,
  });
  const briefingArchive = usePollingResource({
    load: api.loadBriefingArchive,
    intervalMs: 30000,
    enabled: route === "knowledge" || deferredCommandOverview,
    initialDelayMs: route === "knowledge" ? 0 : 1100,
  });
  const cronHealth = usePollingResource({
    load: api.loadCronHealth,
    intervalMs: 30000,
    enabled: route === "knowledge" || deferredCommandOverview,
    initialDelayMs: route === "knowledge" ? 0 : 1300,
  });
  const memoryFiles = usePollingResource({
    load: api.loadMemoryFiles,
    intervalMs: 30000,
    enabled: route === "knowledge" || deferredCommandOverview,
    initialDelayMs: route === "knowledge" ? 0 : 1500,
  });
  const routingRequests = usePollingResource({
    load: api.loadRoutingRequests,
    intervalMs: 30000,
    enabled: route === "command" || route === "approvals",
    initialDelayMs: 200,
  });

  const lastUpdated = useMemo(() => {
    const timestamps = [command.data, buildLab.data, runtime.data, org.data, briefing.data, briefingArchive.data, cronHealth.data, memoryFiles.data, routingRequests.data]
      .map((entry) => entry?.generatedAt)
      .filter(Boolean) as string[];
    const sorted = timestamps.toSorted();
    return sorted.length ? sorted[sorted.length - 1] : null;
  }, [briefing.data, briefingArchive.data, buildLab.data, command.data, cronHealth.data, memoryFiles.data, org.data, routingRequests.data, runtime.data]);

  const navSignals = useMemo(() => {
    const commandData = command.data?.data as CommandPayload | undefined;
    const commandTasks = commandData?.tasks ?? [];
    const commandBlocked = commandTasks.filter((task) => task.blocked).length;
    const commandActive = commandTasks.filter((task) => task.status === "active").length;

    const orgData = org.data?.data as OrgPayload | undefined;
    const chiefSummary = orgData?.summary?.chiefs;
    const chiefsOnline = chiefSummary?.online ?? 0;
    const chiefsTotal = chiefSummary?.total ?? 0;

    const briefArchiveData = briefingArchive.data?.data as BriefingArchivePayload | undefined;
    const cronData = cronHealth.data?.data as CronHealthPayload | undefined;
    const failedJobs = cronData?.stats?.failed ?? 0;

    const buildLabData = buildLab.data?.data as BuildLabPayload | undefined;
    const runningPrototypes = buildLabData?.prototypes?.stats?.running ?? 0;
    const researchRecords = buildLabData?.research?.summary?.totalRecords ?? 0;

    const runtimeData = runtime.data?.data as RuntimePayload | undefined;
    const runtimeDisconnected = (runtimeData?.sources ?? []).filter((source) => source.state === "disconnected").length;
    const runtimeHealthIssues = (runtimeData?.health?.rows ?? []).filter((item) => item.status !== "healthy").length;

    const approvalData = routingRequests.data?.data as RoutingRequestPayload | undefined;
    const pendingApprovals = approvalData?.stats.pending ?? 0;
    const rejectedApprovals = approvalData?.stats.rejected ?? 0;

    return {
      command: {
        primary: `${commandTasks.length} tasks`,
        secondary: commandBlocked ? `${commandBlocked} blocked` : `${commandActive} active`,
        tone: commandBlocked ? "alert" : commandActive ? "ok" : "neutral",
      },
      approvals: {
        primary: `${pendingApprovals} pending`,
        secondary: rejectedApprovals ? `${rejectedApprovals} rejected` : `${approvalData?.stats.applied ?? 0} applied`,
        tone: pendingApprovals ? "alert" : approvalData ? "ok" : "neutral",
      },
      "org-chart": {
        primary: chiefsTotal ? `${chiefsOnline}/${chiefsTotal} chiefs online` : "Org loading",
        secondary: orgData ? `${orgData.summary.openBlockerCount} blockers` : "Awaiting board link",
        tone: chiefsTotal === 0 ? "warn" : chiefsOnline > 0 ? "ok" : "warn",
      },
      knowledge: {
        primary: `${briefArchiveData?.items?.length ?? 0} records`,
        secondary: failedJobs ? `${failedJobs} cron failures` : "Scheduler steady",
        tone: failedJobs ? "alert" : briefArchiveData ? "ok" : "neutral",
      },
      "build-lab": {
        primary: `${runningPrototypes} running tracks`,
        secondary: `${researchRecords} research records`,
        tone: runningPrototypes > 0 ? "ok" : buildLabData ? "neutral" : "warn",
      },
      runtime: {
        primary: runtimeDisconnected ? `${runtimeDisconnected} disconnected` : "Sources live",
        secondary: runtimeHealthIssues ? `${runtimeHealthIssues} health issues` : `${runtimeData?.sessions?.rows?.length ?? 0} sessions`,
        tone: runtimeDisconnected || runtimeHealthIssues ? "alert" : runtimeData ? "ok" : "warn",
      },
    } as const;
  }, [briefingArchive.data?.data, buildLab.data?.data, command.data?.data, cronHealth.data?.data, org.data?.data, routingRequests.data?.data, runtime.data?.data]);

  const activeView = (() => {
    if (route === "org-chart") {
      return <ModuleGate label="Org Chart" resource={org} render={(payload) => <OrgChartPage payload={payload.data as OrgPayload} />} />;
    }
    if (route === "command") {
      return (
        <CommandPage
          payload={command.data?.data as CommandPayload | undefined}
          commandState={command as any}
          buildLab={buildLab as any}
          runtime={runtime as any}
          org={org as any}
          briefing={briefing as any}
          briefingArchive={briefingArchive as any}
          cronHealth={cronHealth as any}
          memoryFiles={memoryFiles as any}
          routingRequests={routingRequests as any}
          reloadBoard={command.reload}
        />
      );
    }
    if (route === "approvals") {
      return <ApprovalsPage routingRequests={routingRequests as any} />;
    }
    if (route === "knowledge") {
      return <KnowledgePage org={org as any} />;
    }
    if (route === "build-lab") {
      return <ModuleGate label="Build Lab" resource={buildLab} render={(payload) => <BuildLabPage payload={payload.data as BuildLabPayload} />} />;
    }
    return <ModuleGate label="Runtime" resource={runtime} render={(payload) => <RuntimePage payload={payload.data as RuntimePayload} />} />;
  })();

  return (
    <AppShell route={route} onNavigate={navigate} lastUpdated={lastUpdated} navSignals={navSignals}>
      {activeView}
    </AppShell>
  );
}

function useDeferredActivation(active: boolean, delayMs: number) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (active) {
      setEnabled(false);
      const timer = window.setTimeout(() => setEnabled(true), delayMs);
      return () => window.clearTimeout(timer);
    }

    setEnabled(false);
    return undefined;
  }, [active, delayMs]);

  return enabled;
}

function ModuleGate<T>({
  label,
  resource,
  render,
}: {
  label: string;
  resource: { data: T | null; loading: boolean; error: string | null };
  render: (data: T) => ReactElement;
}) {
  if (resource.loading && !resource.data) {
    return (
      <section className="panel page-stack empty-state">
        <h2>{label}</h2>
        <p className="muted">Loading live data…</p>
      </section>
    );
  }

  if (resource.error && !resource.data) {
    return (
      <section className="panel page-stack empty-state">
        <h2>{label}</h2>
        <p className="muted">{resource.error}</p>
      </section>
    );
  }

  if (!resource.data) {
    return (
      <section className="panel page-stack empty-state">
        <h2>{label}</h2>
        <p className="muted">No data available.</p>
      </section>
    );
  }

  return render(resource.data);
}
