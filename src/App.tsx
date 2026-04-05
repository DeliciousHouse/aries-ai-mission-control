import { useMemo } from "react";
import type { ReactElement } from "react";
import { AppShell } from "./components/AppShell";
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
  RuntimePayload,
} from "./types";

export default function App() {
  const { route, navigate } = useHashRoute();

  const command = usePollingResource({ load: api.loadCommand, intervalMs: 30000 });
  const buildLab = usePollingResource({ load: api.loadBuildLab, intervalMs: 30000 });
  const runtime = usePollingResource({ load: api.loadRuntime, intervalMs: 30000 });
  const briefing = usePollingResource({ load: api.loadBriefing, intervalMs: 30000 });
  const briefingArchive = usePollingResource({ load: api.loadBriefingArchive, intervalMs: 30000 });
  const cronHealth = usePollingResource({ load: api.loadCronHealth, intervalMs: 30000 });
  const memoryFiles = usePollingResource({ load: api.loadMemoryFiles, intervalMs: 30000 });

  const lastUpdated = useMemo(() => {
    const timestamps = [command.data, buildLab.data, runtime.data, briefing.data, briefingArchive.data, cronHealth.data, memoryFiles.data]
      .map((entry) => entry?.generatedAt)
      .filter(Boolean) as string[];
    const sorted = timestamps.sort();
    return sorted.length ? sorted[sorted.length - 1] : null;
  }, [briefing.data, briefingArchive.data, buildLab.data, command.data, cronHealth.data, memoryFiles.data, runtime.data]);

  const activeView = (() => {
    if (route === "org-chart") {
      return <OrgChartPage />;
    }
    if (route === "command") {
      return (
        <ModuleGate
          label="Command"
          resource={command}
          render={(payload) => (
            <CommandPage
              payload={payload.data as CommandPayload}
              buildLab={buildLab as any}
              runtime={runtime as any}
              briefing={briefing as any}
              briefingArchive={briefingArchive as any}
              cronHealth={cronHealth as any}
              memoryFiles={memoryFiles as any}
            />
          )}
        />
      );
    }
    if (route === "knowledge") {
      return <KnowledgePage />;
    }
    if (route === "build-lab") {
      return <ModuleGate label="Build Lab" resource={buildLab} render={(payload) => <BuildLabPage payload={payload.data as BuildLabPayload} />} />;
    }
    return <ModuleGate label="Runtime" resource={runtime} render={(payload) => <RuntimePage payload={payload.data as RuntimePayload} />} />;
  })();

  return (
    <AppShell route={route} onNavigate={navigate} lastUpdated={lastUpdated}>
      {activeView}
    </AppShell>
  );
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
