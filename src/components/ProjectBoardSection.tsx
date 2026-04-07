import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ProjectBoardTaskPatch } from "../lib/api";
import { orgMemberHref } from "../lib/orgLinks";
import { formatDate } from "../lib/format";
import { TaskDrawer, defaultEditorState, toEditorState, taskToInput, type EditorState } from "./TaskDrawer";
import type {
  CommandPayload,
  ProjectBoardActor,
  ProjectBoardExecutionMode,
  ProjectBoardPriority,
  ProjectBoardStatus,
  ProjectBoardSystemScope,
  ProjectBoardTask,
  ProjectBoardTaskDomain,
} from "../types";

type Props = {
  payload: CommandPayload;
  onReload: () => Promise<void>;
};

type FilterState = {
  assigneeId: string;
  status: string;
  priority: string;
  workstream: string;
  systemScope: string;
  taskDomain: string;
  blockedOnly: boolean;
  staleOnly: boolean;
};

type ViewMode = "board" | "list";

const DEFAULT_FILTERS: FilterState = {
  assigneeId: "all",
  status: "all",
  priority: "all",
  workstream: "all",
  systemScope: "all",
  taskDomain: "all",
  blockedOnly: false,
  staleOnly: false,
};

const DEFAULT_STATUS_FLOW: ProjectBoardStatus[] = ["intake", "scoping", "ready", "active", "review", "shipped", "follow-up"];
const DEFAULT_ACTOR_ID = "jarvis";

function filterTask(task: ProjectBoardTask, filters: FilterState) {
  if (filters.assigneeId !== "all" && task.assigneeId !== filters.assigneeId) return false;
  if (filters.status !== "all" && task.status !== filters.status) return false;
  if (filters.priority !== "all" && task.priority !== filters.priority) return false;
  if (filters.workstream !== "all" && task.workstream !== filters.workstream) return false;
  if (filters.systemScope !== "all" && task.systemScope !== filters.systemScope) return false;
  if (filters.taskDomain !== "all" && task.taskDomain !== filters.taskDomain) return false;
  if (filters.blockedOnly && !task.blocked) return false;
  if (filters.staleOnly && !task.stale) return false;
  return true;
}

function sortByStatus(tasks: ProjectBoardTask[]) {
  return [...tasks].sort((left, right) => {
    const statusDelta = DEFAULT_STATUS_FLOW.indexOf(left.status) - DEFAULT_STATUS_FLOW.indexOf(right.status);
    if (statusDelta !== 0) return statusDelta;
    return (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0);
  });
}

