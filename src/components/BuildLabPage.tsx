import { useMemo, useState } from "react";
import { formatDate } from "../lib/format";
import type { BuildArtifact, BuildLabPayload, IdeaBacklogItem, PrototypeRegistryItem, ResearchRecord } from "../types";

type BuildLabSection = "overview" | "prototypes" | "ideas" | "artifacts" | "research";
type IdeaSortMode = "newest" | "highest-score" | "highest-leverage";
type LaneFilter = "all" | "production" | "exploratory" | "deferred";

const sectionQueryKey = "buildLabSection";

const sectionMeta: Array<{ id: BuildLabSection; label: string }> = [
  { id: "overview", label: "Build Lab Overview" },
  { id: "prototypes", label: "Prototype Registry" },
  { id: "ideas", label: "Idea Backlog" },
  { id: "artifacts", label: "Build Artifacts" },
  { id: "research", label: "Research Dashboard" },
];

function isBuildLabSection(value: string | null): value is BuildLabSection {
  return sectionMeta.some((item) => item.id === value);
}

function readSectionFromLocation(): BuildLabSection {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(sectionQueryKey);
  return isBuildLabSection(value) ? value : "overview";
}

function sectionHref(section: BuildLabSection) {
  const params = new URLSearchParams(window.location.search);
  if (section === "overview") {
    params.delete(sectionQueryKey);
  } else {
    params.set(sectionQueryKey, section);
  }
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}#/build-lab`;
}

function updateSection(setSection: (next: BuildLabSection) => void, nextSection: BuildLabSection) {
  const href = sectionHref(nextSection);
  window.history.replaceState(null, "", href);
  setSection(nextSection);
}

