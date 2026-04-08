import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ProjectBoardSection } from "./ProjectBoardSection";
import { RoutingRequestsPanel } from "./RoutingRequestsPanel";
import { orgMemberHref } from "../lib/orgLinks";
import type {
  ApiEnvelope,
  BriefingArchivePayload,
  BriefingPayload,
  BuildLabPayload,
  CommandAttentionItem,
  CommandLoopRecord,
  CommandPayload,
  CronHealthPayload,
  MemoryFilePayload,
  OrgPayload,
  ProjectBoardActor,
  RoutingRequestPayload,
  RuntimePayload,
} from "../types";
import { formatDate } from "../lib/format";

type Props = {
  payload?: CommandPayload;
  commandState: ResourceState<CommandPayload>;
  buildLab: ResourceState<BuildLabPayload>;
  runtime: ResourceState<RuntimePayload>;
  org: ResourceState<OrgPayload>;
  briefing: ResourceState<BriefingPayload>;
  briefingArchive: ResourceState<BriefingArchivePayload>;
  cronHealth: ResourceState<CronHealthPayload>;
  memoryFiles: ResourceState<MemoryFilePayload>;
  routingRequests: ResourceState<RoutingRequestPayload>;
  reloadBoard: () => Promise<void>;
};

type ResourceState<T> = {
  data: ApiEnvelope<T> | null;
  loading: boolean;
  error: string | null;
  attempted?: boolean;
  reload: () => Promise<void>;
};

type OwnerLoadCardRecord = {
  id: string;
  label: string;
  shortLabel: string;
  emoji: string;
  href: string;
  total: number;
  open: number;
  blocked: number;
  active: number;
  review: number;
  shipped: number;
  nextAction: string;
  updatedAt: string | null;
  runtimeStatus: string | null;
  runtimeModel: string | null;
  assigneeType: ProjectBoardActor["assigneeType"];
};

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

function parseOffsetLabel(label: string) {
  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(label || "");
  if (!match) {return 0;}
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
  const sorted = [...items].toSorted((left, right) => (Date.parse(selector(right) || "") || 0) - (Date.parse(selector(left) || "") || 0));
  return sorted[0] || null;
}

function statusTone(status: string) {
  if (["failed", "down", "degraded", "danger"].includes(status)) {return "danger";}
  if (["unavailable", "disconnected", "unknown", "warning", "offline"].includes(status)) {return "warning";}
  if (["healthy", "connected", "Delivered", "success", "online"].includes(status)) {return "success";}
  return "neutral";
}

function isSinceCutoff(value: string | null | undefined, cutoffMs: number) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) && ms >= cutoffMs;
}

function shortDisplayName(actor: ProjectBoardActor | undefined, fallback: string) {
  const display = actor?.displayName || fallback;
  return display.replace(/^\S+\s+/, "").trim() || display;
}

function ownerToneClass(record: OwnerLoadCardRecord) {
  if (record.id === "jarvis") {return "tone-jarvis";}
  if (record.id === "forge") {return "tone-forge";}
  if (record.id === "signal") {return "tone-signal";}
  if (record.id === "ledger") {return "tone-ledger";}
  if (record.assigneeType === "human-collaborator") {return "tone-human";}
  return "tone-neutral";
}

