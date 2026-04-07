import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import type { ApiEnvelope, RoutingRequest, RoutingRequestPayload } from "../types";

type ResourceState<T> = {
  data: ApiEnvelope<T> | null;
  loading: boolean;
  error: string | null;
  attempted?: boolean;
  reload: () => Promise<void>;
};

type Props = {
  state: ResourceState<RoutingRequestPayload>;
};

type Filters = {
  status: string;
  chief: string;
  requestType: string;
  relatedTaskId: string;
};

const DEFAULT_FILTERS: Filters = {
  status: "pending",
  chief: "all",
  requestType: "all",
  relatedTaskId: "all",
};

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function badgeTone(status: string) {
  if (["applied", "approved", "delivered"].includes(status)) return "status-done";
  if (["rejected", "failed"].includes(status)) return "status-failed";
  if (["pending", "unavailable"].includes(status)) return "status-unavailable";
  return "neutral";
}

function taskBoardHref(taskId: string | null) {
  if (!taskId) return null;
  return `/?taskId=${encodeURIComponent(taskId)}#/command`;
}

function requestSubtitle(request: RoutingRequest) {
  const taskLabel = request.relatedTaskTitle || request.relatedTaskId || "Unlinked task";
  return `${request.sourceChiefId} • ${taskLabel}`;
}