function statusLabel(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function systemScopeLabel(value: string) {
  if (value === "aries-app") return "Aries";
  if (value === "mission-control") return "MC";
  if (value === "openclaw") return "OC";
  return statusLabel(value);
}

function domainLabel(value: string) {
  if (value === "runtime-automation") return "Runtime";
  if (value === "operations-knowledge") return "Ops";
  if (value === "manual-ops") return "Manual";
  if (value === "openclaw-change") return "OC";
  return statusLabel(value);
}

function actorTone(actor: ProjectBoardActor | null | undefined) {
  if (!actor) return "tone-neutral";
  if (actor.id === "forge") return "tone-forge";
  if (actor.id === "signal") return "tone-signal";
  if (actor.id === "ledger") return "tone-ledger";
  if (actor.id === "jarvis") return "tone-jarvis";
  if (actor.assigneeType === "human-collaborator") return "tone-human";
  return "tone-neutral";
}

function ownershipLabel(actor: ProjectBoardActor | null | undefined) {
  if (!actor) return "Unknown";
  if (["ai-orchestrator", "chief", "ai-specialist"].includes(actor.assigneeType)) return "AI";
  if (actor.assigneeType === "human-collaborator") return "Human";
  if (actor.assigneeType === "human-authority") return "Brendan";
  return actor.assigneeType;
}

function executionModeLabel(value: ProjectBoardExecutionMode) {
  if (value === "brendan-only") return "Brendan-only";
  if (value === "proposal-for-brendan-review") return "Proposal";
  return "";
}

export function ProjectBoardSection({ payload, onReload }: Props) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [actorId, setActorId] = useState(DEFAULT_ACTOR_ID);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQuickView, setActiveQuickView] = useState<string>("all");
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const selectedTask = useMemo(
    () => payload.tasks.find((task) => task.id === selectedTaskId) || null,
    [payload.tasks, selectedTaskId],
  );

  useEffect(() => {
    if (selectedTaskId) return;
    const params = new URLSearchParams(window.location.search);
    const requestedTaskId = params.get("taskId");
    if (!requestedTaskId) return;
    if (payload.tasks.some((task) => task.id === requestedTaskId)) {
      setSelectedTaskId(requestedTaskId);
      setCreating(false);
      params.delete("taskId");
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [payload.tasks, selectedTaskId]);

  const visibleTasks = useMemo(() => sortByStatus(payload.tasks.filter((task) => filterTask(task, filters))), [filters, payload.tasks]);

  const groupedTasks = useMemo(
    () => payload.statusFlow.map((status) => ({
      ...status,
      tasks: visibleTasks.filter((task) => task.status === status.id),
    })),
    [payload.statusFlow, visibleTasks],
  );

  const summary = useMemo(
    () => ({
      total: payload.tasks.length,
      visible: visibleTasks.length,
      blocked: payload.tasks.filter((task) => task.blocked).length,
      stale: payload.tasks.filter((task) => task.stale).length,
      p0: payload.tasks.filter((task) => task.priority === "P0").length,
    }),
    [payload.tasks, visibleTasks.length],
  );

  const actorById = useMemo(() => new Map(payload.actors.map((actor) => [actor.id, actor])), [payload.actors]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.assigneeId !== "all") count++;
    if (filters.status !== "all") count++;
    if (filters.priority !== "all") count++;
    if (filters.workstream !== "all") count++;
    if (filters.systemScope !== "all") count++;
    if (filters.taskDomain !== "all") count++;
    if (filters.blockedOnly) count++;
    if (filters.staleOnly) count++;
    return count;
  }, [filters]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: keyof FilterState | "reset"; label: string }> = [];
    if (filters.assigneeId !== "all") {
      const match = payload.filterOptions.assignees.find((item) => item.value === filters.assigneeId);
      chips.push({ key: "assigneeId", label: `Assignee: ${match?.label || filters.assigneeId}` });
    }
    if (filters.status !== "all") chips.push({ key: "status", label: `Status: ${statusLabel(filters.status)}` });
    if (filters.priority !== "all") chips.push({ key: "priority", label: `Priority: ${filters.priority}` });
    if (filters.workstream !== "all") chips.push({ key: "workstream", label: `Workstream: ${filters.workstream}` });
    if (filters.systemScope !== "all") chips.push({ key: "systemScope", label: `Scope: ${systemScopeLabel(filters.systemScope)}` });
    if (filters.taskDomain !== "all") chips.push({ key: "taskDomain", label: `Domain: ${domainLabel(filters.taskDomain)}` });
    if (filters.blockedOnly) chips.push({ key: "blockedOnly", label: "Blocked only" });
    if (filters.staleOnly) chips.push({ key: "staleOnly", label: "Stale only" });
    return chips;
  }, [filters, payload.filterOptions.assignees]);

  const handleQuickView = (viewId: string) => {
    const quickView = payload.quickViews.find((item) => item.id === viewId);
    if (!quickView) return;
    setActiveQuickView(viewId);
    setFilters({
      ...DEFAULT_FILTERS,
      assigneeId: quickView.filters.assigneeId ?? "all",
      status: quickView.filters.status ?? "all",
      priority: quickView.filters.priority ?? "all",
      workstream: quickView.filters.workstream ?? "all",
      systemScope: quickView.filters.systemScope ?? "all",
      taskDomain: quickView.filters.taskDomain ?? "all",
      blockedOnly: Boolean(quickView.filters.blocked),
      staleOnly: Boolean(quickView.filters.stale),
    });
  };

  const openCreate = () => {
    setCreating(true);
    setSelectedTaskId(null);
    setError(null);
  };

  const openEdit = (task: ProjectBoardTask) => {
    setCreating(false);
    setSelectedTaskId(task.id);
    setError(null);
  };

  const closeDrawer = () => {
    setSelectedTaskId(null);
    setCreating(false);
    setError(null);
  };

  const handleSave = useCallback(async (editorState: EditorState, forceAction?: boolean, forceReason?: string) => {
    try {
      setSaving(true);
      setError(null);
      const input = taskToInput(editorState);
      if (creating) {
        const created = await api.createProjectBoardTask(actorId, input, editorState.note.trim() || undefined);
        await onReload();
        setCreating(false);
        setSelectedTaskId(created.id);
      } else if (selectedTask) {
        const updates: ProjectBoardTaskPatch = input;
        await api.updateProjectBoardTask(
          selectedTask.id,
          actorId,
          updates,
          editorState.note.trim() || undefined,
          forceAction,
          forceReason,
        );
        await onReload();
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save task.");
    } finally {
      setSaving(false);
    }
  }, [actorId, creating, onReload, selectedTask]);

  return (
    <>
      <section className="panel page-stack">
        <div className="section-split" style={{ alignItems: "center" }}>
          <div>
            <p className="eyebrow">Project board</p>
            <h3>Execution source of truth</h3>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--muted)", fontSize: "0.84rem" }}>
              Acting as
              <select value={actorId} onChange={(event) => setActorId(event.target.value)} style={{ width: "auto", minWidth: "140px" }}>
                {payload.actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>{actor.label}</option>
                ))}
              </select>
            </label>
            <button type="button" className="drawer-save-btn" onClick={openCreate} style={{ padding: "8px 16px" }}>+ New task</button>
          </div>
        </div>

        <div className="board-summary-strip">
          <span className="summary-chip"><span>Total</span> <strong>{summary.total}</strong></span>
          <span className="summary-chip"><span>Showing</span> <strong>{summary.visible}</strong></span>
          {summary.blocked > 0 ? <span className="summary-chip has-warning"><span>Blocked</span> <strong>{summary.blocked}</strong></span> : null}
          {summary.stale > 0 ? <span className="summary-chip has-danger"><span>Stale</span> <strong>{summary.stale}</strong></span> : null}
          {summary.p0 > 0 ? <span className="summary-chip has-danger"><span>P0</span> <strong>{summary.p0}</strong></span> : null}
        </div>

        <div className="toolbar">
          <div className="tab-row wrap">
            {payload.quickViews.map((view) => (
              <button
                key={view.id}
                type="button"
                className={`tab-button ${activeQuickView === view.id ? "is-active" : ""}`}
                onClick={() => handleQuickView(view.id)}
              >
                {view.label} <span>{view.count}</span>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="view-toggle-group">
              <button type="button" className={`tab-button ${viewMode === "board" ? "is-active" : ""}`} onClick={() => setViewMode("board")}>Board</button>
              <button type="button" className={`tab-button ${viewMode === "list" ? "is-active" : ""}`} onClick={() => setViewMode("list")}>List</button>
            </div>
            <button type="button" className="filters-toggle" onClick={() => setFiltersExpanded((v) => !v)}>
              Filters {activeFilterCount > 0 ? <span className="filter-count">{activeFilterCount}</span> : null}
            </button>
          </div>

          <div className={`filters-expandable ${filtersExpanded ? "is-expanded" : ""}`}>
            <div className="filters-inner">
              <div className="filters-grid board-filters-grid" style={{ paddingTop: "8px" }}>
                <label>
                  Assignee
                  <select value={filters.assigneeId} onChange={(event) => setFilters((c) => ({ ...c, assigneeId: event.target.value }))}>
                    <option value="all">All</option>
                    {payload.filterOptions.assignees.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select value={filters.status} onChange={(event) => setFilters((c) => ({ ...c, status: event.target.value }))}>
                    <option value="all">All</option>
                    {payload.filterOptions.statuses.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select value={filters.priority} onChange={(event) => setFilters((c) => ({ ...c, priority: event.target.value }))}>
                    <option value="all">All</option>
                    {payload.filterOptions.priorities.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  System scope
                  <select value={filters.systemScope} onChange={(event) => setFilters((c) => ({ ...c, systemScope: event.target.value }))}>
                    <option value="all">All</option>
                    {payload.filterOptions.systemScopes.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Task domain
                  <select value={filters.taskDomain} onChange={(event) => setFilters((c) => ({ ...c, taskDomain: event.target.value }))}>
                    <option value="all">All</option>
                    {payload.filterOptions.taskDomains.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="checkbox-filter">
                  <input checked={filters.blockedOnly} onChange={(event) => setFilters((c) => ({ ...c, blockedOnly: event.target.checked }))} type="checkbox" />
                  Blocked only
                </label>
                <label className="checkbox-filter">
                  <input checked={filters.staleOnly} onChange={(event) => setFilters((c) => ({ ...c, staleOnly: event.target.checked }))} type="checkbox" />
                  Stale only
                </label>
                {activeFilterCount > 0 ? (
                  <button type="button" className="secondary-button" onClick={() => { setFilters(DEFAULT_FILTERS); setActiveQuickView("all"); }} style={{ alignSelf: "end" }}>
                    Clear filters
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {activeFilterChips.length ? (
            <div className="filter-chips-row">
              {activeFilterChips.map((chip) => (
                <span className="filter-chip" key={chip.label}>
                  {chip.label}
                  <button
                    type="button"
                    className="filter-chip-remove"
                    aria-label={`Remove ${chip.label}`}
                    onClick={() => {
                      if (chip.key === "assigneeId") setFilters((c) => ({ ...c, assigneeId: "all" }));
                      if (chip.key === "status") setFilters((c) => ({ ...c, status: "all" }));
                      if (chip.key === "priority") setFilters((c) => ({ ...c, priority: "all" }));
                      if (chip.key === "workstream") setFilters((c) => ({ ...c, workstream: "all" }));
                      if (chip.key === "systemScope") setFilters((c) => ({ ...c, systemScope: "all" }));
                      if (chip.key === "taskDomain") setFilters((c) => ({ ...c, taskDomain: "all" }));
                      if (chip.key === "blockedOnly") setFilters((c) => ({ ...c, blockedOnly: false }));
                      if (chip.key === "staleOnly") setFilters((c) => ({ ...c, staleOnly: false }));
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {viewMode === "board" ? (
          <div className="status-board-grid">
            {groupedTasks.map((column) => (
              <section className="status-column" key={column.id}>
                <div className="section-split status-column-heading">
                  <div>
                    <p className="eyebrow">{column.label}</p>
                    <h3>{column.tasks.length}</h3>
                  </div>
                  <div className="status-column-metrics">
                    <span className="signal-badge tone-neutral">{column.tasks.filter((task) => task.blocked).length} blocked</span>
                    <span className="signal-badge tone-neutral">{column.tasks.filter((task) => task.priority === "P0").length} P0</span>
                  </div>
                </div>
                <div className="status-column-stack">
                  {column.tasks.length ? (
                    column.tasks.map((task) => {
                      const taskActor = actorById.get(task.assigneeId) || null;
                      return (
                        <article key={task.id} className={`task-card-shell ${actorTone(taskActor)}`}>
                          <button
                            type="button"
                            className={`task-card-button ${selectedTaskId === task.id ? "is-active" : ""} ${task.stale ? "is-stale" : ""}`}
                            onClick={() => openEdit(task)}
                          >
                            <div className="section-split task-card-top">
                              <strong style={{ fontSize: "0.92rem" }}>{task.title}</strong>
                              <span className={`badge priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                            </div>
                            <p className="cell-note" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{task.description}</p>
                            <p className="task-card-next" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {task.nextAction || "No next action recorded."}
                            </p>
                            <div className="badge-row" style={{ gap: "4px" }}>
                              <span className="badge neutral">{systemScopeLabel(task.systemScope)}</span>
                              <span className="badge neutral">{domainLabel(task.taskDomain)}</span>
                              <span className="badge neutral">{ownershipLabel(taskActor)}</span>
                              {task.executionMode !== "standard" ? <span className="badge status-unavailable">{executionModeLabel(task.executionMode)}</span> : null}
                              {task.blocked ? <span className="badge status-blocked">Blocked</span> : null}
                            </div>
                            <div className="task-card-meta">
                              <span>{task.workstream}</span>
                              <span>{task.dependencies.length} deps</span>
                              {task.stale ? <span className="status-failed">Stale {task.staleDays}d</span> : <span>{statusLabel(task.status)}</span>}
                            </div>
                          </button>
                          <div className="task-card-footer">
                            <a className="board-assignee-link" href={orgMemberHref(task.assigneeId)}>
                              <span className="assignee-emoji">{taskActor?.emoji || "\u2022"}</span>
                              <span style={{ fontSize: "0.84rem" }}>{taskActor?.displayName?.replace(`${taskActor.emoji} `, "") || task.assigneeDisplayName}</span>
                            </a>
                            <span className="cell-note" style={{ fontSize: "0.78rem" }}>{formatDate(task.updatedAt)}</span>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="empty-state compact task-column-empty">
                      <p className="muted">Empty</p>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section className="table-panel board-list-panel">
            {visibleTasks.length ? (
              <div className="table-scroll">
                <table className="data-table responsive-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Assignee</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Scope</th>
                      <th>Updated</th>
                      <th>Blocker</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.map((task) => {
                      const taskActor = actorById.get(task.assigneeId) || null;
                      return (
                        <tr
                          key={task.id}
                          className={`${task.stale ? "row-stale" : ""} ${actorTone(taskActor)}`}
                          onClick={() => openEdit(task)}
                          style={{ cursor: "pointer" }}
                        >
                          <td data-label="Task">
                            <strong>{task.title}</strong>
                            <p className="cell-note" style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{task.description}</p>
                            <p className="cell-note" style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: "4px" }}>{task.nextAction}</p>
                          </td>
                          <td data-label="Assignee">
                            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <span className="assignee-emoji">{taskActor?.emoji || "\u2022"}</span>
                              <span>{taskActor?.displayName?.replace(`${taskActor.emoji} `, "") || task.assigneeDisplayName}</span>
                            </span>
                          </td>
                          <td data-label="Status">
                            <span className={`badge status-${task.status}`}>{statusLabel(task.status)}</span>
                          </td>
                          <td data-label="Priority">
                            <span className={`badge priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                          </td>
                          <td data-label="Scope">{systemScopeLabel(task.systemScope)}</td>
                          <td data-label="Updated">
                            <span>{formatDate(task.updatedAt)}</span>
                            {task.stale ? <span className="badge status-failed" style={{ marginLeft: "4px" }}>Stale</span> : null}
                          </td>
                          <td data-label="Blocker">
                            {task.blocked ? <span className="badge status-blocked">{task.blockerReason || "Blocked"}</span> : <span className="muted">\u2014</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state compact">
                <p className="muted">No tasks match the current filters.</p>
              </div>
            )}
          </section>
        )}
      </section>

      <TaskDrawer
        task={selectedTask}
        creating={creating}
        actors={payload.actors}
        assignees={payload.assignees}
        statusFlow={payload.statusFlow}
        filterOptions={payload.filterOptions}
        actorId={actorId}
        onSave={handleSave}
        onClose={closeDrawer}
        saving={saving}
        error={error}
      />
    </>
  );
}
