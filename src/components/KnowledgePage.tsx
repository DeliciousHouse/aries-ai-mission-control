import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { usePollingResource } from "../hooks/usePollingResource";
import type {
  ApiEnvelope,
  BriefingArchivePayload,
  BriefingArchiveRecord,
  CronHealthPayload,
  MemoryFileContentPayload,
  MemoryFilePayload,
  SkillCatalogPayload,
  SkillCatalogRecord,
} from "../types";

type TabKey = "overview" | "memory" | "briefing" | "skills" | "scheduler";

type SourceFilter =
  | { kind: "all" }
  | { kind: "source"; source: "Bundled" | "Local" | "Workspace" }
  | { kind: "category"; category: string };

const sectionQueryKey = "knowledgeView";
const tabMeta: Array<{ id: TabKey; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "memory", label: "Memory Explorer" },
  { id: "briefing", label: "Briefing Archive" },
  { id: "skills", label: "Skills Catalog" },
  { id: "scheduler", label: "Scheduler Health" },
];

function isKnowledgeTab(value: string | null): value is TabKey {
  return tabMeta.some((item) => item.id === value);
}

function readTabFromLocation(): TabKey {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(sectionQueryKey);
  return isKnowledgeTab(value) ? value : "overview";
}

function tabHref(tab: TabKey) {
  const params = new URLSearchParams(window.location.search);
  if (tab === "overview") {
    params.delete(sectionQueryKey);
  } else {
    params.set(sectionQueryKey, tab);
  }
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}#/knowledge`;
}

function updateTab(setTab: (next: TabKey) => void, nextTab: TabKey) {
  const href = tabHref(nextTab);
  window.history.replaceState(null, "", href);
  setTab(nextTab);
}

