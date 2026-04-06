import { useMemo } from "react";
import { ProjectBoardSection } from "./ProjectBoardSection";
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
  RuntimePayload,
  OrgPayload,
} from "../types";
import { formatDate } from "../lib/format";

type Props = {
  payload: CommandPayload;
  buildLab: ResourceState<BuildLabPayload>;
  runtime: ResourceState<RuntimePayload>;
  org: ResourceState<OrgPayload>;
  briefing: ResourceState<BriefingPayload>;
  briefingArchive: ResourceState<BriefingArchivePayload>;
  cronHealth: ResourceState<CronHealthPayload>;
  memoryFiles: ResourceState<MemoryFilePayload>;
  reloadBoard: () => Promise<void>;
};

type ResourceState<T> = {
  data: ApiEnvelope<T> | null;
  loading: boolean;
  error: string | null;
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

export function CommandPage({ payload, buildLab, runtime, org, briefing, briefingArchive, cronHealth, memoryFiles, reloadBoard }: Props) {
  const boardSummary = useMemo(
    () => ({
      total: payload.tasks.length,
      blocked: payload.tasks.filter((task) => task.blocked).length,
      stale: payload.tasks.filter((task) => task.stale).length,
      active: payload.tasks.filter((task) => task.status === "active").length,
    }),
    [payload.tasks],
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
    const orgData = org.data?.data;

    const delegationQueueTasks = payload.tasks
      .filter((task) => ["intake", "scoping", "ready"].includes(task.status))
      .sort((left, right) => (Date.parse(right.updatedAt || "") || 0) - (Date.parse(left.updatedAt || "") || 0));

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
      org: {
        latestStandup: orgData?.latestStandup || null,
        teamHealth: orgData?.summary || null,
      },
      delegationQueue: {
        total: delegationQueueTasks.length,
        groups: Object.values(delegationQueueByAssignee)
          .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
          .slice(0, 4),
      },
      attention: attention.slice(0, 8),
      loops,
    };
  }, [briefing.data?.data, briefingArchive.data?.data, buildLab.data?.data, cronHealth.data?.data, memoryFiles.data?.data, org.data?.data, payload.tasks, runtime.data?.data]);

  return (
    <section className="page-stack accent-ops">
      <header className="page-header panel">
        <div>
          <p className="eyebrow">Command</p>
          <h2>Internal execution center</h2>
          <p className="muted">
            The Project Board below is the operational source of truth for assignments, blockers, handoffs, and standups. Runtime, Knowledge, and Build Lab remain separate live evidence surfaces.
          </p>
        </div>
        <div className="stats-grid compact-stats">
          <div className="stat-card">
            <span>Total tasks</span>
            <strong>{boardSummary.total}</strong>
          </div>
          <div className="stat-card warning">
            <span>Blocked</span>
            <strong>{boardSummary.blocked}</strong>
          </div>
          <div className="stat-card success">
            <span>Active</span>
            <strong>{boardSummary.active}</strong>
          </div>
          <div className="stat-card danger">
            <span>Stale</span>
            <strong>{boardSummary.stale}</strong>
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
            title="Last Standup"
            subtitle={overview.org.latestStandup?.title || "No saved transcript"}
            detail={overview.org.latestStandup
              ? `${overview.org.latestStandup.respondingChiefCount ?? 0}/${overview.org.latestStandup.chiefCount ?? 0} chiefs responded • ${overview.org.latestStandup.preview || "Preview unavailable"}`
              : resourceDetail(org)}
            meta={overview.org.latestStandup
              ? [
                  overview.org.latestStandup.date || "Date unavailable",
                  overview.org.latestStandup.status || "Status unavailable",
                  ...(overview.org.latestStandup.decisions?.slice(0, 2) || overview.org.latestStandup.decisions || []),
                ]
              : [resourceDetail(org)]}
            href="/?knowledgeView=standups#/knowledge"
            sourceEndpoint="/api/org"
          />
          <OverviewCard
            title="Delegation Queue"
            subtitle={overview.delegationQueue.total ? `${overview.delegationQueue.total} not-started tasks` : "No not-started tasks"}
            detail={overview.delegationQueue.groups.length
              ? `Grouped from real intake / scoping / ready board tasks. ${overview.delegationQueue.groups[0].label} currently has ${overview.delegationQueue.groups[0].count}.`
              : "No real board tasks are currently waiting to be started."}
            meta={overview.delegationQueue.groups.length
              ? overview.delegationQueue.groups.map((group) => `${group.label} → ${group.count}`)
              : ["Project board has no matching tasks"]}
            href={routeHrefs.command}
            sourceEndpoint="/api/pm-board"
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

      <ProjectBoardSection payload={payload} onReload={reloadBoard} />
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