export function BuildLabPage({ payload }: { payload: BuildLabPayload }) {
  const [section, setSection] = useState<BuildLabSection>(() => readSectionFromLocation());
  const [laneFilter, setLaneFilter] = useState<LaneFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [workstreamFilter, setWorkstreamFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<IdeaSortMode>("newest");

  const filteredIdeas = useMemo(() => {
    const items = payload.ideas.items.filter((item) => {
      if (laneFilter !== "all" && item.workstream !== laneFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (workstreamFilter !== "all" && item.workstream !== workstreamFilter) return false;
      return true;
    });

    return [...items].sort((left, right) => {
      if (sortMode === "highest-score") {
        return (right.totalScore ?? Number.NEGATIVE_INFINITY) - (left.totalScore ?? Number.NEGATIVE_INFINITY);
      }
      if (sortMode === "highest-leverage") {
        return (right.technicalLeverage ?? Number.NEGATIVE_INFINITY) - (left.technicalLeverage ?? Number.NEGATIVE_INFINITY);
      }
      return (Date.parse(right.date) || 0) - (Date.parse(left.date) || 0);
    });
  }, [categoryFilter, laneFilter, payload.ideas.items, sortMode, workstreamFilter]);

  const activeSection = (() => {
    if (section === "prototypes") {
      return <PrototypeRegistrySection payload={payload} />;
    }
    if (section === "ideas") {
      return (
        <IdeaBacklogSection
          payload={payload}
          items={filteredIdeas}
          laneFilter={laneFilter}
          setLaneFilter={setLaneFilter}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          workstreamFilter={workstreamFilter}
          setWorkstreamFilter={setWorkstreamFilter}
          sortMode={sortMode}
          setSortMode={setSortMode}
        />
      );
    }
    if (section === "artifacts") {
      return <ArtifactSection payload={payload} />;
    }
    if (section === "research") {
      return <ResearchSection payload={payload} />;
    }
    return <OverviewSection payload={payload} onSelect={(next) => updateSection(setSection, next)} />;
  })();

  return (
    <section className="page-stack accent-lab">
      <header className="page-header panel">
        <div>
          <p className="eyebrow">Build Lab</p>
          <h2>Internal experimentation, prototypes, artifacts, and research</h2>
          <p className="muted">
            Build Lab reads the existing Mission Control planning registry, real filesystem outputs, real build artifacts,
            and real research files. Missing wiring stays visible as unavailable instead of being filled with placeholders.
          </p>
        </div>
        <div className="brief-meta-column">
          <span>Composite source</span>
          <strong>{formatDate(payload.source.updatedAt)}</strong>
          <span>{payload.source.note}</span>
        </div>
      </header>

      <div className="panel toolbar">
        <div className="tab-row wrap">
          {sectionMeta.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tab-button ${section === item.id ? "is-active" : ""}`}
              onClick={() => updateSection(setSection, item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {section !== "overview" ? (
        <section className="panel detail-breadcrumb-row">
          <div className="section-split align-end">
            <div>
              <p className="eyebrow">Build Lab</p>
              <h3>{sectionMeta.find((item) => item.id === section)?.label ?? "Detail"}</h3>
              <p className="muted">Back navigation keeps the Build Lab overview and detail surfaces connected.</p>
            </div>
            <a
              className="secondary-button overview-link-button"
              href={sectionHref("overview")}
              onClick={(event) => {
                event.preventDefault();
                updateSection(setSection, "overview");
              }}
            >
              Back to overview
            </a>
          </div>
        </section>
      ) : null}

      {activeSection}
    </section>
  );
}

function OverviewSection({ payload, onSelect }: { payload: BuildLabPayload; onSelect: (section: BuildLabSection) => void }) {
  const { ideas, prototypes, artifacts, research } = payload.overview.tiles;
  const ownershipSummary = Object.entries(
    payload.prototypes.items.reduce<Record<string, number>>((accumulator, item) => {
      const owner = item.owner?.trim();
      if (!owner || owner.toLowerCase() === "unassigned") return accumulator;
      accumulator[owner] = (accumulator[owner] || 0) + 1;
      return accumulator;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3);

  return (
    <div className="page-stack">
      <section className="panel page-stack">
        <div className="section-split">
          <div>
            <p className="eyebrow">Build Lab Overview</p>
            <h3>At-a-glance state</h3>
          </div>
          <p className="muted">Landing surface for Build Lab on <code>/build-lab</code>.</p>
        </div>

        <div className="lab-overview-grid">
          <OverviewTile
            title="Ideas"
            subtitle={`${ideas.totalCount} total • ${ideas.thisWeekCount} this week`}
            lines={[
              ideas.latestTitle ? `Latest: ${ideas.latestTitle}` : "Latest: unavailable",
              ideas.latestState ? `State: ${ideas.latestState}` : "State: unavailable",
            ]}
            href={sectionHref("ideas")}
            onOpen={() => onSelect("ideas")}
          />
          <OverviewTile
            title="Prototypes / Tracks"
            subtitle={`${prototypes.runningCount} running • ${prototypes.totalCount} total`}
            lines={[
              prototypes.newestName ? `Newest: ${prototypes.newestName}` : "Newest: unavailable",
              prototypes.newestStatus ? `Status: ${prototypes.newestStatus}` : "Status: unavailable",
            ]}
            href={sectionHref("prototypes")}
            onOpen={() => onSelect("prototypes")}
          />
          <OverviewTile
            title="Build Artifacts"
            subtitle={artifacts.latestStatus === "unavailable" ? "Unavailable" : artifacts.latestStatus}
            lines={[
              artifacts.latestTitle ? `Latest source: ${artifacts.latestTitle}` : "Latest source: unavailable",
              artifacts.latestChangedPath ? `Changed: ${artifacts.latestChangedPath}` : "Changed: unavailable",
            ]}
            footer={artifacts.latestUpdatedAt ? `Updated ${formatDate(artifacts.latestUpdatedAt)}` : "No trustworthy artifact timestamp."}
            href={sectionHref("artifacts")}
            onOpen={() => onSelect("artifacts")}
          />
          <OverviewTile
            title="Research"
            subtitle={`${research.keyFindingCount} key findings`}
            lines={[
              research.latestTopic ? `Latest topic: ${research.latestTopic}` : "Latest topic: unavailable",
              research.latestPath ? `Latest file: ${research.latestPath}` : "Latest file: unavailable",
            ]}
            footer={research.latestDate ? `Updated ${formatDate(research.latestDate)}` : "No recent research file found."}
            href={sectionHref("research")}
            onOpen={() => onSelect("research")}
          />
          <OverviewTile
            title="Ownership Summary"
            subtitle={ownershipSummary.length ? `${ownershipSummary.length} tracked owners` : "Ownership unavailable"}
            lines={ownershipSummary.length ? ownershipSummary.map(([owner, count]) => `${owner}: ${count}`) : ["No real owner field is present on current prototype tracks."]}
            footer="Sourced only from tracked prototype / experiment owners."
            href={sectionHref("prototypes")}
            onOpen={() => onSelect("prototypes")}
          />
        </div>
      </section>
    </div>
  );
}

function OverviewTile({
  title,
  subtitle,
  lines,
  footer,
  href,
  onOpen,
}: {
  title: string;
  subtitle: string;
  lines: string[];
  footer?: string;
  href: string;
  onOpen: () => void;
}) {
  return (
    <article className="list-card lab-card">
      <div className="section-split">
        <div>
          <h3>{title}</h3>
          <p className="muted">{subtitle}</p>
        </div>
      </div>
      <ul className="inline-list">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {footer ? <p className="cell-note">{footer}</p> : null}
      <div>
        <a
          className="secondary-button lab-link-button"
          href={href}
          onClick={(event) => {
            event.preventDefault();
            onOpen();
          }}
        >
          Open section
        </a>
      </div>
    </article>
  );
}

function PrototypeRegistrySection({ payload }: { payload: BuildLabPayload }) {
  return (
    <section className="panel page-stack">
      <div className="section-split">
        <div>
          <p className="eyebrow">Prototype Registry</p>
          <h3>Track registry + verifiable preview state</h3>
        </div>
        <div className="brief-meta-column">
          <span>Registry updated</span>
          <strong>{formatDate(payload.prototypes.source.updatedAt)}</strong>
          <span>{payload.prototypes.source.note}</span>
        </div>
      </div>

      <div className="stats-grid compact-stats">
        <StatCard label="Running" value={String(payload.prototypes.stats.running)} tone="success" />
        <StatCard label="Stopped" value={String(payload.prototypes.stats.stopped)} tone="danger" />
        <StatCard label="Archived" value={String(payload.prototypes.stats.archived)} />
        <StatCard label="Total" value={String(payload.prototypes.stats.total)} />
      </div>
      <p className="muted">Unavailable / unverifiable previews: {payload.prototypes.stats.unavailable}</p>

      <div className="lab-card-grid">
        {payload.prototypes.items.map((item) => (
          <PrototypeCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function PrototypeCard({ item }: { item: PrototypeRegistryItem }) {
  return (
    <article className="list-card lab-card">
      <div className="section-split">
        <div>
          <h3>{item.name}</h3>
          <div className="badge-row">
            <StatusBadge status={item.status} />
            <span className="badge neutral">{item.workstream}</span>
            <span className="badge neutral">{item.owner}</span>
            {item.isNew ? <span className="badge status-local">NEW</span> : null}
          </div>
        </div>
      </div>

      <p className="muted">{item.description}</p>
      <dl className="lab-key-value">
        <div>
          <dt>Status detail</dt>
          <dd>{item.statusDetail}</dd>
        </div>
        <div>
          <dt>Preview</dt>
          <dd>
            {item.previewUrl ? item.previewUrl : item.previewPort ? `Port ${item.previewPort} tracked` : "Unavailable"}
            {item.localOnly ? " (local-only)" : ""}
          </dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatDate(item.updatedAt)}</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>
            {item.maturityScore != null || item.priorityScore != null
              ? `Maturity ${item.maturityScore ?? "—"} • Priority ${item.priorityScore ?? "—"}`
              : "Not tracked"}
          </dd>
        </div>
      </dl>

      {item.sourceRefs.length ? (
        <div className="ref-row">
          {item.sourceRefs.map((ref) => (
            <code key={ref}>{ref}</code>
          ))}
        </div>
      ) : null}

      {item.previewUrl ? (
        <div>
          <a className="secondary-button lab-link-button" href={item.previewUrl} target="_blank" rel="noreferrer">
            Open {item.localOnly ? "local preview" : "preview"}
          </a>
        </div>
      ) : null}
    </article>
  );
}

function IdeaBacklogSection({
  payload,
  items,
  laneFilter,
  setLaneFilter,
  categoryFilter,
  setCategoryFilter,
  workstreamFilter,
  setWorkstreamFilter,
  sortMode,
  setSortMode,
}: {
  payload: BuildLabPayload;
  items: IdeaBacklogItem[];
  laneFilter: LaneFilter;
  setLaneFilter: (value: LaneFilter) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  workstreamFilter: string;
  setWorkstreamFilter: (value: string) => void;
  sortMode: IdeaSortMode;
  setSortMode: (value: IdeaSortMode) => void;
}) {
  return (
    <section className="panel page-stack">
      <div className="section-split">
        <div>
          <p className="eyebrow">Idea Backlog</p>
          <h3>Real planning-source ideas only</h3>
        </div>
        <div className="brief-meta-column">
          <span>Backlog source</span>
          <strong>{formatDate(payload.ideas.source.updatedAt)}</strong>
          <span>{payload.ideas.source.note}</span>
        </div>
      </div>

      <div className="filters-grid">
        <label>
          Lane
          <select value={laneFilter} onChange={(event) => setLaneFilter(event.target.value as LaneFilter)}>
            <option value="all">All</option>
            <option value="production">Production</option>
            <option value="exploratory">Exploratory</option>
            <option value="deferred">Deferred</option>
          </select>
        </label>
        <label>
          Category
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">By Category</option>
            {payload.ideas.filters.categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Workstream
          <select value={workstreamFilter} onChange={(event) => setWorkstreamFilter(event.target.value)}>
            <option value="all">By Workstream</option>
            {payload.ideas.filters.workstreams.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as IdeaSortMode)}>
            <option value="newest">Newest first</option>
            <option value="highest-score">Highest score</option>
            <option value="highest-leverage">Highest leverage</option>
          </select>
        </label>
      </div>

      <div className="lab-card-grid">
        {items.length ? items.map((item) => <IdeaCard key={item.id} item={item} />) : <EmptyCard message="No real backlog items match the current filters." />}
      </div>
    </section>
  );
}

function IdeaCard({ item }: { item: IdeaBacklogItem }) {
  return (
    <article className="list-card lab-card">
      <div className="section-split">
        <div>
          <h3>{item.title}</h3>
          <div className="badge-row">
            <span className="badge neutral">{item.workstream}</span>
            <span className="badge neutral">{item.category}</span>
            <span className={`badge status-${item.currentState}`}>{item.currentState}</span>
            {item.isNew ? <span className="badge status-local">NEW</span> : null}
          </div>
        </div>
      </div>

      <p className="muted">{item.descriptionSnippet}</p>
      <dl className="lab-key-value">
        <div>
          <dt>Date</dt>
          <dd>{formatDate(item.date)}</dd>
        </div>
        <div>
          <dt>Total score</dt>
          <dd>{item.totalScore ?? "Not tracked"}</dd>
        </div>
        <div>
          <dt>Technical leverage</dt>
          <dd>{item.technicalLeverage ?? "Not tracked"}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{item.confidence ?? "Not tracked"}</dd>
        </div>
      </dl>

      {item.sourceRefs.length ? (
        <div className="ref-row">
          {item.sourceRefs.map((ref) => (
            <code key={ref}>{ref}</code>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ArtifactSection({ payload }: { payload: BuildLabPayload }) {
  return (
    <section className="panel page-stack">
      <div className="section-split">
        <div>
          <p className="eyebrow">Build Artifacts</p>
          <h3>Real build and generated output directories</h3>
        </div>
        <div className="brief-meta-column">
          <span>Artifact refresh</span>
          <strong>{formatDate(payload.artifacts.source.updatedAt)}</strong>
          <span>{payload.artifacts.source.note}</span>
        </div>
      </div>

      <div className="lab-card-grid">
        {payload.artifacts.items.map((item) => (
          <ArtifactCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function ArtifactCard({ item }: { item: BuildArtifact }) {
  return (
    <article className="list-card lab-card">
      <div className="section-split">
        <div>
          <h3>{item.title}</h3>
          <div className="badge-row">
            <span className={`badge ${artifactStateClass(item.state)}`}>{item.state}</span>
            <span className="badge neutral">{item.kind}</span>
          </div>
        </div>
      </div>
      <p className="muted">{item.summary}</p>
      <dl className="lab-key-value">
        <div>
          <dt>Latest change</dt>
          <dd>{item.latestChangedPath || "Unavailable"}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{formatDate(item.updatedAt)}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>{item.fileCount}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{item.sizeLabel}</dd>
        </div>
      </dl>
      {item.recentFiles.length ? (
        <div className="ref-row">
          {item.recentFiles.map((file) => (
            <code key={`${item.id}-${file.path}`}>{file.path}</code>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ResearchSection({ payload }: { payload: BuildLabPayload }) {
  return (
    <section className="panel page-stack">
      <div className="section-split">
        <div>
          <p className="eyebrow">Research Dashboard</p>
          <h3>Latest findings from real workspace outputs</h3>
        </div>
        <div className="brief-meta-column">
          <span>Latest research file</span>
          <strong>{formatDate(payload.research.summary.latestDate)}</strong>
          <span>{payload.research.source.note}</span>
        </div>
      </div>

      <div className="summary-cards">
        {payload.research.sourceStates.map((source) => (
          <article key={source.id} className="stat-card">
            <span>{source.label}</span>
            <strong className={`connection-${source.state}`}>{source.state}</strong>
            <p className="cell-note">{source.detail}</p>
          </article>
        ))}
      </div>

      <div className="lab-card-grid">
        {payload.research.timeline.length ? (
          payload.research.timeline.map((item) => <ResearchCard key={item.id} item={item} />)
        ) : (
          <EmptyCard message="No research files were found in the configured source roots." />
        )}
      </div>
    </section>
  );
}

function ResearchCard({ item }: { item: ResearchRecord }) {
  return (
    <article className="list-card lab-card">
      <div className="section-split">
        <div>
          <h3>{item.title}</h3>
          <div className="badge-row">
            <span className="badge neutral">{item.topic}</span>
            <span className="badge neutral">{item.stage}</span>
            <span className="badge neutral">{item.sourceGroup}</span>
          </div>
        </div>
      </div>

      <p className="muted">{item.summary}</p>
      <dl className="lab-key-value">
        <div>
          <dt>Updated</dt>
          <dd>{formatDate(item.updatedAt)}</dd>
        </div>
        <div>
          <dt>Finding count</dt>
          <dd>{item.findingCount ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>File</dt>
          <dd>{item.path}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{item.sizeLabel}</dd>
        </div>
      </dl>

      {item.producedFiles.length ? (
        <div className="ref-row">
          {item.producedFiles.map((file) => (
            <code key={`${item.id}-${file}`}>{file}</code>
          ))}
        </div>
      ) : null}

      <div>
        <a className="secondary-button lab-link-button" href={item.viewUrl} target="_blank" rel="noreferrer">
          Open research file
        </a>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: PrototypeRegistryItem["status"] }) {
  const className =
    status === "running"
      ? "status-connected"
      : status === "stopped"
        ? "status-failed"
        : status === "archived"
          ? "status-disabled"
          : "status-unavailable";
  return <span className={`badge ${className}`}>{status}</span>;
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <article className={`stat-card ${tone ?? ""}`.trim()}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <article className="list-card empty-state compact">
      <p className="muted">{message}</p>
    </article>
  );
}

function artifactStateClass(state: BuildArtifact["state"]) {
  if (state === "available") return "status-connected";
  if (state === "empty") return "status-unavailable";
  return "status-disabled";
}