export function KnowledgePage() {
  const memoryFiles = usePollingResource<ApiEnvelope<MemoryFilePayload>>({ load: api.loadMemoryFiles, intervalMs: 30000 });
  const briefingArchive = usePollingResource<ApiEnvelope<BriefingArchivePayload>>({
    load: api.loadBriefingArchive,
    intervalMs: 30000,
  });
  const skillCatalog = usePollingResource<ApiEnvelope<SkillCatalogPayload>>({ load: api.loadSkills, intervalMs: 30000 });
  const cronHealth = usePollingResource<ApiEnvelope<CronHealthPayload>>({ load: api.loadCronHealth, intervalMs: 30000 });

  const [activeTab, setActiveTab] = useState<TabKey>(() => readTabFromLocation());
  const [selectedMemoryPath, setSelectedMemoryPath] = useState<string | null>(null);
  const [selectedMemoryContent, setSelectedMemoryContent] = useState<MemoryFileContentPayload | null>(null);
  const [selectedMemoryLoading, setSelectedMemoryLoading] = useState(false);
  const [selectedMemoryError, setSelectedMemoryError] = useState<string | null>(null);
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(null);
  const [selectedBrief, setSelectedBrief] = useState<BriefingArchiveRecord | null>(null);
  const [skillTab, setSkillTab] = useState("all");

  const memoryData = memoryFiles.data?.data;
  const briefingData = briefingArchive.data?.data;
  const skillData = skillCatalog.data?.data;
  const cronData = cronHealth.data?.data;

  useEffect(() => {
    const files = memoryData?.files ?? [];
    if (!files.length) {
      setSelectedMemoryPath(null);
      setSelectedMemoryContent(null);
      return;
    }

    setSelectedMemoryPath((current) => {
      if (current && files.find((entry) => entry.path === current)) {
        return current;
      }
      return files[0].path;
    });
  }, [memoryData?.files]);

  useEffect(() => {
    if (!selectedMemoryPath) {
      setSelectedMemoryContent(null);
      setSelectedMemoryError(null);
      return;
    }

    let cancelled = false;
    setSelectedMemoryLoading(true);
    setSelectedMemoryError(null);

    api
      .loadMemoryFile(selectedMemoryPath)
      .then((payload) => {
        if (cancelled) return;
        setSelectedMemoryContent(payload.data);
      })
      .catch((error) => {
        if (cancelled) return;
        setSelectedMemoryContent(null);
        setSelectedMemoryError(error instanceof Error ? error.message : "Unable to read memory file.");
      })
      .finally(() => {
        if (!cancelled) setSelectedMemoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMemoryPath]);

  useEffect(() => {
    const items = briefingData?.items ?? [];
    if (!items.length) {
      setSelectedBriefId(null);
      setSelectedBrief(null);
      return;
    }

    setSelectedBriefId((current) => {
      const same = items.find((item) => item.id === current);
      if (same) return current;
      setSelectedBrief(items[0]);
      return items[0].id;
    });
  }, [briefingData]);

  useEffect(() => {
    const items = briefingData?.items ?? [];
    if (!selectedBriefId || !items.length) {
      if (!items.length) setSelectedBrief(null);
      return;
    }
    setSelectedBrief(items.find((item) => item.id === selectedBriefId) ?? null);
  }, [selectedBriefId, briefingData]);

  const skillTabs = useMemo(() => {
    const base = [
      { key: "all", label: "All" },
      { key: "Bundled", label: "Bundled" },
      { key: "Local", label: "Local" },
      { key: "Workspace", label: "Workspace" },
    ];
    const categories = (skillData?.categories ?? []).map((category) => ({
      key: `category:${category}`,
      label: `Category: ${category}`,
    }));

    return [...base, ...categories];
  }, [skillData?.categories]);

  const skillFilter: SourceFilter = useMemo(() => {
    if (skillTab === "all") return { kind: "all" };
    if (skillTab === "Bundled") return { kind: "source", source: "Bundled" };
    if (skillTab === "Local") return { kind: "source", source: "Local" };
    if (skillTab === "Workspace") return { kind: "source", source: "Workspace" };
    if (skillTab.startsWith("category:")) return { kind: "category", category: skillTab.slice("category:".length) };
    return { kind: "all" };
  }, [skillTab]);

  const filteredSkills = useMemo(() => {
    const records = skillData?.records ?? [];
    return records.filter((skill) => {
      if (skillFilter.kind === "all") return true;
      if (skillFilter.kind === "source") return skill.source === skillFilter.source;
      return (skill.category || "").toLowerCase() === skillFilter.category.toLowerCase();
    });
  }, [skillData?.records, skillFilter]);

  const overview = useMemo(() => {
    const files = memoryData?.files ?? [];
    const totalSize = files.reduce((total, file) => total + file.sizeBytes, 0);
    const lastUpdated = files[0]?.updatedAt || null;
    const latestBrief = (briefingData?.items ?? []).find((item) => item.type === "brief") || briefingData?.items?.[0] || null;
    const sourceBreakdown = {
      Bundled: (skillData?.records ?? []).filter((skill) => skill.source === "Bundled").length,
      Local: (skillData?.records ?? []).filter((skill) => skill.source === "Local").length,
      Workspace: (skillData?.records ?? []).filter((skill) => skill.source === "Workspace").length,
    };

    return {
      latestBrief,
      memory: {
        fileCount: files.length,
        totalSize,
        lastUpdated,
      },
      skills: {
        total: skillData?.records?.length ?? 0,
        ...sourceBreakdown,
      },
      scheduler: cronData?.stats ?? { healthy: 0, failed: 0, disabled: 0, unavailable: 0, disconnected: 0 },
    };
  }, [briefingData?.items, cronData?.stats, memoryData?.files, skillData?.records]);

  const activeSection = (() => {
    if (activeTab === "memory") {
      return (
        <MemoryExplorer
          state={memoryFiles}
          data={memoryData}
          selectedPath={selectedMemoryPath}
          selectedContent={selectedMemoryContent}
          loading={selectedMemoryLoading}
          error={selectedMemoryError}
          onSelect={setSelectedMemoryPath}
          onBack={() => updateTab(setActiveTab, "overview")}
        />
      );
    }

    if (activeTab === "briefing") {
      return (
        <BriefingArchivePanel
          state={briefingArchive}
          data={briefingData}
          selectedId={selectedBriefId}
          selectedRecord={selectedBrief}
          onSelect={setSelectedBriefId}
          onBack={() => updateTab(setActiveTab, "overview")}
        />
      );
    }

    if (activeTab === "skills") {
      return (
        <SkillsCatalogPanel
          state={skillCatalog}
          data={skillData}
          tabs={skillTabs}
          activeTab={skillTab}
          onTabChange={setSkillTab}
          records={filteredSkills}
          onBack={() => updateTab(setActiveTab, "overview")}
        />
      );
    }

    if (activeTab === "scheduler") {
      return <SchedulerHealthPanel state={cronHealth} data={cronData} onBack={() => updateTab(setActiveTab, "overview")} />;
    }

    return (
      <KnowledgeOverviewPanel
        overview={overview}
        memoryState={memoryFiles}
        briefingState={briefingArchive}
        skillState={skillCatalog}
        cronState={cronHealth}
        onOpen={(tab) => updateTab(setActiveTab, tab)}
      />
    );
  })();

  return (
    <section className="page-stack accent-brain">
      <header className="page-header panel">
        <div>
          <p className="eyebrow">Knowledge</p>
          <h2>Mission knowledge and operational awareness</h2>
          <p className="muted">Memory, briefing archive, skills, and scheduler health from real repository and runtime sources.</p>
        </div>
        <div className="stats-grid compact-stats">
          <StatusCard label="Memory files" value={(memoryData?.files?.length ?? 0).toString()} />
          <StatusCard label="Briefing records" value={(briefingData?.items?.length ?? 0).toString()} />
          <StatusCard label="Skills" value={(skillData?.records?.length ?? 0).toString()} />
        </div>
      </header>

      <section className="panel toolbar">
        <div className="tab-row wrap">
          {tabMeta.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab-button ${activeTab === tab.id ? "is-active" : ""}`}
              onClick={() => updateTab(setActiveTab, tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeSection}
    </section>
  );
}

function KnowledgeOverviewPanel({
  overview,
  memoryState,
  briefingState,
  skillState,
  cronState,
  onOpen,
}: {
  overview: {
    latestBrief: BriefingArchiveRecord | null;
    memory: { fileCount: number; totalSize: number; lastUpdated: string | null };
    skills: { total: number; Bundled: number; Local: number; Workspace: number };
    scheduler: { healthy: number; failed: number; disabled: number; unavailable: number; disconnected: number };
  };
  memoryState: ReturnType<typeof usePollingResource<ApiEnvelope<MemoryFilePayload>>>;
  briefingState: ReturnType<typeof usePollingResource<ApiEnvelope<BriefingArchivePayload>>>;
  skillState: ReturnType<typeof usePollingResource<ApiEnvelope<SkillCatalogPayload>>>;
  cronState: ReturnType<typeof usePollingResource<ApiEnvelope<CronHealthPayload>>>;
  onOpen: (tab: TabKey) => void;
}) {
  return (
    <section className="panel page-stack">
      <div className="section-split align-end">
        <div>
          <p className="eyebrow">Knowledge Overview</p>
          <h3>Fresh internal context without manual stitching</h3>
          <p className="muted">Each tile pulls from a real API and links to the owning detail surface.</p>
        </div>
        <a className="secondary-button overview-link-button" href="/#/command">
          Open Command
        </a>
      </div>

      <div className="overview-tile-grid">
        <KnowledgeOverviewTile
          title="Latest Brief"
          subtitle={overview.latestBrief?.title || "Unknown / unavailable"}
          detail={overview.latestBrief?.preview || "Latest brief could not be determined truthfully from /api/briefs."}
          meta={[
            overview.latestBrief?.updatedAt ? `Updated ${formatDate(overview.latestBrief.updatedAt)}` : "Updated unavailable",
            overview.latestBrief?.deliveryStatus || "Unknown",
            overview.latestBrief?.path || "No source file",
          ]}
          endpoint="/api/briefs"
          state={resourceStateLabel(briefingState.loading, briefingState.error)}
          href={tabHref("briefing")}
          onOpen={() => onOpen("briefing")}
        />
        <KnowledgeOverviewTile
          title="Memory Stats"
          subtitle={`${overview.memory.fileCount} files • ${formatBytes(overview.memory.totalSize)}`}
          detail={overview.memory.lastUpdated ? `Last updated ${formatDate(overview.memory.lastUpdated)}` : "No memory files available."}
          meta={[
            overview.memory.fileCount ? `${overview.memory.fileCount} indexed memory files` : "No indexed memory files",
            overview.memory.lastUpdated || "Unavailable",
          ]}
          endpoint="/api/memory/files"
          state={resourceStateLabel(memoryState.loading, memoryState.error)}
          href={tabHref("memory")}
          onOpen={() => onOpen("memory")}
        />
        <KnowledgeOverviewTile
          title="Scheduler Health"
          subtitle={`Healthy ${overview.scheduler.healthy} • Failed ${overview.scheduler.failed}`}
          detail={`Disabled ${overview.scheduler.disabled} • Unavailable ${overview.scheduler.unavailable + overview.scheduler.disconnected}`}
          meta={[
            `Healthy ${overview.scheduler.healthy}`,
            `Failed ${overview.scheduler.failed}`,
            `Disabled ${overview.scheduler.disabled}`,
          ]}
          endpoint="/api/cron-health"
          state={resourceStateLabel(cronState.loading, cronState.error)}
          href={tabHref("scheduler")}
          onOpen={() => onOpen("scheduler")}
        />
        <KnowledgeOverviewTile
          title="Skills Count"
          subtitle={`${overview.skills.total} total`}
          detail={`Bundled ${overview.skills.Bundled} • Local ${overview.skills.Local} • Workspace ${overview.skills.Workspace}`}
          meta={[
            `Bundled ${overview.skills.Bundled}`,
            `Local ${overview.skills.Local}`,
            `Workspace ${overview.skills.Workspace}`,
          ]}
          endpoint="/api/skills"
          state={resourceStateLabel(skillState.loading, skillState.error)}
          href={tabHref("skills")}
          onOpen={() => onOpen("skills")}
        />
      </div>
    </section>
  );
}

function MemoryExplorer({
  state,
  data,
  selectedPath,
  selectedContent,
  loading,
  error,
  onSelect,
  onBack,
}: {
  state: ReturnType<typeof usePollingResource<ApiEnvelope<MemoryFilePayload>>>;
  data?: MemoryFilePayload;
  selectedPath: string | null;
  selectedContent: MemoryFileContentPayload | null;
  loading: boolean;
  error: string | null;
  onSelect: (path: string) => void;
  onBack: () => void;
}) {
  const rows = data?.files ?? [];

  return (
    <section className="panel">
      <DetailHeader
        eyebrow="Memory Explorer"
        title="Filesystem-backed context recovery"
        status={state.loading ? "Loading" : state.error ? "Error" : "Connected"}
        statusTone={state.loading ? "connection-loading" : state.error ? "connection-error" : "connection-connected"}
        onBack={onBack}
      />

      {state.error && !data ? <PanelEmpty title="Cannot read memory files" body={state.error} tone="error" /> : null}

      {state.data && (data?.warnings?.length ?? 0) > 0 ? (
        <div className="warning-block">
          <strong>Source warnings</strong>
          <ul className="inline-list with-spacing">
            {(data?.warnings ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!rows.length ? (
        <PanelEmpty
          title="No memory files discovered"
          body="Memory list is empty. Re-check MEMORY.md, BACKLOG.md, and memory/**/*.md."
          tone="warning"
        />
      ) : (
        <div className="knowledge-split">
          <aside className="panel memory-list-panel">
            <div className="section-split">
              <strong>Memory files</strong>
              <span className="muted">Newest first; pinned files appear first.</span>
            </div>
            <div className="brief-list">
              {rows.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  className={`brief-item ${selectedPath === file.path ? "is-active" : ""}`}
                  onClick={() => onSelect(file.path)}
                >
                  <div className="section-split">
                    <div>
                      <strong>{file.path}</strong>
                      <p className="cell-note">Updated {formatDate(file.updatedAt)}</p>
                    </div>
                    <span className="badge neutral">{formatBytes(file.sizeBytes)}</span>
                  </div>
                  {file.isPinned ? <p className="muted">Pinned</p> : null}
                </button>
              ))}
            </div>
          </aside>

          <section className="panel markdown-preview-panel">
            <div className="section-split">
              <strong>Preview</strong>
              {selectedContent ? <span className="badge neutral">{selectedContent.path}</span> : null}
            </div>

            {loading ? <p className="muted">Loading file content…</p> : null}
            {error ? <PanelEmpty title="Memory file error" body={error} tone="error" /> : null}

            {!loading && !error && selectedContent ? (
              <>
                <p className="muted">Updated {formatDate(selectedContent.updatedAt)}</p>
                <article
                  className="markdown-view"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedContent.content) }}
                />
              </>
            ) : null}

            {!selectedContent && !loading ? <p className="muted">Select a file from the left.</p> : null}
          </section>
        </div>
      )}
    </section>
  );
}

function BriefingArchivePanel({
  state,
  data,
  selectedId,
  selectedRecord,
  onSelect,
  onBack,
}: {
  state: ReturnType<typeof usePollingResource<ApiEnvelope<BriefingArchivePayload>>>;
  data?: BriefingArchivePayload;
  selectedId: string | null;
  selectedRecord: BriefingArchiveRecord | null;
  onSelect: (id: string | null) => void;
  onBack: () => void;
}) {
  const items = data?.items ?? [];

  return (
    <section className="panel">
      <DetailHeader
        eyebrow="Briefing Archive"
        title="Internal briefs, plans, and debriefs"
        status={state.loading ? "Loading" : state.error ? "Error" : "Loaded"}
        statusTone={state.loading ? "connection-loading" : state.error ? "connection-error" : "connection-connected"}
        onBack={onBack}
      />

      {state.error && !data ? <PanelEmpty title="Unable to load briefing archive" body={state.error} tone="error" /> : null}

      {state.data && (data?.warnings?.length ?? 0) > 0 ? (
        <div className="warning-block">
          <strong>Source warnings</strong>
          <ul className="inline-list with-spacing">
            {(data?.warnings ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!items.length ? (
        <PanelEmpty
          title="No archive items available"
          body="No qualifying files were found in docs/briefs, docs/plans, or debrief directories."
          tone="warning"
        />
      ) : (
        <div className="briefing-archive-grid">
          <aside className="panel brief-list-panel">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`brief-item ${selectedId === item.id ? "is-active" : ""}`}
                onClick={() => onSelect(item.id)}
              >
                <div className="section-split">
                  <div>
                    <strong>{item.title}</strong>
                    <p className="cell-note">{item.path}</p>
                  </div>
                  <span className="badge neutral">{item.type}</span>
                </div>
                <div className="brief-meta">
                  <span className="muted">{formatDate(item.updatedAt)}</span>
                  <span className={`badge ${statusBadgeClass(item.deliveryStatus)}`}>{item.deliveryStatus}</span>
                </div>
                <p className="cell-note">{item.preview}</p>
              </button>
            ))}
          </aside>

          <section className="panel markdown-preview-panel">
            <div className="section-split">
              <div>
                <strong>{selectedRecord?.title ?? "Select a briefing item"}</strong>
                <p className="muted">{selectedRecord?.path}</p>
              </div>
            </div>

            {selectedRecord ? (
              <>
                <div className="summary-cards">
                  <SummaryCard label="Date" value={formatDate(selectedRecord.updatedAt)} tone="neutral" />
                  <SummaryCard label="Type" value={selectedRecord.type} tone="neutral" />
                  <SummaryCard label="Status" value={selectedRecord.deliveryStatus} tone="neutral" />
                </div>
                <article className="markdown-view" dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedRecord.markdown) }} />
              </>
            ) : (
              <p className="muted">Select an item to view full markdown.</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function SkillsCatalogPanel({
  state,
  data,
  tabs,
  activeTab,
  onTabChange,
  records,
  onBack,
}: {
  state: ReturnType<typeof usePollingResource<ApiEnvelope<SkillCatalogPayload>>>;
  data?: SkillCatalogPayload;
  tabs: Array<{ key: string; label: string }>;
  activeTab: string;
  onTabChange: (tab: string) => void;
  records: SkillCatalogRecord[];
  onBack: () => void;
}) {
  const rows = data?.records ?? [];

  return (
    <section className="panel">
      <DetailHeader
        eyebrow="Skills Catalog"
        title="Real skill availability and usage linkage"
        status={state.loading ? "Loading" : state.error ? "Error" : "Loaded"}
        statusTone={state.loading ? "connection-loading" : state.error ? "connection-error" : "connection-connected"}
        onBack={onBack}
      />

      {state.error && !data ? <PanelEmpty title="Unable to load skills" body={state.error} tone="error" /> : null}

      {state.data && (data?.warnings?.length ?? 0) > 0 ? (
        <div className="warning-block">
          <strong>Source warnings</strong>
          <ul className="inline-list with-spacing">
            {(data?.warnings ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="toolbar">
        <div className="tab-row wrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`tab-button ${activeTab === tab.key ? "is-active" : ""}`}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {!rows.length ? (
        <PanelEmpty title="No skills found" body="No SKILL.md files were discovered from configured skill roots." tone="warning" />
      ) : (
        <div className="three-column-grid">
          {records.map((skill) => (
            <article className="list-card" key={`${skill.source}:${skill.path}`}>
              <div className="section-split">
                <strong>{skill.name}</strong>
                <span className={`badge status-${skill.source.toLowerCase()}`}>{skill.source}</span>
              </div>
              <p>{skill.description || "Description unavailable (frontmatter parse issue)."}</p>
              <div className="brief-meta">
                <code>{skill.path}</code>
                {skill.category ? <span className="badge neutral">{skill.category}</span> : null}
              </div>
              <p className="cell-note">Frontmatter parsed: {skill.frontmatterParsed ? "yes" : "no"}</p>
              <div>
                <div className="muted">References</div>
                {skill.references.length ? (
                  <div className="ref-list">
                    {skill.references.map((reference) => (
                      <p className="muted" key={`${skill.name}-${reference.kind}-${reference.label}`}>
                        <strong>{reference.kind}</strong>: {reference.detail}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Unlinked</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SchedulerHealthPanel({
  state,
  data,
  onBack,
}: {
  state: ReturnType<typeof usePollingResource<ApiEnvelope<CronHealthPayload>>>;
  data?: CronHealthPayload;
  onBack: () => void;
}) {
  const jobs = data?.jobs ?? [];
  const failed = jobs.filter((job) => job.status === "failed");

  return (
    <section className="panel">
      <DetailHeader
        eyebrow="Scheduler Health"
        title="OpenClaw cron job health and retry surface"
        status={state.loading ? "Loading" : state.error ? "Error" : "Connected"}
        statusTone={state.loading ? "connection-loading" : state.error ? "connection-error" : "connection-connected"}
        onBack={onBack}
      />

      {state.error && !data ? <PanelEmpty title="Cron query failed" body={state.error} tone="error" /> : null}

      {state.data && (data?.warnings?.length ?? 0) > 0 ? (
        <div className="warning-block">
          <strong>Source warnings</strong>
          <ul className="inline-list with-spacing">
            {(data?.warnings ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="stats-grid">
            <SummaryCard label="Healthy" value={data.stats.healthy.toString()} tone="success" />
            <SummaryCard label="Failed" value={data.stats.failed.toString()} tone="danger" />
            <SummaryCard label="Disabled" value={data.stats.disabled.toString()} tone="neutral" />
            <SummaryCard
              label="Unavailable"
              value={(data.stats.unavailable + data.stats.disconnected).toString()}
              tone="warning"
            />
          </div>

          <div className="table-scroll">
            <table className="data-table responsive-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Last run</th>
                  <th>Next run</th>
                  <th>Schedule</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length ? (
                  jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <div>
                          <strong>{job.name}</strong>
                          <p className="cell-note">{job.id}</p>
                        </div>
                      </td>
                      <td>
                        <span className={`badge status-${job.status}`}>{job.status}</span>
                      </td>
                      <td>{job.lastRun ? formatDate(job.lastRun) : "—"}</td>
                      <td>{job.nextRun ? formatDate(job.nextRun) : "—"}</td>
                      <td>{job.schedule}</td>
                      <td>{job.lastError || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>No jobs returned by cron source.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <section className="panel">
            <h4 className="eyebrow">Failed jobs</h4>
            {!failed.length ? <p className="muted">No failed jobs.</p> : null}
            {failed.length ? (
              <div className="stack-list">
                {failed.map((job) => (
                  <div className="list-card" key={job.id}>
                    <strong>{job.name}</strong>
                    <p className="muted">{job.lastError || "No failure detail available."}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="panel">
            <p className="eyebrow">Retry</p>
            <p className="muted">Retry affordance is unavailable here because there is no dedicated POST run endpoint in this mission-control build.</p>
          </section>
        </>
      ) : null}
    </section>
  );
}

function DetailHeader({
  eyebrow,
  title,
  status,
  statusTone,
  onBack,
}: {
  eyebrow: string;
  title: string;
  status: string;
  statusTone: string;
  onBack: () => void;
}) {
  return (
    <>
      <div className="section-split detail-breadcrumb-row">
        <button className="secondary-button overview-link-button" onClick={onBack} type="button">
          Back to overview
        </button>
        <span className={`badge ${statusTone}`}>{status}</span>
      </div>
      <div className="section-split">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
      </div>
    </>
  );
}

function KnowledgeOverviewTile({
  title,
  subtitle,
  detail,
  meta,
  endpoint,
  state,
  href,
  onOpen,
}: {
  title: string;
  subtitle: string;
  detail: string;
  meta: string[];
  endpoint: string;
  state: string;
  href: string;
  onOpen: () => void;
}) {
  return (
    <article className="list-card overview-card">
      <div className="section-split">
        <div>
          <p className="eyebrow">{title}</p>
          <h3>{subtitle}</h3>
        </div>
        <span className="badge neutral">{state}</span>
      </div>
      <p className="muted">{detail}</p>
      <div className="ref-row">
        <code>{endpoint}</code>
      </div>
      <ul className="inline-list with-spacing">
        {meta.map((item) => (
          <li key={`${title}-${item}`}>{item}</li>
        ))}
      </ul>
      <a
        className="secondary-button overview-link-button"
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onOpen();
        }}
      >
        Open detail
      </a>
    </article>
  );
}

function PanelEmpty({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone?: "error" | "warning";
}) {
  return (
    <div className={`empty-state compact ${tone === "error" ? "status-error" : tone === "warning" ? "status-warning" : ""}`}>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </div>
  );
}

function StatusCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | "warning" | "neutral";
}) {
  return (
    <div className={`stat-card ${tone === "success" ? "success" : tone === "danger" ? "danger" : tone === "warning" ? "warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function resourceStateLabel(loading: boolean, error: string | null) {
  if (loading) return "Loading";
  if (error) return "Error";
  return "Connected";
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toInlineHtml(input: string) {
  let output = input;
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/_([^_]+)_/g, "<em>$1</em>");
  output = output.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return output;
}

function renderMarkdown(markdown: string) {
  const escaped = escapeHtml(markdown);
  const lines = escaped.split(/\r?\n/);
  const parts: string[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (!listBuffer.length) return;
    parts.push("<ul>");
    for (const item of listBuffer) {
      parts.push(`<li>${toInlineHtml(item.replace(/^[-*]\s+/, ""))}</li>`);
    }
    parts.push("</ul>");
    listBuffer = [];
  };

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      flushList();
      const level = line.match(/^(#{1,6})\s+/)?.[1]?.length ?? 1;
      const text = line.replace(/^#{1,6}\s+/, "");
      parts.push(`<h${level}>${toInlineHtml(text)}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      listBuffer.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushList();
      parts.push("<br/>");
      continue;
    }

    flushList();
    parts.push(`<p>${toInlineHtml(line)}</p>`);
  }

  flushList();
  return parts.join("\n");
}

function statusBadgeClass(status: string) {
  if (status === "Delivered") return "status-done";
  if (status === "Pending") return "status-in_progress";
  if (status === "Unavailable") return "status-todo";
  return "status-warning";
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
