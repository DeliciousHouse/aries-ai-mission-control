import type { ReactNode } from "react";
import type {
  ConnectionState,
  CronRow,
  FlowRow,
  HealthItem,
  ModelUsageRow,
  RuntimePayload,
  SessionRow,
  TaskRow,
} from "../types";
import { formatAgeMinutes, formatDate, formatDurationMs } from "../lib/format";

type Props = {
  payload: RuntimePayload;
};

export function RuntimePage({ payload }: Props) {
  const recentFailures = payload.tasks.rows.filter((task) => task.failureReason).slice(0, 4);

  return (
    <section className="page-stack">
      <header className="page-header panel">
        <div>
          <p className="eyebrow">Runtime</p>
          <h2>OpenClaw live operational visibility</h2>
          <p className="muted">
            Every surface below is backed by a real source. If a source is missing, the dashboard says so.
          </p>
        </div>
        <div className="stats-grid compact-stats">
          <div className="stat-card">
            <span>Refresh</span>
            <strong>{formatDate(payload.freshness)}</strong>
          </div>
          <div className="stat-card warning">
            <span>Recent failures</span>
            <strong>{recentFailures.length}</strong>
          </div>
          <div className="stat-card">
            <span>Sessions</span>
            <strong>{payload.sessions.rows.length}</strong>
          </div>
          <div className="stat-card">
            <span>Tracked tasks</span>
            <strong>{payload.tasks.rows.length}</strong>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="section-split">
          <div>
            <p className="eyebrow">Source registry</p>
            <h3>Connected runtime surfaces</h3>
          </div>
        </div>
        <div className="source-grid">
          {payload.sources.map((source) => (
            <article className="list-card" key={source.id}>
              <div className="section-split">
                <strong>{source.label}</strong>
                <span className={`badge connection-${source.state}`}>{source.state}</span>
              </div>
              <p className="cell-note">{source.command}</p>
              <p>{source.detail}</p>
              <p className="cell-note">Checked {formatDate(source.checkedAt)}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="runtime-grid">
        <SurfaceCard title="Session monitor" state={payload.sessions.state} detail={payload.sessions.detail}>
          <SessionTable rows={payload.sessions.rows} />
        </SurfaceCard>

        <SurfaceCard title="Task monitor" state={payload.tasks.state} detail={payload.tasks.detail}>
          <TaskTable rows={payload.tasks.rows} />
        </SurfaceCard>

        <SurfaceCard title="Lobster / flow monitor" state={payload.flows.state} detail={payload.flows.detail}>
          <FlowTable rows={payload.flows.rows} />
        </SurfaceCard>

        <SurfaceCard title="Scheduler / cron monitor" state={payload.cron.state} detail={payload.cron.detail}>
          <CronTable rows={payload.cron.rows} />
        </SurfaceCard>

        <SurfaceCard title="Model usage monitor" state={payload.modelUsage.state} detail={payload.modelUsage.detail}>
          <div className="summary-cards">
            <div className="stat-card">
              <span>Configured default</span>
              <strong>{payload.modelUsage.configuredDefault ?? "Unavailable"}</strong>
            </div>
            <div className="stat-card">
              <span>Fallbacks</span>
              <strong>{payload.modelUsage.configuredFallbacks.length}</strong>
            </div>
            <div className="stat-card">
              <span>Usage cost total</span>
              <strong>
                {payload.modelUsage.usageCost.totalCost == null
                  ? "Unavailable"
                  : `$${payload.modelUsage.usageCost.totalCost.toFixed(2)}`}
              </strong>
            </div>
          </div>
          <ModelUsageTable rows={payload.modelUsage.rows} />
        </SurfaceCard>

        <SurfaceCard title="System health summary" state={payload.health.state} detail={payload.health.detail}>
          <HealthTable rows={payload.health.rows} />
        </SurfaceCard>
      </div>
    </section>
  );
}

function SurfaceCard({
  title,
  state,
  detail,
  children,
}: {
  title: string;
  state: ConnectionState;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section className="panel runtime-panel">
      <div className="section-split">
        <div>
          <h3>{title}</h3>
          <p className="muted">{detail}</p>
        </div>
        <span className={`badge connection-${state}`}>{state}</span>
      </div>
      {children}
    </section>
  );
}

function SessionTable({ rows }: { rows: SessionRow[] }) {
  if (!rows.length) {
    return <EmptySurface label="No active or recent sessions visible from the current source" />;
  }
  return (
    <DataTable
      headers={["Session", "Type", "Initiator", "Started", "Age", "State", "Model"]}
      rows={rows.map((row) => [
        <div key={row.id}>
          <strong>{row.sessionKey}</strong>
          <p className="cell-note">Updated {formatDate(row.updatedAt)}</p>
        </div>,
        row.sessionType,
        row.initiator ?? "Unavailable",
        formatDate(row.startedAt),
        formatAgeMinutes(row.ageMinutes),
        row.currentState ?? "Unavailable from source",
        row.model ? `${row.provider ?? "provider"} / ${row.model}` : "Unavailable",
      ])}
    />
  );
}

function TaskTable({ rows }: { rows: TaskRow[] }) {
  if (!rows.length) {
    return <EmptySurface label="No tasks returned by the current runtime source" />;
  }
  return (
    <DataTable
      headers={["Task", "Runtime", "Status", "Agent", "Start", "Duration", "Model", "Failure"]}
      rows={rows.map((row) => [
        <div key={row.id}>
          <strong>{row.label}</strong>
          <p className="cell-note">{row.childSessionKey ?? row.id}</p>
        </div>,
        row.runtime,
        <span className={`badge status-${row.status === "running" ? "in_progress" : row.status}`}>{row.latestStatus}</span>,
        row.agentId ?? "—",
        formatDate(row.startedAt),
        formatDurationMs(row.durationMs),
        row.model ? `${row.provider ?? "provider"} / ${row.model}` : "Unavailable",
        row.failureReason ?? "—",
      ])}
    />
  );
}

function FlowTable({ rows }: { rows: FlowRow[] }) {
  if (!rows.length) {
    return <EmptySurface label="No TaskFlow / Lobster runs are currently exposed by the connected source" />;
  }
  return (
    <DataTable
      headers={["Flow", "Owner", "Status", "Stage", "Started", "Updated", "Linkage"]}
      rows={rows.map((row) => [
        row.id,
        row.ownerKey ?? "—",
        row.status ?? "Unknown",
        row.stage ?? "Unavailable",
        formatDate(row.startedAt),
        formatDate(row.updatedAt),
        row.relatedTaskId ?? row.relatedSessionKey ?? "Unavailable",
      ])}
    />
  );
}

function CronTable({ rows }: { rows: CronRow[] }) {
  if (!rows.length) {
    return <EmptySurface label="Scheduler source is connected but no cron jobs were returned" />;
  }
  return (
    <DataTable
      headers={["Job", "Schedule", "Last run", "Next run", "Result", "Failures", "Reason"]}
      rows={rows.map((row) => [
        <div key={row.id}>
          <strong>{row.name}</strong>
          <p className="cell-note">{row.enabled ? "Enabled" : "Disabled"}</p>
        </div>,
        row.schedule,
        formatDate(row.lastRun),
        formatDate(row.nextRun),
        row.lastResult ?? "Unavailable",
        row.consecutiveFailures == null ? "—" : row.consecutiveFailures.toString(),
        row.failureReason ?? "—",
      ])}
    />
  );
}

function ModelUsageTable({ rows }: { rows: ModelUsageRow[] }) {
  if (!rows.length) {
    return <EmptySurface label="Model usage is unavailable from current runtime activity" />;
  }
  return (
    <DataTable
      headers={["Model", "Linked to", "Scope", "Updated", "Tokens", "Cost"]}
      rows={rows.map((row) => [
        `${row.provider} / ${row.model}`,
        row.linkedTo,
        row.linkedType,
        formatDate(row.updatedAt),
        row.tokenTotal == null ? "Unavailable" : row.tokenTotal.toLocaleString(),
        row.costTotal == null ? "Unavailable" : `$${row.costTotal.toFixed(2)}`,
      ])}
    />
  );
}

function HealthTable({ rows }: { rows: HealthItem[] }) {
  if (!rows.length) {
    return <EmptySurface label="Health source did not return any service rows" />;
  }
  return (
    <DataTable
      headers={["Service", "Status", "Detail", "Updated"]}
      rows={rows.map((row) => [
        row.label,
        <span className={`badge health-${row.status}`}>{row.status}</span>,
        row.detail,
        formatDate(row.updatedAt),
      ])}
    />
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="table-scroll">
      <table className="data-table responsive-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${index}-${headers[0]}`}>
              {row.map((cell, cellIndex) => (
                <td data-label={headers[cellIndex]} key={`${index}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptySurface({ label }: { label: string }) {
  return (
    <div className="empty-state compact">
      <h3>Nothing to show</h3>
      <p className="muted">{label}</p>
    </div>
  );
}