export function CommandPage({ payload, commandState, buildLab, runtime, org, briefing, briefingArchive, cronHealth, memoryFiles, routingRequests, reloadBoard }: Props) {
  const tasks = payload?.tasks ?? [];
  const actors = payload?.actors ?? [];
  const actorById = useMemo(() => new Map(actors.map((actor) => [actor.id, actor])), [actors]);

  const boardSummary = useMemo(
    () => ({
      total: tasks.length,
      blocked: tasks.filter((task) => task.blocked).length,
      stale: tasks.filter((task) => task.stale).length,
      active: tasks.filter((task) => task.status === "active").length,
      ready: tasks.filter((task) => task.status === "ready").length,
      review: tasks.filter((task) => task.status === "review").length,
      p0: tasks.filter((task) => task.priority === "P0").length,
      missionControl: tasks.filter((task) => task.systemScope === "mission-control").length,
    }),
    [tasks],
  );

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
      .toSorted((left, right) => (Date.parse(right.lastRun || "") || 0) - (Date.parse(left.lastRun || "") || 0))
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

    const disconnectedSources = (runtimeData?.sources ?? []).filter((source) => source.state === "disconnected");

    const activeTaskCount = (runtimeData?.tasks?.rows ?? []).filter((task) => {
      const lowered = (task.status || task.latestStatus || "").toLowerCase();
      return ["running", "in_progress", "queued", "pending"].includes(lowered);
    }).length;

    const buildLabData = buildLab.data?.data;
    const latestArtifact = pickNewest(buildLabData?.artifacts?.items ?? [], (item) => item.updatedAt);
    const latestResearch = pickNewest(buildLabData?.research?.timeline ?? [], (item) => item.updatedAt);
    const latestPrototype = pickNewest(buildLabData?.prototypes?.items ?? [], (item) => item.updatedAt);
    const latestIdea = pickNewest(buildLabData?.ideas?.items ?? [], (item) => item.date);
    const orgData = org.data?.data;

    const delegationQueueTasks = tasks
      .filter((task) => ["intake", "scoping", "ready"].includes(task.status))
      .toSorted((left, right) => (Date.parse(right.updatedAt || "") || 0) - (Date.parse(left.updatedAt || "") || 0));

    const delegationQueueByAssignee = delegationQueueTasks.reduce<Record<string, { label: string; href: string; count: number; tasks: string[] }>>((accumulator, task) => {
      if (!accumulator[task.assigneeId]) {
        accumulator[task.assigneeId] = {
          label: task.assigneeDisplayName,
          href: orgMemberHref(task.assigneeId),
          count: 0,
          tasks: [],
        };
      }
      accumulator[task.assigneeId].count += 1;
      if (accumulator[task.assigneeId].tasks.length < 2) {
        accumulator[task.assigneeId].tasks.push(task.title);
      }
      return accumulator;
    }, {});

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

    disconnectedSources.forEach((source) => {
      attention.push({
        id: `source-${source.id}`,
        title: `${source.label} is disconnected`,
        detail: source.detail,
        tone: "warning",
        href: routeHrefs.runtime,
      });
    });

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
        disconnectedSources,
      },
      buildLab: {
        latestArtifact,
        latestResearch,
        latestPrototype,
        latestIdea,
      },
      org: {
        latestStandup: orgData?.latestStandup || null,
        teamHealth: orgData?.summary || null,
      },
      delegationQueue: {
        total: delegationQueueTasks.length,
        groups: Object.values(delegationQueueByAssignee)
          .toSorted((left, right) => right.count - left.count || left.label.localeCompare(right.label))
          .slice(0, 4),
      },
      attention: attention.slice(0, 8),
      loops,
    };
  }, [briefing.data?.data, briefingArchive.data?.data, buildLab.data?.data, cronHealth.data?.data, memoryFiles.data?.data, org.data?.data, runtime.data?.data, tasks]);

  const ownerLoad = useMemo<OwnerLoadCardRecord[]>(() => {
    const orgMembers = org.data?.data?.members ?? [];

    return Array.from(
      tasks.reduce<Map<string, typeof tasks>>((accumulator, task) => {
        const bucket = accumulator.get(task.assigneeId) ?? [];
        bucket.push(task);
        accumulator.set(task.assigneeId, bucket);
        return accumulator;
      }, new Map()).entries(),
    )
      .map(([assigneeId, assigneeTasks]) => {
        const actor = actorById.get(assigneeId);
        const member = orgMembers.find((entry) => entry.id === assigneeId);
        const shipped = assigneeTasks.filter((task) => task.status === "shipped").length;
        const open = assigneeTasks.length - shipped;
        const newestTask = [...assigneeTasks].toSorted((left, right) => (Date.parse(right.updatedAt || "") || 0) - (Date.parse(left.updatedAt || "") || 0))[0] || null;

        return {
          id: assigneeId,
          label: actor?.displayName || newestTask?.assigneeDisplayName || assigneeId,
          shortLabel: shortDisplayName(actor, newestTask?.assigneeDisplayName || assigneeId),
          emoji: actor?.emoji || newestTask?.assigneeDisplayName?.split(" ")[0] || "•",
          href: orgMemberHref(assigneeId),
          total: assigneeTasks.length,
          open,
          blocked: assigneeTasks.filter((task) => task.blocked).length,
          active: assigneeTasks.filter((task) => task.status === "active").length,
          review: assigneeTasks.filter((task) => task.status === "review").length,
          shipped,
          nextAction: newestTask?.nextAction || newestTask?.description || "No next action recorded.",
          updatedAt: newestTask?.updatedAt || null,
          runtimeStatus: member?.runtime?.status || null,
          runtimeModel: member?.runtime?.currentModel || null,
          assigneeType: actor?.assigneeType || newestTask?.assigneeType || "ai-specialist",
        } satisfies OwnerLoadCardRecord;
      })
      .toSorted((left, right) => right.open - left.open || right.blocked - left.blocked || (Date.parse(right.updatedAt || "") || 0) - (Date.parse(left.updatedAt || "") || 0))
      .slice(0, 6);
  }, [actorById, org.data?.data?.members, tasks]);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: false,
    attention: true,
    loops: false,
    knowledge: false,
  });

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  const attentionCount = overview.attention.length;
  const dangerCount = overview.attention.filter((item) => item.tone === "danger").length;
  const runtimeDriftCount = overview.runtime.serviceIssues.length + overview.runtime.disconnectedSources.length;
  const onlineChiefs = overview.org.teamHealth?.chiefs?.online ?? 0;
  const chiefTotal = overview.org.teamHealth?.chiefs?.total ?? 0;

  return (
    <section className="page-stack accent-ops command-page-shell">
      <header className="page-header panel command-hero-panel mission-header-panel">
        <div className="mission-header-copy">
          <p className="eyebrow">Command</p>
          <h2>Operational execution center</h2>
          <p className="muted">
            This pass keeps the live board, owner graph, and runtime surfaces intact, but makes the dashboard sharper, denser, and easier to steer.
          </p>
        </div>
        <div className="board-summary-strip">
          <span className="summary-chip"><span>Tasks</span> <strong>{boardSummary.total}</strong></span>
          <span className="summary-chip has-success"><span>Active</span> <strong>{boardSummary.active}</strong></span>
          <span className={`summary-chip ${boardSummary.ready ? "has-success" : ""}`}><span>Ready</span> <strong>{boardSummary.ready}</strong></span>
          <span className={`summary-chip ${boardSummary.review ? "has-warning" : ""}`}><span>Review</span> <strong>{boardSummary.review}</strong></span>
          <span className={`summary-chip ${boardSummary.blocked ? "has-warning" : ""}`}><span>Blocked</span> <strong>{boardSummary.blocked}</strong></span>
          <span className={`summary-chip ${boardSummary.p0 ? "has-danger" : ""}`}><span>P0</span> <strong>{boardSummary.p0}</strong></span>
          <span className="summary-chip"><span>Mission Control</span> <strong>{boardSummary.missionControl}</strong></span>
          {dangerCount > 0 ? <span className="summary-chip has-danger"><span>Alerts</span> <strong>{dangerCount}</strong></span> : null}
        </div>
      </header>

      <section className="mission-meter-grid">
        <MissionMeterCard
          eyebrow="Execution pressure"
          title={`${boardSummary.active} active • ${boardSummary.ready} ready`}
          detail={`${boardSummary.review} in review • ${boardSummary.blocked} blocked`}
          footer="Live board state from /api/pm-board"
          tone={boardSummary.blocked ? "danger" : boardSummary.active ? "success" : "neutral"}
        />
        <MissionMeterCard
          eyebrow="Owner coverage"
          title={chiefTotal ? `${onlineChiefs}/${chiefTotal} chiefs online` : "Owner surface loading"}
          detail={ownerLoad.length ? `${ownerLoad.length} tracked lanes with live board load` : "No owner load available yet"}
          footer={overview.org.teamHealth ? `${overview.org.teamHealth.openBlockerCount} open blockers across org` : resourceDetail(org)}
          tone={onlineChiefs > 0 ? "success" : chiefTotal ? "warning" : "neutral"}
        />
        <MissionMeterCard
          eyebrow="Runtime drift"
          title={runtimeDriftCount ? `${runtimeDriftCount} runtime issues` : "Runtime shell stable"}
          detail={`${overview.scheduler.stats.failed} failed cron jobs • ${overview.runtime.sessionCount} sessions visible`}
          footer={overview.runtime.disconnectedSources.length ? "Disconnected sources are surfaced directly in attention." : "No disconnected sources reported right now."}
          tone={runtimeDriftCount || overview.scheduler.stats.failed ? "danger" : "success"}
        />
        <MissionMeterCard
          eyebrow="Overnight handoff"
          title={overview.latestBrief?.title || "No brief detected"}
          detail={overview.latestKnowledgeNote?.title || "No knowledge note detected"}
          footer={`Cutoff ${overview.cutoffLabel}`}
          tone={overview.latestBrief ? "success" : "warning"}
        />
      </section>

      {ownerLoad.length ? (
        <section className="panel page-stack owner-load-panel">
          <div className="section-split">
            <div>
              <p className="eyebrow">Lane load</p>
              <h3>Who owns pressure right now</h3>
              <p className="muted">Board load stays linked to the existing org file and detail routes.</p>
            </div>
            <span className="badge neutral">{ownerLoad.length} visible owners</span>
          </div>
          <div className="board-assignee-stats-row owner-load-grid">
            {ownerLoad.map((owner) => (
              <OwnerLoadCard key={owner.id} record={owner} />
            ))}
          </div>
        </section>
      ) : null}

      <RoutingRequestsPanel state={routingRequests} />

      {payload ? (
        <ProjectBoardSection payload={payload} onReload={reloadBoard} />
      ) : (
        <section className="panel page-stack project-board-shell" aria-busy={commandState.loading}>
          <div className="section-split">
            <div>
              <p className="eyebrow">Project Board</p>
              <h3>{commandState.error ? "Project Board unavailable" : "Loading Project Board"}</h3>
              <p className="muted">
                {commandState.error
                  ? commandState.error
                  : "Live board data is loading separately so slow background APIs do not block first paint."}
              </p>
            </div>
            <span className={`badge ${commandState.error ? "status-failed" : commandState.loading ? "status-unavailable" : "neutral"}`}>
              {commandState.error ? "Error" : commandState.loading ? "Loading" : "Deferred"}
            </span>
          </div>
          <div className="overview-tile-grid command-shell-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <article className="list-card skeleton-card" key={`command-shell-${index}`}>
                <div className="skeleton-line skeleton-line-short" />
                <div className="skeleton-line skeleton-line-title" />
                <div className="skeleton-line" />
              </article>
            ))}
          </div>
        </section>
      )}

      <CollapsibleSection
        id="attention"
        eyebrow="Needs attention"
        title={`Attention queue${attentionCount ? ` (${attentionCount})` : ""}`}
        expanded={expandedSections.attention}
        onToggle={toggleSection}
        badge={dangerCount > 0 ? <span className="badge status-failed">{dangerCount} alert{dangerCount === 1 ? "" : "s"}</span> : undefined}
      >
        {overview.attention.length ? (
          <div className="attention-list">
            {overview.attention.map((item) => (
              <AttentionCard item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <p className="muted">No urgent cross-module items right now.</p>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        id="overview"
        eyebrow="Since last check-in"
        title="Overnight summary"
        expanded={expandedSections.overview}
        onToggle={toggleSection}
        badge={<span className="badge neutral">{overview.cutoffLabel}</span>}
      >
        <div className="compact-overview-grid">
          <OverviewCard
            title="Latest Brief"
            subtitle={overview.latestBrief?.title || "Unavailable"}
            detail={overview.latestBrief?.preview || resourceDetail(briefingArchive)}
            meta={[
              overview.latestBrief?.updatedAt ? `Updated ${formatDate(overview.latestBrief.updatedAt)}` : "Updated unavailable",
              overview.latestBrief?.deliveryStatus || "Unknown",
            ]}
            href={routeHrefs.knowledgeBriefing}
          />
          <OverviewCard
            title="Scheduler"
            subtitle={`${overview.scheduler.ranSinceCutoff} jobs since cutoff`}
            detail={`Healthy ${overview.scheduler.stats.healthy} • Failed ${overview.scheduler.stats.failed} • Disabled ${overview.scheduler.stats.disabled}`}
            meta={overview.scheduler.recentJobs.length ? overview.scheduler.recentJobs.slice(0, 2).map((job) => `${job.name} → ${job.status}`) : [resourceDetail(cronHealth)]}
            href={routeHrefs.knowledgeScheduler}
          />
          <OverviewCard
            title="Runtime"
            subtitle={`${overview.runtime.sessionCount} sessions • ${overview.runtime.activeTaskCount} active`}
            detail={`Tasks ${overview.runtime.trackedTaskCount} • Flows ${overview.runtime.flowCount} • Cost ${overview.runtime.usageCostStatus}`}
            meta={overview.runtime.serviceIssues.length ? overview.runtime.serviceIssues.slice(0, 2).map((issue) => `${issue.label} → ${issue.status}`) : [resourceDetail(runtime)]}
            href={routeHrefs.runtime}
          />
          <OverviewCard
            title="Last Standup"
            subtitle={overview.org.latestStandup?.title || "No saved transcript"}
            detail={overview.org.latestStandup
              ? `${overview.org.latestStandup.respondingChiefCount ?? 0}/${overview.org.latestStandup.chiefCount ?? 0} chiefs responded`
              : resourceDetail(org)}
            meta={overview.org.latestStandup
              ? [overview.org.latestStandup.date || "Date unavailable", overview.org.latestStandup.status || "Status unavailable"]
              : [resourceDetail(org)]}
            href="/?knowledgeView=standups#/knowledge"
          />
          <OverviewCard
            title="Delegation Queue"
            subtitle={overview.delegationQueue.total ? `${overview.delegationQueue.total} waiting` : "No waiting tasks"}
            detail={overview.delegationQueue.groups.length
              ? `${overview.delegationQueue.groups[0].label} has ${overview.delegationQueue.groups[0].count}`
              : "No board tasks waiting to start."}
            meta={overview.delegationQueue.groups.length
              ? overview.delegationQueue.groups.slice(0, 3).map((group) => `${group.label} → ${group.count}`)
              : ["No matching tasks"]}
            href={routeHrefs.command}
          />
          <OverviewCard
            title="Build Lab"
            subtitle={overview.buildLab.latestArtifact?.title || overview.buildLab.latestResearch?.title || "Unavailable"}
            detail={overview.buildLab.latestArtifact?.summary || overview.buildLab.latestResearch?.summary || resourceDetail(buildLab)}
            meta={[
              overview.buildLab.latestPrototype?.name ? `Prototype: ${overview.buildLab.latestPrototype.name}` : "No prototype",
              overview.buildLab.latestResearch?.updatedAt ? `Research ${formatDate(overview.buildLab.latestResearch.updatedAt)}` : "Research unavailable",
            ]}
            href={overview.buildLab.latestArtifact ? routeHrefs.buildLabArtifacts : routeHrefs.buildLabOverview}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="loops"
        eyebrow="Data flows"
        title="Connected loops"
        expanded={expandedSections.loops}
        onToggle={toggleSection}
        badge={<span className="badge neutral">{overview.loops.filter((loop) => loop.state === "connected").length}/{overview.loops.length} connected</span>}
      >
        <div className="integration-grid">
          {overview.loops.map((loop) => (
            <LoopCard item={loop} key={loop.id} />
          ))}
        </div>
      </CollapsibleSection>

      {overview.latestKnowledgeNote ? (
        <CollapsibleSection
          id="knowledge"
          eyebrow="Latest knowledge note"
          title={overview.latestKnowledgeNote.title}
          expanded={expandedSections.knowledge}
          onToggle={toggleSection}
        >
          <p className="muted">{overview.latestKnowledgeNote.summary}</p>
          <div className="ref-row">
            <code>{overview.latestKnowledgeNote.path || "Unavailable"}</code>
            <code>/api/app/briefing</code>
          </div>
          <a className="secondary-button overview-link-button" href={routeHrefs.knowledgeOverview}>
            Open Knowledge
          </a>
        </CollapsibleSection>
      ) : null}
    </section>
  );
}

function MissionMeterCard({
  eyebrow,
  title,
  detail,
  footer,
  tone,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  footer: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  return (
    <article className={`panel mission-meter-card tone-${tone}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p className="muted">{detail}</p>
      <span className={`signal-badge tone-${tone}`}>{footer}</span>
    </article>
  );
}

function OwnerLoadCard({ record }: { record: OwnerLoadCardRecord }) {
  const progressValue = record.total ? Math.round((record.shipped / record.total) * 100) : 0;
  const runtimeTone = statusTone(record.runtimeStatus || "neutral");

  return (
    <article className={`board-assignee-stat owner-load-card ${ownerToneClass(record)}`}>
      <div className="section-split">
        <a className="board-assignee-link" href={record.href}>
          <span className="assignee-emoji">{record.emoji}</span>
          <span>{record.shortLabel}</span>
        </a>
        <span className={`badge ${record.blocked ? "status-blocked" : "neutral"}`}>{record.open} open</span>
      </div>

      <progress className="board-progress-track" max={100} value={progressValue} />

      <div className="owner-load-meta-grid">
        <span className="signal-badge tone-neutral">{record.active} active</span>
        <span className="signal-badge tone-neutral">{record.review} review</span>
        <span className={`signal-badge tone-${record.blocked ? "alert" : "ok"}`}>{record.blocked} blocked</span>
        {record.runtimeStatus ? <span className={`signal-badge tone-${runtimeTone === "danger" ? "alert" : runtimeTone === "warning" ? "warn" : runtimeTone === "success" ? "ok" : "neutral"}`}>{record.runtimeStatus}</span> : null}
      </div>

      <p className="owner-load-next">{record.nextAction}</p>
      <div className="task-card-footer owner-load-footer">
        <span className="cell-note">Updated {formatDate(record.updatedAt)}</span>
        {record.runtimeModel ? <span className="cell-note">{record.runtimeModel}</span> : null}
      </div>
    </article>
  );
}

function CollapsibleSection({
  id,
  eyebrow,
  title,
  expanded,
  onToggle,
  badge,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  expanded: boolean;
  onToggle: (id: string) => void;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`panel page-stack collapsible-section ${expanded ? "" : "is-collapsed"}`}>
      <button type="button" className="collapsible-header" onClick={() => onToggle(id)}>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {badge}
          <span className="collapse-indicator">{expanded ? "▼" : "▶"}</span>
        </div>
      </button>
      <div className="collapsible-body">
        <div className="collapsible-inner">
          {children}
        </div>
      </div>
    </section>
  );
}

function OverviewCard({
  title,
  subtitle,
  detail,
  meta,
  href,
}: {
  title: string;
  subtitle: string;
  detail: string;
  meta: string[];
  href: string;
}) {
  return (
    <a className="compact-overview-card" href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <span className="card-title">{title}</span>
      <span className="card-value">{subtitle}</span>
      <span className="card-detail">{detail}</span>
      {meta.length > 0 ? (
        <span className="card-detail" style={{ fontSize: "0.78rem" }}>
          {meta.join(" • ")}
        </span>
      ) : null}
    </a>
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
  if (!state.attempted && !state.data && !state.error) {return "Deferred until the shell is stable.";}
  if (state.loading) {return "Loading…";}
  if (state.error) {return state.error;}
  if (!state.data) {return "Unavailable";}
  return "Connected";
}
