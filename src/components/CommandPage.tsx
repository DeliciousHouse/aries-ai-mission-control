import { useMemo, useState } from "react";
import { opsPlaceholders } from "../lib/orgDesign";
import type {
  ApiEnvelope,
  BriefingArchivePayload,
  BriefingPayload,
  BuildLabPayload,
  CommandAttentionItem,
  CommandLoopRecord,
  CommandPayload,
  CronHealthPayload,
  ExecutionTask,
  MemoryFilePayload,
  RuntimePayload,
} from "../types";
import { formatDate } from "../lib/format";

type Props = {
  payload: CommandPayload;
  buildLab: ResourceState<BuildLabPayload>;
  runtime: ResourceState<RuntimePayload>;
  briefing: ResourceState<BriefingPayload>;
  briefingArchive: ResourceState<BriefingArchivePayload>;
  cronHealth: ResourceState<CronHealthPayload>;
  memoryFiles: ResourceState<MemoryFilePayload>;
};

type ResourceState<T> = {
  data: ApiEnvelope<T> | null;
  loading: boolean;
  error: string | null;
};

type ViewFilter = "all" | "frontend" | "backend" | "manual" | "blocked" | "ready-next";

const DASHBOARD_TIME_ZONE = "America/Los_Angeles";
const routeHrefs = {
  command: "/#/command",
  knowledgeOverview: "/#/knowledge",
  knowledgeBriefing: "/?knowledgeView=briefing#/knowledge",
  knowledgeMemory: "/?knowledgeView=memory#/knowledge",
  knowledgeSkills: "/?knowledgeView=skills#/knowledge",
  knowledgeScheduler: "/?knowledgeView=scheduler#/knowledge",
  buildLabOverview: "/#/build-lab",
  buildLabPrototypes: "/?buildLabSection=prototypes#/build-lab",
  buildLabIdeas: "/?buildLabSection=ideas#/build-lab",
  buildLabArtifacts: "/?buildLabSection=artifacts#/build-lab",
  buildLabResearch: "/?buildLabSection=research#/build-lab",
  runtime: "/#/runtime",
};

function matchesView(task: ExecutionTask, view: ViewFilter) {
  if (view === "all") return true;
  if (view === "frontend") return task.owner === "Rohan";
  if (view === "backend") return task.owner === "Roy";
  if (view === "manual") return task.owner === "Somwya";
  if (view === "blocked") return task.blocked || task.status === "blocked";
  if (view === "ready-next") return !task.blocked && task.status !== "done";
  return true;
}

function parseOffsetLabel(label: string) {
  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(label || "");
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * ((hours * 60) + minutes) * 60 * 1000;
}

function timeZoneOffsetMs(date: Date, timeZone = DASHBOARD_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const label = formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value || "GMT+0";
  return parseOffsetLabel(label);
}

function zonedParts(date: Date, timeZone = DASHBOARD_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const lookup = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  return {
    year: lookup.year,
    month: lookup.month,
    day: lookup.day,
    hour: lookup.hour,
    minute: lookup.minute,
    second: lookup.second,
  };
}

function zonedWallTimeToUtcMs(
  { year, month, day, hour = 0, minute = 0, second = 0 }: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone = DASHBOARD_TIME_ZONE,
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  return utcGuess - timeZoneOffsetMs(new Date(utcGuess), timeZone);
}

function lastCheckInCutoffMs(now = new Date(), timeZone = DASHBOARD_TIME_ZONE) {
  const local = zonedParts(now, timeZone);
  const localDay = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if ((local.hour ?? 0) < 22) {
    localDay.setUTCDate(localDay.getUTCDate() - 1);
  }

  return zonedWallTimeToUtcMs(
    {
      year: localDay.getUTCFullYear(),
      month: localDay.getUTCMonth() + 1,
      day: localDay.getUTCDate(),
      hour: 22,
      minute: 0,
      second: 0,
    },
    timeZone,
  );
}

function formatCutoffLabel(cutoffMs: number, timeZone = DASHBOARD_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(cutoffMs));
}

