import { useMemo } from "react";
import { formatDate } from "../lib/format";
import type { ApiEnvelope, StandupArchivePayload, StandupChiefRecord, StandupRecord } from "../types";
import { usePollingResource } from "../hooks/usePollingResource";

type Props = {
  state: ReturnType<typeof usePollingResource<ApiEnvelope<StandupArchivePayload>>>;
  data?: StandupArchivePayload;
  selectedId: string | null;
  selectedRecord: StandupRecord | null;
  onSelect: (id: string | null) => void;
  onBack: () => void;
};

export function StandupsPanel({ state, data, selectedId, selectedRecord, onSelect, onBack }: Props) {
  const items = data?.items ?? [];
  const summary = data?.summary ?? { latestId: null, total: 0, complete: 0, partial: 0, failed: 0 };

  const detailChiefs = useMemo(() => selectedRecord?.chiefs ?? [], [selectedRecord]);

  return (
    <section className="panel">
      <div className="section-split detail-breadcrumb-row">
        <button className="secondary-button overview-link-button" onClick={onBack} type="button">
          Back to overview
        </button>
        <span className={`badge ${statusBadgeClass(selectedRecord?.status || "partial")}`}>
          {selectedRecord?.status || (state.loading ? "loading" : state.error ? "error" : "standups")}
        </span>
      </div>

      <div className="section-split">
        <div>
          <p className="eyebrow">Meetings / Standups</p>
          <h3>Daily standup archive</h3>
          <p className="muted">Real transcript files from <code>team/meetings</code>, newest first. No fabricated rows.</p>
        </div>
      </div>

      <div className="stats-grid compact-stats">
        <div className="stat-card success">
          <span>Complete</span>
          <strong>{summary.complete}</strong>
        </div>
        <div className="stat-card warning">
          <span>Partial</span>
          <strong>{summary.partial}</strong>
        </div>
        <div className="stat-card danger">
          <span>Failed</span>
          <strong>{summary.failed}</strong>
        </div>
        <div className="stat-card">
          <span>Total</span>
          <strong>{summary.total}</strong>
        </div>
      </div>

      {state.error && !data ? <PanelEmpty title="Unable to load standups" body={state.error} tone="error" /> : null}

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
          title="No standup transcripts yet"
          body="No transcript files were found in team/meetings. A standup is only visible after a real transcript is saved."
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
                  <span className={`badge ${statusBadgeClass(item.status)}`}>{item.status}</span>
                </div>
                <div className="brief-meta">
                  <span className="muted">{item.date}</span>
                  <span className="muted">{formatDate(item.generatedAt)}</span>
                </div>
                <p className="cell-note">{item.preview}</p>
              </button>
            ))}
          </aside>

          <section className="panel markdown-preview-panel standup-detail-panel">
            <div className="section-split">
              <div>
                <strong>{selectedRecord?.title ?? "Select a standup"}</strong>
                <p className="muted">{selectedRecord?.path || "team/meetings"}</p>
              </div>
              {selectedRecord ? <span className={`badge ${statusBadgeClass(selectedRecord.status)}`}>{selectedRecord.status}</span> : null}
            </div>

            {selectedRecord ? (
              <>
                <div className="summary-cards">
                  <SummaryCard label="Date" value={selectedRecord.date} tone="neutral" />
                  <SummaryCard label="Delivery" value={selectedRecord.delivery} tone="neutral" />
                  <SummaryCard label="Board" value={selectedRecord.boardPath} tone="neutral" />
                </div>

                {selectedRecord.audioPath ? (
                  <section className="panel standup-audio-panel">
                    <div className="section-split">
                      <strong>Audio</strong>
                      <span className="badge neutral">Available</span>
                    </div>
                    <audio controls preload="none" src={`/api/standups/file?path=${encodeURIComponent(selectedRecord.audioPath)}`} />
                    <p className="muted">{selectedRecord.audioPath}</p>
                  </section>
                ) : null}

                <section className="panel standup-chief-grid">
                  <div className="section-split">
                    <strong>Chief reports</strong>
                    <span className="muted">Highlighted from the saved transcript</span>
                  </div>
                  <div className="three-column-grid standup-chief-cards">
                    {detailChiefs.length ? (
                      detailChiefs.map((chief) => <ChiefCard chief={chief} key={`${selectedRecord.id}-${chief.chiefId}`} />)
                    ) : (
                      <PanelEmpty title="No chief sections parsed" body="This transcript does not expose parseable chief sections yet." tone="warning" />
                    )}
                  </div>
                </section>

                <section className="panel standup-transcript-panel">
                  <div className="section-split">
                    <strong>Full transcript</strong>
                    <span className="badge neutral">markdown</span>
                  </div>
                  <pre className="standup-transcript-raw">{selectedRecord.markdown}</pre>
                </section>
              </>
            ) : (
              <p className="muted">Select a standup from the left.</p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function ChiefCard({ chief }: { chief: StandupChiefRecord }) {
  return (
    <article className="list-card standup-chief-card">
      <div className="section-split">
        <strong>{chief.title}</strong>
        <span className={`badge ${statusBadgeClass(chief.status)}`}>{chief.status}</span>
      </div>
      <p className="muted">{chief.preview}</p>
      <div className="ref-row">
        <code>{chief.chiefId}</code>
        {chief.agentId ? <code>{chief.agentId}</code> : null}
      </div>
      <pre className="standup-chief-markdown">{chief.markdown}</pre>
    </article>
  );
}

function PanelEmpty({ title, body, tone }: { title: string; body: string; tone?: "error" | "warning" }) {
  return (
    <div className={`empty-state compact ${tone === "error" ? "status-error" : tone === "warning" ? "status-warning" : ""}`}>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </div>
  );
}

function SummaryCard({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "success" | "danger" | "warning" | "neutral" }) {
  return (
    <div className={`stat-card ${tone === "success" ? "success" : tone === "danger" ? "danger" : tone === "warning" ? "warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "complete" || normalized === "completed" || normalized === "healthy") return "status-done";
  if (normalized === "failed" || normalized === "error") return "status-failed";
  if (normalized === "partial" || normalized === "source-unavailable" || normalized === "timed-out") return "status-unavailable";
  return "neutral";
}