export function RoutingRequestsPanel({ state }: Props) {
  const payload = state.data?.data;
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actingAs, setActingAs] = useState("brendan");
  const [decisionNote, setDecisionNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requests = payload?.requests ?? [];
  const selected = useMemo(() => requests.find((request) => request.id === selectedId) || null, [requests, selectedId]);

  useEffect(() => {
    if (selectedId || !requests.length) return;
    const params = new URLSearchParams(window.location.search);
    const initialId = params.get("approvalId");
    if (initialId && requests.some((request) => request.id === initialId)) {
      setSelectedId(initialId);
      return;
    }
    setSelectedId(requests[0].id);
  }, [requests, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("commandView", "approvals");
    url.searchParams.set("approvalId", selectedId);
    window.history.replaceState({}, "", url.toString());
  }, [selectedId]);

  const visible = useMemo(() => {
    return requests.filter((request) => {
      if (filters.status !== "all" && request.status !== filters.status) return false;
      if (filters.chief !== "all" && request.sourceChiefId !== filters.chief) return false;
      if (filters.requestType !== "all" && request.requestType !== filters.requestType) return false;
      if (filters.relatedTaskId !== "all" && request.relatedTaskId !== filters.relatedTaskId) return false;
      return true;
    });
  }, [filters, requests]);

  async function handleDecision(action: "approve" | "reject") {
    if (!selected) return;
    try {
      setSaving(true);
      setError(null);
      if (action === "approve") {
        await api.approveRoutingRequest(selected.id, actingAs, decisionNote || undefined);
      } else {
        await api.rejectRoutingRequest(selected.id, actingAs, decisionNote || undefined);
      }
      setDecisionNote("");
      await state.reload();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Unable to update routing request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel page-stack approval-panel">
      <div className="section-split">
        <div>
          <p className="eyebrow">Approvals</p>
          <h3>Routing confirmation inbox</h3>
          <p className="muted">Every approval-worthy routing proposal is persisted here. No transcript-only routing, no hidden auto-approval.</p>
        </div>
        <div className="approval-summary-strip">
          <span className="summary-chip"><span>Total</span> <strong>{payload?.stats.total ?? 0}</strong></span>
          <span className="summary-chip has-warning"><span>Pending</span> <strong>{payload?.stats.pending ?? 0}</strong></span>
          <span className="summary-chip"><span>Applied</span> <strong>{payload?.stats.applied ?? 0}</strong></span>
          <span className={`summary-chip ${(payload?.stats.telegramUnavailable ?? 0) > 0 ? "has-danger" : ""}`}><span>Telegram</span> <strong>{payload?.stats.telegramDelivered ?? 0}/{payload?.stats.approvalRequired ?? 0}</strong></span>
        </div>
      </div>

      <div className="filters-grid board-filters-grid">
        <label>
          <span>Status</span>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="all">All</option>
            {(payload?.filterOptions.statuses ?? []).map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label>
          <span>Chief</span>
          <select value={filters.chief} onChange={(event) => setFilters((current) => ({ ...current, chief: event.target.value }))}>
            <option value="all">All</option>
            {(payload?.filterOptions.chiefs ?? []).map((chief) => <option key={chief} value={chief}>{chief}</option>)}
          </select>
        </label>
        <label>
          <span>Request type</span>
          <select value={filters.requestType} onChange={(event) => setFilters((current) => ({ ...current, requestType: event.target.value }))}>
            <option value="all">All</option>
            {(payload?.filterOptions.requestTypes ?? []).map((requestType) => <option key={requestType} value={requestType}>{requestType}</option>)}
          </select>
        </label>
        <label>
          <span>Related task</span>
          <select value={filters.relatedTaskId} onChange={(event) => setFilters((current) => ({ ...current, relatedTaskId: event.target.value }))}>
            <option value="all">All</option>
            {(payload?.filterOptions.tasks ?? []).map((task) => <option key={task} value={task}>{task}</option>)}
          </select>
        </label>
      </div>

      {state.error && !payload ? <div className="empty-state compact status-error"><h3>Unable to load approvals</h3><p className="muted">{state.error}</p></div> : null}
      {error ? <div className="warning-block"><strong>Approval action failed</strong><p className="muted">{error}</p></div> : null}

      <div className="approval-grid">
        <aside className="panel brief-list-panel approval-list-panel">
          {visible.length ? visible.map((request) => (
            <button key={request.id} type="button" className={`brief-item ${selectedId === request.id ? "is-active" : ""}`} onClick={() => setSelectedId(request.id)}>
              <div className="section-split">
                <strong>{request.requestedAction}</strong>
                <span className={`badge ${badgeTone(request.status)}`}>{request.status}</span>
              </div>
              <p className="cell-note">{requestSubtitle(request)}</p>
              <div className="brief-meta">
                <span className="muted">{request.requestType}</span>
                <span className={`badge ${badgeTone(request.notification?.status || "neutral")}`}>{request.notification?.status || "none"}</span>
              </div>
              <p className="cell-note">{request.reason}</p>
            </button>
          )) : <div className="empty-state compact"><h3>No matching approval requests</h3><p className="muted">Adjust the filters or wait for the next routed proposal.</p></div>}
        </aside>

        <section className="panel markdown-preview-panel approval-detail-panel">
          {selected ? (
            <>
              <div className="section-split">
                <div>
                  <strong>{selected.requestedAction}</strong>
                  <p className="muted">{requestSubtitle(selected)}</p>
                </div>
                <span className={`badge ${badgeTone(selected.status)}`}>{selected.status}</span>
              </div>

              <div className="summary-cards approval-summary-cards">
                <SummaryCard label="Chief" value={selected.sourceChiefId} />
                <SummaryCard label="Task" value={selected.relatedTaskId || "unlinked"} />
                <SummaryCard label="Approval target" value={selected.approvalTarget} tone={selected.requiresApproval ? "warning" : "neutral"} />
                <SummaryCard label="Created" value={formatDate(selected.createdAt)} />
              </div>

              <div className="approval-detail-columns">
                <article className="panel approval-json-panel">
                  <div className="section-split"><strong>Current board state</strong><span className="badge neutral">before</span></div>
                  <pre>{formatJson(selected.beforeState)}</pre>
                </article>
                <article className="panel approval-json-panel">
                  <div className="section-split"><strong>Proposed change</strong><span className="badge neutral">after</span></div>
                  <pre>{formatJson(selected.proposedState)}</pre>
                </article>
              </div>

              <article className="panel approval-copy-panel">
                <div className="section-split"><strong>Reason</strong><span className="badge neutral">{selected.requestType}</span></div>
                <p>{selected.reason}</p>
                {selected.humanDependency ? <pre>{formatJson(selected.humanDependency)}</pre> : null}
                <div className="approval-link-row">
                  {selected.approvalLink ? <a href={selected.approvalLink} target="_blank" rel="noreferrer">Open direct approval link</a> : null}
                  {taskBoardHref(selected.relatedTaskId) ? <a href={taskBoardHref(selected.relatedTaskId) || undefined}>Open related board task</a> : null}
                </div>
              </article>

              <article className="panel approval-copy-panel">
                <div className="section-split"><strong>Telegram delivery</strong><span className={`badge ${badgeTone(selected.notification?.status || "neutral")}`}>{selected.notification?.status || "none"}</span></div>
                <p className="muted">Target: {selected.notification?.target || "not configured"}</p>
                {selected.notification?.lastError ? <p>{selected.notification.lastError}</p> : null}
                {selected.notification?.command ? <pre>{selected.notification.command}</pre> : null}
              </article>

              <article className="panel approval-copy-panel">
                <div className="section-split"><strong>Decision</strong><span className="badge neutral">{selected.decisionBy || "pending"}</span></div>
                <div className="filters-grid board-filters-grid">
                  <label>
                    <span>Acting as</span>
                    <select value={actingAs} onChange={(event) => setActingAs(event.target.value)} disabled={selected.status !== "pending" || saving}>
                      <option value="brendan">brendan</option>
                      <option value="jarvis">jarvis</option>
                    </select>
                  </label>
                  <label className="approval-note-field">
                    <span>Decision note</span>
                    <textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} rows={4} disabled={selected.status !== "pending" || saving} />
                  </label>
                </div>
                <div className="approval-action-row">
                  <button type="button" className="drawer-save-btn" disabled={selected.status !== "pending" || saving} onClick={() => handleDecision("approve")}>{saving ? "Saving…" : "Approve"}</button>
                  <button type="button" className="secondary-button" disabled={selected.status !== "pending" || saving} onClick={() => handleDecision("reject")}>Reject</button>
                </div>
              </article>

              <article className="panel approval-copy-panel">
                <div className="section-split"><strong>Audit trail</strong><span className="badge neutral">{selected.auditTrail.length}</span></div>
                <div className="approval-audit-list">
                  {selected.auditTrail.map((entry) => (
                    <div key={entry.id} className="list-card approval-audit-entry">
                      <div className="section-split">
                        <strong>{entry.action}</strong>
                        <span className={`badge ${badgeTone(entry.status || "neutral")}`}>{entry.status || "n/a"}</span>
                      </div>
                      <p className="muted">{entry.actorDisplayName} • {formatDate(entry.timestamp)}</p>
                      {entry.note ? <p>{entry.note}</p> : null}
                      {entry.metadata ? <pre>{formatJson(entry.metadata)}</pre> : null}
                    </div>
                  ))}
                </div>
              </article>
            </>
          ) : <p className="muted">Select an approval request from the left.</p>}
        </section>
      </div>
    </section>
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
