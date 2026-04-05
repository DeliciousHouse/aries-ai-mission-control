import { useMemo, useState } from "react";
import { noteTemplates } from "../lib/orgDesign";
import type { BriefRecord, BriefingPayload } from "../types";
import { formatDate, slugLabel } from "../lib/format";

type Props = {
  payload: BriefingPayload;
};

export function BriefingPage({ payload }: Props) {
  const [type, setType] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(payload.summary.newestBriefId);

  const filtered = useMemo(
    () => payload.briefs.filter((brief) => (type === "all" ? true : brief.type === type)),
    [payload.briefs, type],
  );

  const selected =
    filtered.find((brief) => brief.id === selectedId) ?? filtered[0] ?? payload.briefs[0] ?? null;

  return (
    <section className="page-stack">
      <header className="page-header panel">
        <div>
          <p className="eyebrow">Briefing</p>
          <h2>Markdown brief archive</h2>
          <p className="muted">
            Newest-first context from repo and memory markdown sources. No generated filler.
          </p>
        </div>
        <div className="stats-grid compact-stats">
          <div className="stat-card">
            <span>Indexed docs</span>
            <strong>{payload.summary.briefCount}</strong>
          </div>
          <div className="stat-card">
            <span>Newest</span>
            <strong>{selected ? formatDate(selected.updatedAt) : "—"}</strong>
          </div>
        </div>
      </header>

      <section className="panel toolbar">
        <div className="tab-row wrap">
          <button
            className={`tab-button ${type === "all" ? "is-active" : ""}`}
            onClick={() => setType("all")}
            type="button"
          >
            All
          </button>
          {payload.summary.typeCounts.map((item) => (
            <button
              key={item.type}
              className={`tab-button ${type === item.type ? "is-active" : ""}`}
              onClick={() => setType(item.type)}
              type="button"
            >
              {slugLabel(item.type)} <span>{item.count}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel page-stack">
        <div className="section-split">
          <div>
            <p className="eyebrow">Episode 3 planning notes</p>
            <h3>Reusable org-design note templates</h3>
            <p className="muted">
              These templates are meant for internal engineering org decisions: role boundaries, delegation tradeoffs, coverage gaps, and whether a seat should exist at all.
            </p>
          </div>
          <span className="badge neutral">Briefing-ready</span>
        </div>

        <div className="template-grid">
          {noteTemplates.map((template) => (
            <article className="list-card template-card" key={template.id}>
              <div className="section-split">
                <strong>{template.title}</strong>
                <span className="badge neutral">Template</span>
              </div>
              <p>{template.purpose}</p>
              <p className="cell-note">Example: {template.exampleTitle}</p>
              <ul className="inline-list with-spacing">
                {template.fields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="briefing-layout">
        <aside className="panel brief-list-panel">
          <div className="brief-list-header">
            <h3>Index</h3>
            <p className="muted">Sources: {payload.sourceRoots.join(" · ")}</p>
          </div>
          <div className="brief-list">
            {filtered.map((brief) => (
              <button
                key={brief.id}
                className={`brief-item ${selected?.id === brief.id ? "is-active" : ""}`}
                onClick={() => setSelectedId(brief.id)}
                type="button"
              >
                <div>
                  <strong>{brief.title}</strong>
                  <p className="cell-note">{brief.summary}</p>
                </div>
                <div className="brief-meta">
                  <span className="badge neutral">{slugLabel(brief.type)}</span>
                  <span>{formatDate(brief.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="page-stack">
          {selected ? (
            <>
              <article className="panel markdown-panel">
                <div className="section-split">
                  <div>
                    <p className="eyebrow">Reader</p>
                    <h3>{selected.title}</h3>
                    <p className="muted">{selected.path}</p>
                  </div>
                  <div className="brief-meta-column">
                    <span className="badge neutral">{slugLabel(selected.type)}</span>
                    <span className="muted">Updated {formatDate(selected.updatedAt)}</span>
                  </div>
                </div>
                <pre className="markdown-view">{selected.markdown}</pre>
              </article>

              <section className="panel">
                <p className="eyebrow">Fast startup summary</p>
                <div className="summary-cards">
                  <SummaryCard label="Type" value={slugLabel(selected.type)} />
                  <SummaryCard label="Source group" value={selected.sourceGroup} />
                  <SummaryCard label="Headings" value={selected.headings.length.toString()} />
                </div>
                {selected.headings.length ? (
                  <ul className="inline-list with-spacing">
                    {selected.headings.map((heading) => (
                      <li key={heading}>{heading}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No markdown headings were detected in this document.</p>
                )}
              </section>
            </>
          ) : (
            <div className="panel empty-state">
              <h3>No markdown brief sources found</h3>
              <p className="muted">The Briefing module is wired, but no qualifying markdown sources were found.</p>
            </div>
          )}
        </section>
      </section>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