function pickNewest<T>(items: T[], selector: (item: T) => string | null | undefined) {
  const sorted = [...items].sort((left, right) => (Date.parse(selector(right) || "") || 0) - (Date.parse(selector(left) || "") || 0));
  return sorted[0] || null;
}

function statusTone(status: string) {
  if (["failed", "down", "degraded", "danger"].includes(status)) return "danger";
  if (["unavailable", "disconnected", "unknown", "warning"].includes(status)) return "warning";
  if (["healthy", "connected", "Delivered", "success"].includes(status)) return "success";
  return "neutral";
}

function isSinceCutoff(value: string | null | undefined, cutoffMs: number) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) && ms >= cutoffMs;
}

function formatBytes(bytes: number) {
  const labels = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes || 0);
  let index = 0;
  while (value >= 1024 && index < labels.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${index === 0 ? Math.round(value).toString() : value.toFixed(value < 10 ? 1 : 0)} ${labels[index]}`;
}

export function CommandPage({ payload, buildLab, runtime, briefing, briefingArchive, cronHealth, memoryFiles }: Props) {
  const [view, setView] = useState<ViewFilter>("all");
  const [owner, setOwner] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [workstream, setWorkstream] = useState<string>("all");
  const [blockedOnly, setBlockedOnly] = useState(false);

  const filtered = useMemo(
    () =>
      payload.tasks.filter((task) => {
        if (!matchesView(task, view)) return false;
        if (owner !== "all" && task.owner !== owner) return false;
        if (status !== "all" && task.status !== status) return false;
        if (priority !== "all" && task.priority !== priority) return false;
        if (workstream !== "all" && task.workstream !== workstream) return false;
        if (blockedOnly && !task.blocked && task.status !== "blocked") return false;
        return true;
      }),
    [blockedOnly, owner, payload.tasks, priority, status, view, workstream],
  );

  const summary = {
    total: payload.tasks.length,
    blocked: payload.tasks.filter((task) => task.blocked || task.status === "blocked").length,
    ready: payload.tasks.filter((task) => !task.blocked && task.status !== "done").length,
    p0: payload.tasks.filter((task) => task.priority === "P0").length,
  };

  const overview = useMemo(() => {
    const cutoffMs = lastCheckInCutoffMs();
    const cutoffLabel = formatCutoffLabel(cutoffMs);

    const briefingArchiveData = briefingArchive.data?.data;
    const latestBrief = (briefingArchiveData?.items ?? []).find((item) => item.type === "brief") || briefingArchiveData?.items?.[0] || null;
    const briefingData = briefing.data?.data;
    const latestKnowledgeNote =
      (briefingData?.briefs ?? []).find((item) => ["decisions-made", "implementation-lessons", "system-reference", "note"].includes(item.type)) ||
      null;

    const memoryData = memoryFiles.data?.data;
    const latestMemoryFile = (memoryData?.files ?? []).find((file) => /^memory\/\d{4}-\d{2}-\d{2}\.md$/i.test(file.path)) || null;

    const cronData = cronHealth.data?.data;
    const recentJobs = (cronData?.jobs ?? [])
      .filter((job) => isSinceCutoff(job.lastRun, cutoffMs))
      .sort((left, right) => (Date.parse(right.lastRun || "") || 0) - (Date.parse(left.lastRun || "") || 0))
      .map((job) => ({
        id: job.id,
        name: job.name,
        status: job.status,
        lastRun: job.lastRun,
        nextRun: job.nextRun,
        outputTarget: /daily brief/i.test(job.name)
          ? latestBrief?.path || "docs/briefs/<date>-brief.md"
          : /system reference/i.test(job.name)
            ? "docs/SYSTEM-REFERENCE.md"
            : /self-improvement/i.test(job.name)
              ? latestMemoryFile?.path || "memory/YYYY-MM-DD.md"
              : /backup/i.test(job.name)
                ? "openclaw cron list --all --json"
                : null,
        href: routeHrefs.knowledgeScheduler,
      }));

    const runtimeData = runtime.data?.data;
    const serviceIssues = (runtimeData?.health?.rows ?? [])
      .filter((item) => item.status !== "healthy")
      .map((item) => ({
        id: item.id,
        label: item.label,
        status: item.status,
        detail: item.detail,
        updatedAt: item.updatedAt,
        href: routeHrefs.runtime,
      }));

    const activeTaskCount = (runtimeData?.tasks?.rows ?? []).filter((task) => {
      const lowered = (task.status || task.latestStatus || "").toLowerCase();
      return ["running", "in_progress", "queued", "pending"].includes(lowered);
    }).length;

    const buildLabData = buildLab.data?.data;
    const latestArtifact = pickNewest(buildLabData?.artifacts?.items ?? [], (item) => item.updatedAt);
    const latestResearch = pickNewest(buildLabData?.research?.timeline ?? [], (item) => item.updatedAt);
    const latestPrototype = pickNewest(buildLabData?.prototypes?.items ?? [], (item) => item.updatedAt);
    const latestIdea = pickNewest(buildLabData?.ideas?.items ?? [], (item) => item.date);

    const attention: CommandAttentionItem[] = [
      ...recentJobs
        .filter((job) => job.status === "failed")
        .map((job) => ({
          id: `cron-${job.id}`,
          title: `${job.name} failed`,
          detail: job.outputTarget ? `Latest output target: ${job.outputTarget}` : "Inspect scheduler detail for the latest error.",
          tone: "danger" as const,
          href: routeHrefs.knowledgeScheduler,
        })),
      ...serviceIssues.map((issue) => ({
        id: `runtime-${issue.id}`,
        title: `${issue.label} needs attention`,
        detail: issue.detail,
        tone: statusTone(issue.status) as CommandAttentionItem["tone"],
        href: routeHrefs.runtime,
      })),
    ];

    if (latestBrief) {
      attention.push({
        id: `brief-${latestBrief.id}`,
        title: `Latest brief: ${latestBrief.title}`,
        detail: latestBrief.preview,
        tone: "neutral" as const,
        href: routeHrefs.knowledgeBriefing,
      });
    }

    if (latestArtifact) {
      attention.push({
        id: `artifact-${latestArtifact.id}`,
        title: `Latest artifact source: ${latestArtifact.title}`,
        detail: latestArtifact.summary,
        tone: (latestArtifact.state === "available" ? "success" : "warning") as CommandAttentionItem["tone"],
        href: routeHrefs.buildLabArtifacts,
      });
    }

    const loops: CommandLoopRecord[] = [
      {
        id: "daily-brief-loop",
        producer: "Aries daily brief",
        sourceKind: "file",
        sourcePath: latestBrief?.path || "docs/briefs/<date>-brief.md",
        apiEndpoints: ["/api/briefs"],
        consumers: ["Knowledge overview", "Knowledge > Briefing Archive", "Command overnight summary"],
        state: latestBrief ? "connected" : "unavailable",
        detail: latestBrief
          ? "Daily brief cron writes markdown into docs/briefs and both Knowledge and Command read the newest real brief record."
          : "Daily brief output could not be confirmed from docs/briefs.",
        updatedAt: latestBrief?.updatedAt || null,
        href: routeHrefs.knowledgeBriefing,
      },
      {
        id: "overnight-self-improve-loop",
        producer: "Aries overnight self-improvement",
        sourceKind: "file",
        sourcePath: latestMemoryFile?.path || "memory/YYYY-MM-DD.md",
        apiEndpoints: ["/api/memory/files", "/api/app/build-lab/research"],
        consumers: ["Knowledge > Memory Explorer", "Build Lab > Research Dashboard", "Command overnight summary"],
        state: latestMemoryFile ? "connected" : "unavailable",
        detail: latestMemoryFile
          ? "Nightly self-improvement writes dated memory notes that Knowledge reads directly and Build Lab exposes through the research timeline."
          : "No dated memory output was found for the overnight self-improvement loop.",
        updatedAt: latestMemoryFile?.updatedAt || null,
        href: routeHrefs.knowledgeMemory,
      },
      {
        id: "system-reference-loop",
        producer: "Aries rolling system reference",
        sourceKind: "file",
        sourcePath: "docs/SYSTEM-REFERENCE.md",
        apiEndpoints: ["/api/app/briefing"],
        consumers: ["Command overnight summary"],
        state: latestKnowledgeNote ? "connected" : "unavailable",
        detail: latestKnowledgeNote
          ? "System reference refresh contributes to the internal knowledge stream surfaced by Command for morning review."
          : "Latest knowledge note/source could not be confirmed from the current briefing index.",
        updatedAt: latestKnowledgeNote?.updatedAt || null,
        href: routeHrefs.knowledgeOverview,
      },
      {
        id: "backup-health-loop",
        producer: "Aries private repo backup",
        sourceKind: "runtime",
        sourcePath: "openclaw cron list --all --json",
        apiEndpoints: ["/api/cron-health"],
        consumers: ["Knowledge > Scheduler Health", "Command overnight summary"],
        state: (cronData?.jobs ?? []).some((job) => /backup/i.test(job.name)) ? "connected" : "unavailable",
        detail: (cronData?.jobs ?? []).some((job) => /backup/i.test(job.name))
          ? "Backup health is sourced from the live OpenClaw cron surface and reused across Command and Knowledge."
          : "Backup cron job was not returned by the live cron health surface.",
        updatedAt: (cronData?.jobs ?? []).find((job) => /backup/i.test(job.name))?.lastRun || null,
        href: routeHrefs.knowledgeScheduler,
      },
    ];

    return {
      cutoffLabel,
      latestBrief,
      latestKnowledgeNote,
      scheduler: {
        ranSinceCutoff: recentJobs.length,
        recentJobs,
        stats: cronData?.stats ?? { healthy: 0, failed: 0, disabled: 0, unavailable: 0, disconnected: 0 },
      },
      runtime: {
        sessionCount: runtimeData?.sessions?.rows?.length ?? 0,
        activeTaskCount,
        trackedTaskCount: runtimeData?.tasks?.rows?.length ?? 0,
        flowCount: runtimeData?.flows?.rows?.length ?? 0,
        modelUsageCount: runtimeData?.modelUsage?.rows?.length ?? 0,
        usageCostStatus:
          runtimeData?.modelUsage?.usageCost?.totalCost == null
            ? "Unavailable"
            : `$${runtimeData.modelUsage.usageCost.totalCost.toFixed(2)}`,
        serviceIssues,
      },
      buildLab: {
        latestArtifact,
        latestResearch,
        latestPrototype,
        latestIdea,
      },
      attention: attention.slice(0, 8),
      loops,
    };
  }, [briefing.data?.data, briefingArchive.data?.data, buildLab.data?.data, cronHealth.data?.data, memoryFiles.data?.data, runtime.data?.data]);

  return (
    <section className="page-stack accent-ops">
      <header className="page-header panel">
        <div>
          <p className="eyebrow">Command</p>
          <h2>Daily execution view</h2>
          <p className="muted">
            Command now combines internal planning data with real Knowledge, Build Lab, Runtime, and scheduler summaries.
            Planning tasks remain distinct from runtime telemetry.
          </p>
        </div>
        <div className="stats-grid compact-stats">
          <div className="stat-card">
            <span>Total tasks</span>
            <strong>{summary.total}</strong>
          </div>
          <div className="stat-card warning">
            <span>Blocked</span>
            <strong>{summary.blocked}</strong>
          </div>
          <div className="stat-card success">
            <span>Ready next</span>
            <strong>{summary.ready}</strong>
          </div>
          <div className="stat-card danger">
            <span>P0</span>
            <strong>{summary.p0}</strong>
          </div>
        </div>
      </header>

      <section className="panel page-stack">
        <div className="section-split align-end">
          <div>
            <p className="eyebrow">Since last check-in</p>
            <h3>Overnight Summary</h3>
            <p className="muted">
              Current cutoff: <strong>{overview.cutoffLabel}</strong>. This summary is built from live scheduler,
              runtime, Knowledge, and Build Lab APIs.
            </p>
          </div>
          <a className="secondary-button overview-link-button" href={routeHrefs.knowledgeScheduler}>
            Open scheduler detail
          </a>
        </div>

        <div className="overview-tile-grid">
          <OverviewCard
            title="Latest Brief"
            subtitle={overview.latestBrief?.title || "Unknown / unavailable"}
            detail={overview.latestBrief?.preview || resourceDetail(briefingArchive)}
            meta={[
              overview.latestBrief?.updatedAt ? `Updated ${formatDate(overview.latestBrief.updatedAt)}` : "Updated unavailable",
              overview.latestBrief?.deliveryStatus || "Unknown",
              overview.latestBrief?.path || "No source file",
            ]}
            href={routeHrefs.knowledgeBriefing}
            sourceEndpoint="/api/briefs"
          />
          <OverviewCard
            title="Scheduler"
            subtitle={`${overview.scheduler.ranSinceCutoff} jobs since cutoff`}
            detail={`Healthy ${overview.scheduler.stats.healthy} • Failed ${overview.scheduler.stats.failed} • Disabled ${overview.scheduler.stats.disabled} • Unavailable ${overview.scheduler.stats.unavailable + overview.scheduler.stats.disconnected}`}
            meta={overview.scheduler.recentJobs.length ? overview.scheduler.recentJobs.slice(0, 3).map((job) => `${job.name} → ${job.status}`) : [resourceDetail(cronHealth)]}
            href={routeHrefs.knowledgeScheduler}
            sourceEndpoint="/api/cron-health"
          />
          <OverviewCard
            title="Runtime"
            subtitle={`${overview.runtime.sessionCount} sessions • ${overview.runtime.activeTaskCount} active tasks`}
            detail={`Tracked tasks ${overview.runtime.trackedTaskCount} • Flows ${overview.runtime.flowCount} • Models ${overview.runtime.modelUsageCount} • Cost ${overview.runtime.usageCostStatus}`}
            meta={overview.runtime.serviceIssues.length ? overview.runtime.serviceIssues.slice(0, 3).map((issue) => `${issue.label} → ${issue.status}`) : [resourceDetail(runtime)]}
            href={routeHrefs.runtime}
            sourceEndpoint="/api/app/runtime"
          />
          <OverviewCard
            title="Build Lab"
            subtitle={overview.buildLab.latestArtifact?.title || overview.buildLab.latestResearch?.title || "Unavailable"}
            detail={overview.buildLab.latestArtifact?.summary || overview.buildLab.latestResearch?.summary || resourceDetail(buildLab)}
            meta={[
              overview.buildLab.latestArtifact?.updatedAt ? `Artifact ${formatDate(overview.buildLab.latestArtifact.updatedAt)}` : "Artifact unavailable",
              overview.buildLab.latestResearch?.updatedAt ? `Research ${formatDate(overview.buildLab.latestResearch.updatedAt)}` : "Research unavailable",
              overview.buildLab.latestPrototype?.name ? `Prototype ${overview.buildLab.latestPrototype.name}` : "Prototype unavailable",
            ]}
            href={overview.buildLab.latestArtifact ? routeHrefs.buildLabArtifacts : routeHrefs.buildLabOverview}
            sourceEndpoint="/api/app/build-lab"
          />
        </div>
      </section>

      <section className="panel page-stack">
        <div className="section-split">
          <div>
            <p className="eyebrow">Needs attention first</p>
            <h3>Cross-module attention queue</h3>
            <p className="muted">Only real scheduler failures, runtime issues, briefs, and build outputs are surfaced here.</p>
          </div>
          <a className="secondary-button overview-link-button" href={routeHrefs.runtime}>
            Open Runtime
          </a>
        </div>

        {overview.attention.length ? (
          <div className="attention-list">
            {overview.attention.map((item) => (
              <AttentionCard item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <h3>No urgent cross-module items</h3>
            <p className="muted">Nothing from scheduler, runtime, Knowledge, or Build Lab currently needs immediate escalation.</p>
          </div>
        )}
      </section>

      <section className="panel page-stack">
        <div className="section-split">
          <div>
            <p className="eyebrow">Connected loops</p>
            <h3>Scheduler-to-dashboard data flows</h3>
            <p className="muted">Each loop below is backed by a real file or a real runtime source already present in this environment.</p>
          </div>
        </div>
        <div className="integration-grid">
          {overview.loops.map((loop) => (
            <LoopCard item={loop} key={loop.id} />
          ))}
        </div>
      </section>

      {overview.latestKnowledgeNote ? (
        <section className="panel page-stack">
          <div className="section-split">
            <div>
              <p className="eyebrow">Latest knowledge note</p>
              <h3>{overview.latestKnowledgeNote.title}</h3>
            </div>
            <a className="secondary-button overview-link-button" href={routeHrefs.knowledgeOverview}>
              Open Knowledge
            </a>
          </div>
          <p className="muted">{overview.latestKnowledgeNote.summary}</p>
          <div className="ref-row">
            <code>{overview.latestKnowledgeNote.path || "Unavailable"}</code>
            <code>/api/app/briefing</code>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="toolbar">
          <div className="tab-row">
            {payload.views.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`tab-button ${view === item.id ? "is-active" : ""}`}
                onClick={() => setView(item.id as ViewFilter)}
              >
                {item.label} <span>{item.count}</span>
              </button>
            ))}
          </div>

          <div className="filters-grid">
            <label>
              Owner
              <select value={owner} onChange={(event) => setOwner(event.target.value)}>
                <option value="all">All</option>
                {payload.owners.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All</option>
                <option value="todo">Todo</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
            </label>
            <label>
              Priority
              <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                <option value="all">All</option>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
            </label>
            <label>
              Workstream
              <select value={workstream} onChange={(event) => setWorkstream(event.target.value)}>
                <option value="all">All</option>
                {payload.workstreams.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-filter">
              <input
                checked={blockedOnly}
                onChange={(event) => setBlockedOnly(event.target.checked)}
                type="checkbox"
              />
              Blocked only
            </label>
          </div>
        </div>
      </section>

      <section className="panel table-panel">
        {filtered.length ? (
          <div className="table-scroll">
            <table className="data-table responsive-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Workstream</th>
                  <th>Due</th>
                  <th>Blocker</th>
                  <th>Dependencies</th>
                  <th>Next action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task) => (
                  <tr key={task.id}>
                    <td data-label="Task">
                      <strong>{task.title}</strong>
                      <p className="cell-note">{task.description}</p>
                      <div className="ref-row">
                        {task.sourceRefs.map((ref) => (
                          <code key={ref}>{ref}</code>
                        ))}
                      </div>
                    </td>
                    <td data-label="Owner">{task.owner}</td>
                    <td data-label="Status">
                      <span className={`badge status-${task.status}`}>{task.status.replace("_", " ")}</span>
                    </td>
                    <td data-label="Priority">
                      <span className={`badge priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                    </td>
                    <td data-label="Workstream">{task.workstream}</td>
                    <td data-label="Due">{formatDate(task.dueDate)}</td>
                    <td data-label="Blocker">
                      {task.blocked || task.status === "blocked" ? (
                        <span className="badge status-blocked">{task.blockerReason ?? "Blocked"}</span>
                      ) : (
                        <span className="muted">Clear</span>
                      )}
                    </td>
                    <td data-label="Dependencies">
                      {task.dependencies.length ? (
                        <ul className="inline-list">
                          {task.dependencies.map((dependency) => (
                            <li key={dependency}>{dependency}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </td>
                    <td data-label="Next action">{task.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <h3>No tasks match the current filters</h3>
            <p className="muted">The execution board is live, but this filter combination is empty.</p>
          </div>
        )}
      </section>

      <section className="panel page-stack">
        <div className="section-split">
          <div>
            <p className="eyebrow">Episode 3 ops scaffolding</p>
            <h3>Coverage, handoff, and workload placeholders</h3>
            <p className="muted">
              Lightweight internal planning structures only. These placeholders support org-design decisions without pretending to be live telemetry.
            </p>
          </div>
          <span className="badge neutral">Fill-in ready</span>
        </div>

        <div className="placeholder-grid">
          {opsPlaceholders.map((placeholder) => (
            <article className="list-card placeholder-card" key={placeholder.id}>
              <div className="section-split">
                <div>
                  <strong>{placeholder.title}</strong>
                  <p className="cell-note">{placeholder.surface} surface</p>
                </div>
                <span className="badge neutral">Register</span>
              </div>
              <p>{placeholder.purpose}</p>
              <div className="placeholder-columns">
                {placeholder.columns.map((column) => (
                  <code key={column}>{column}</code>
                ))}
              </div>
              <div className="placeholder-example">
                {placeholder.exampleRow.map((value, index) => (
                  <div className="placeholder-example-row" key={`${placeholder.id}-${placeholder.columns[index]}`}>
                    <span>{placeholder.columns[index]}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function OverviewCard({
  title,
  subtitle,
  detail,
  meta,
  href,
  sourceEndpoint,
}: {
  title: string;
  subtitle: string;
  detail: string;
  meta: string[];
  href: string;
  sourceEndpoint: string;
}) {
  return (
    <article className="list-card overview-card">
      <div className="section-split">
        <div>
          <p className="eyebrow">{title}</p>
          <h3>{subtitle}</h3>
        </div>
        <code>{sourceEndpoint}</code>
      </div>
      <p className="muted">{detail}</p>
      <ul className="inline-list with-spacing">
        {meta.map((item) => (
          <li key={`${title}-${item}`}>{item}</li>
        ))}
      </ul>
      <a className="secondary-button overview-link-button" href={href}>
        Open detail
      </a>
    </article>
  );
}

function AttentionCard({ item }: { item: CommandAttentionItem }) {
  return (
    <article className={`list-card attention-card tone-${item.tone}`}>
      <div className="section-split">
        <strong>{item.title}</strong>
        <span className={`badge ${item.tone === "danger" ? "status-failed" : item.tone === "warning" ? "status-unavailable" : item.tone === "success" ? "status-connected" : "neutral"}`}>
          {item.tone}
        </span>
      </div>
      <p className="muted">{item.detail}</p>
      <a className="secondary-button overview-link-button" href={item.href}>
        Open owning detail
      </a>
    </article>
  );
}

function LoopCard({ item }: { item: CommandLoopRecord }) {
  return (
    <article className="list-card integration-card">
      <div className="section-split">
        <div>
          <p className="eyebrow">{item.producer}</p>
          <h3>{item.state === "connected" ? "Connected" : "Unavailable"}</h3>
        </div>
        <span className={`badge ${item.state === "connected" ? "status-connected" : "status-unavailable"}`}>{item.sourceKind}</span>
      </div>
      <p className="muted">{item.detail}</p>
      <dl className="lab-key-value compact-key-value">
        <div>
          <dt>Source</dt>
          <dd>{item.sourcePath}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatDate(item.updatedAt)}</dd>
        </div>
      </dl>
      <div className="ref-row">
        {item.apiEndpoints.map((endpoint) => (
          <code key={`${item.id}-${endpoint}`}>{endpoint}</code>
        ))}
      </div>
      <ul className="inline-list with-spacing">
        {item.consumers.map((consumer) => (
          <li key={`${item.id}-${consumer}`}>{consumer}</li>
        ))}
      </ul>
      <a className="secondary-button overview-link-button" href={item.href}>
        Open consumer detail
      </a>
    </article>
  );
}

function resourceDetail<T>(state: ResourceState<T>) {
  if (state.loading) return "Loading…";
  if (state.error) return state.error;
  return "Connected";
}
