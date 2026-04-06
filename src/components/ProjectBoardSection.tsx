import { useEffect, useMemo, useState } from "react";
import { api, type ProjectBoardTaskInput, type ProjectBoardTaskPatch } from "../lib/api";
import { orgMemberHref } from "../lib/orgLinks";
import { formatDate } from "../lib/format";
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

type EditorState = {
  title: string;
  description: string;
  assigneeId: string;
  status: ProjectBoardStatus;
  priority: ProjectBoardPriority;
  workstream: string;
  systemScope: ProjectBoardSystemScope;
  taskDomain: ProjectBoardTaskDomain;
  blocked: boolean;
  blockerReason: string;
  deliverableLink: string;
  executionMode: ProjectBoardExecutionMode;
  nextAction: string;
  dependenciesText: string;
  sourceRefsText: string;
  dueDate: string;
  note: string;
};

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

function defaultEditorState(assigneeId = DEFAULT_ACTOR_ID): EditorState {
  return {
    title: "",
    description: "",
    assigneeId,
    status: "intake",
    priority: "P1",
    workstream: "frontend",
    systemScope: "aries-app",
    taskDomain: "frontend",
    blocked: false,
    blockerReason: "",
    deliverableLink: "",
    executionMode: "standard",
    nextAction: "",
    dependenciesText: "",
    sourceRefsText: "",
    dueDate: "",
    note: "",
  };
}

function toEditorState(task: ProjectBoardTask): EditorState {
  return {
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    status: task.status,
    priority: task.priority,
    workstream: task.workstream,
    systemScope: task.systemScope,
    taskDomain: task.taskDomain,
    blocked: task.blocked,
    blockerReason: task.blockerReason || "",
    deliverableLink: task.deliverableLink || "",
    executionMode: task.executionMode,
    nextAction: task.nextAction,
    dependenciesText: task.dependencies.join("\n"),
    sourceRefsText: task.sourceRefs.join("\n"),
    dueDate: task.dueDate || "",
    note: "",
  };
}

function parseLines(value: string) {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function taskToInput(state: EditorState): ProjectBoardTaskInput {
  return {
    title: state.title.trim(),
    description: state.description.trim(),
    assigneeId: state.assigneeId,
    status: state.status,
    priority: state.priority,
    workstream: state.workstream.trim(),
    systemScope: state.systemScope,
    taskDomain: state.taskDomain,
    blocked: state.blocked,
    blockerReason: state.blocked ? state.blockerReason.trim() || null : null,
    deliverableLink: state.deliverableLink.trim() || null,
    executionMode: state.executionMode,
    nextAction: state.nextAction.trim(),
    dependencies: parseLines(state.dependenciesText),
    sourceRefs: parseLines(state.sourceRefsText),
    dueDate: state.dueDate.trim() || null,
  };
}

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

function allowedAssigneeIdsForDraft(
  taskDomain: ProjectBoardTaskDomain,
  systemScope: ProjectBoardSystemScope,
  executionMode: ProjectBoardExecutionMode,
  actors: ProjectBoardActor[],
) {
  if (taskDomain === "openclaw-change" || systemScope === "openclaw") {
    return ["brendan"];
  }
  if (taskDomain === "manual-ops") {
    return ["somwya"];
  }

  const aiActors = actors
    .filter((actor) => ["ai-orchestrator", "chief", "ai-specialist"].includes(actor.assigneeType))
    .map((actor) => actor.id);

  if (taskDomain === "frontend") {
    return [...new Set([...aiActors, "rohan"])];
  }

  if (taskDomain === "backend") {
    return [...new Set([...aiActors, "roy"])];
  }

  if (executionMode !== "standard") {
    return ["brendan"];
  }

  return aiActors;
}

function statusLabel(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function systemScopeLabel(value: string) {
  if (value === "aries-app") return "Aries app";
  if (value === "mission-control") return "Mission Control";
  if (value === "openclaw") return "OpenClaw";
  if (value === "operations") return "Operations";
  if (value === "knowledge") return "Knowledge";
  if (value === "runtime") return "Runtime";
  return statusLabel(value);
}

function domainLabel(value: string) {
  if (value === "runtime-automation") return "Runtime & automation";
  if (value === "operations-knowledge") return "Operations & knowledge";
  if (value === "manual-ops") return "Manual ops";
  if (value === "openclaw-change") return "OpenClaw change";
  return statusLabel(value);
}

function staleLabel(task: ProjectBoardTask) {
  return task.stale ? `Stale ${task.staleDays}d` : "Fresh";
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
  if (!actor) return "Unknown owner";
  if (["ai-orchestrator", "chief", "ai-specialist"].includes(actor.assigneeType)) return "AI-owned";
  if (actor.assigneeType === "human-collaborator") return "Human-owned";
  if (actor.assigneeType === "human-authority") return "Brendan-only";
  return actor.assigneeType;
}

function executionModeLabel(value: ProjectBoardExecutionMode) {
  if (value === "brendan-only") return "Brendan-only";
  if (value === "proposal-for-brendan-review") return "Proposal for Brendan review";
  return "Standard";
}

export function ProjectBoardSection({ payload, onReload }: Props) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [actorId, setActorId] = useState(DEFAULT_ACTOR_ID);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState>(() => defaultEditorState(DEFAULT_ACTOR_ID));
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQuickView, setActiveQuickView] = useState<string>("all");

  const selectedTask = useMemo(
    () => payload.tasks.find((task) => task.id === selectedTaskId) || null,
    [payload.tasks, selectedTaskId],
  );

  useEffect(() => {
    if (selectedTask && !creating) {
      setEditorState(toEditorState(selectedTask));
    }
  }, [creating, selectedTask]);

  const visibleTasks = useMemo(() => sortByStatus(payload.tasks.filter((task) => filterTask(task, filters))), [filters, payload.tasks]);

  const groupedTasks = useMemo(
    () =>
      payload.statusFlow.map((status) => ({
        ...status,
        tasks: visibleTasks.filter((task) => task.status === status.id),
      })),
    [payload.statusFlow, visibleTasks],
  );

  const summary = useMemo(
    () => ({
      total: payload.tasks.length,
      blocked: payload.tasks.filter((task) => task.blocked).length,
      stale: payload.tasks.filter((task) => task.stale).length,
      p0: payload.tasks.filter((task) => task.priority === "P0").length,
    }),
    [payload.tasks],
  );

  const availableAssigneeIds = useMemo(
    () => allowedAssigneeIdsForDraft(editorState.taskDomain, editorState.systemScope, editorState.executionMode, payload.assignees),
    [editorState.executionMode, editorState.systemScope, editorState.taskDomain, payload.assignees],
  );

  const assigneeOptions = useMemo(
    () => payload.assignees.filter((actor) => availableAssigneeIds.includes(actor.id)),
    [availableAssigneeIds, payload.assignees],
  );

  useEffect(() => {
    if (!assigneeOptions.length) return;
    if (!availableAssigneeIds.includes(editorState.assigneeId)) {
      setEditorState((current) => ({ ...current, assigneeId: assigneeOptions[0].id }));
    }
  }, [assigneeOptions, availableAssigneeIds, editorState.assigneeId]);

  const selectedActor = payload.actors.find((actor) => actor.id === actorId) || null;
  const actorById = useMemo(() => new Map(payload.actors.map((actor) => [actor.id, actor])), [payload.actors]);

  const assigneeStats = useMemo(
    () =>
      payload.assignees
        .map((actor) => {
          const tasks = payload.tasks.filter((task) => task.assigneeId === actor.id);
          const shipped = tasks.filter((task) => task.status === "shipped").length;
          return {
            actor,
            total: tasks.length,
            shipped,
            blocked: tasks.filter((task) => task.blocked).length,
            completionRate: tasks.length ? Math.round((shipped / tasks.length) * 100) : 0,
          };
        })
        .filter((entry) => entry.total > 0)
        .sort((left, right) => right.total - left.total || left.actor.label.localeCompare(right.actor.label)),
    [payload.assignees, payload.tasks],
  );

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

  const resetEditor = (nextTask: ProjectBoardTask | null = null) => {
    if (nextTask) {
      setSelectedTaskId(nextTask.id);
      setCreating(false);
      setEditorState(toEditorState(nextTask));
      return;
    }
    setSelectedTaskId(null);
    setCreating(false);
    setEditorState(defaultEditorState(DEFAULT_ACTOR_ID));
  };

  const openCreate = () => {
    setCreating(true);
    setSelectedTaskId(null);
    setError(null);
    setEditorState(defaultEditorState(DEFAULT_ACTOR_ID));
  };

  const openEdit = (task: ProjectBoardTask) => {
    setCreating(false);
    setSelectedTaskId(task.id);
    setError(null);
    setEditorState(toEditorState(task));
  };

  const applyField = <K extends keyof EditorState>(field: K, value: EditorState[K]) => {
    setEditorState((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const input = taskToInput(editorState);
      if (creating) {
        const created = await api.createProjectBoardTask(actorId, input, editorState.note.trim() || undefined);
        await onReload();
        openEdit(created);
      } else if (selectedTask) {
        const updates: ProjectBoardTaskPatch = input;
        const updated = await api.updateProjectBoardTask(selectedTask.id, actorId, updates, editorState.note.trim() || undefined);
        await onReload();
        openEdit(updated);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel page-stack">
      <div className="section-split">
        <div>
          <p className="eyebrow">Project board</p>
          <h3>Single operational source of truth</h3>
          <p className="muted">
            Assignees resolve from <code>{payload.source.orgChartPath}</code>. Task state lives in <code>{payload.source.path}</code> and is protected by routing rules for Mission Control and OpenClaw.
          </p>
        </div>
        <div className="stats-grid compact-stats board-summary-grid">
          <div className="stat-card">
            <span>Total</span>
            <strong>{summary.total}</strong>
          </div>
          <div className="stat-card warning">
            <span>Blocked</span>
            <strong>{summary.blocked}</strong>
          </div>
          <div className="stat-card danger">
            <span>Stale 5d+</span>
            <strong>{summary.stale}</strong>
          </div>
          <div className="stat-card success">
            <span>P0</span>
            <strong>{summary.p0}</strong>
          </div>
        </div>
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

        <div className="board-toolbar-row">
          <label>
            Acting as
            <select value={actorId} onChange={(event) => setActorId(event.target.value)}>
              {payload.actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.label}
                </option>
              ))}
            </select>
          </label>

          <div className="view-toggle-group">
            <button type="button" className={`tab-button ${viewMode === "board" ? "is-active" : ""}`} onClick={() => setViewMode("board")}>
              Board
            </button>
            <button type="button" className={`tab-button ${viewMode === "list" ? "is-active" : ""}`} onClick={() => setViewMode("list")}>
              List
            </button>
          </div>

          <button type="button" className="secondary-button" onClick={openCreate}>
            New task
          </button>
        </div>

        <div className="filters-grid board-filters-grid">
          <label>
            Assignee
            <select value={filters.assigneeId} onChange={(event) => setFilters((current) => ({ ...current, assigneeId: event.target.value }))}>
              <option value="all">All</option>
              {payload.filterOptions.assignees.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="all">All</option>
              {payload.filterOptions.statuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}>
              <option value="all">All</option>
              {payload.filterOptions.priorities.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Workstream
            <select value={filters.workstream} onChange={(event) => setFilters((current) => ({ ...current, workstream: event.target.value }))}>
              <option value="all">All</option>
              {payload.filterOptions.workstreams.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            System scope
            <select value={filters.systemScope} onChange={(event) => setFilters((current) => ({ ...current, systemScope: event.target.value }))}>
              <option value="all">All</option>
              {payload.filterOptions.systemScopes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Task domain
            <select value={filters.taskDomain} onChange={(event) => setFilters((current) => ({ ...current, taskDomain: event.target.value }))}>
              <option value="all">All</option>
              {payload.filterOptions.taskDomains.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-filter">
            <input
              checked={filters.blockedOnly}
              onChange={(event) => setFilters((current) => ({ ...current, blockedOnly: event.target.checked }))}
              type="checkbox"
            />
            Blocked only
          </label>
          <label className="checkbox-filter">
            <input
              checked={filters.staleOnly}
              onChange={(event) => setFilters((current) => ({ ...current, staleOnly: event.target.checked }))}
              type="checkbox"
            />
            Stale only
          </label>
        </div>

        <div className="board-assignee-stats-row">
          {assigneeStats.length ? (
            assigneeStats.map((entry) => (
              <article key={entry.actor.id} className={`board-assignee-stat ${actorTone(entry.actor)}`}>
                <div className="section-split">
                  <a className="board-assignee-link" href={orgMemberHref(entry.actor.id)}>
                    <span className="assignee-emoji">{entry.actor.emoji}</span>
                    <span>{entry.actor.displayName.replace(`${entry.actor.emoji} `, "")}</span>
                  </a>
                  <span className="badge neutral">{ownershipLabel(entry.actor)}</span>
                </div>
                <div className="board-progress-track">
                  <div className="board-progress-fill" style={{ width: `${entry.completionRate}%` }} />
                </div>
                <p className="cell-note">Completion {entry.completionRate}% • {entry.shipped}/{entry.total} shipped • {entry.blocked} blocked</p>
              </article>
            ))
          ) : (
            <div className="empty-state compact">
              <p className="muted">No per-assignee board stats are available yet.</p>
            </div>
          )}
        </div>
      </div>

      <div className="board-editor-layout">
        <div className="board-surface-stack">
          {viewMode === "board" ? (
            <div className="status-board-grid">
              {groupedTasks.map((column) => (
                <section className="status-column" key={column.id}>
                  <div className="section-split">
                    <div>
                      <p className="eyebrow">{column.label}</p>
                      <h3>{column.tasks.length} task{column.tasks.length === 1 ? "" : "s"}</h3>
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
                                <strong>{task.title}</strong>
                                <span className={`badge priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                              </div>
                              <p className="cell-note">{task.description}</p>
                              <div className="badge-row">
                                <span className="badge neutral">{ownershipLabel(taskActor)}</span>
                                <span className="badge neutral">{systemScopeLabel(task.systemScope)}</span>
                                <span className="badge neutral">{domainLabel(task.taskDomain)}</span>
                                {task.executionMode !== "standard" ? <span className="badge status-unavailable">{executionModeLabel(task.executionMode)}</span> : null}
                                {task.blocked ? <span className="badge status-blocked">Blocked</span> : null}
                                <span className={`badge ${task.stale ? "status-failed" : "status-connected"}`}>{staleLabel(task)}</span>
                              </div>
                              <div className="task-card-meta">
                                <span>Updated {formatDate(task.updatedAt)}</span>
                                <span>{task.workstream}</span>
                              </div>
                              {task.nextAction ? <p className="task-card-next">Next: {task.nextAction}</p> : null}
                            </button>
                            <div className="task-card-footer">
                              <a className="board-assignee-link" href={orgMemberHref(task.assigneeId)}>
                                <span className="assignee-emoji">{taskActor?.emoji || "•"}</span>
                                <span>{task.assigneeDisplayName}</span>
                              </a>
                              <span className="cell-note">{taskActor?.department || "Department unavailable"}</span>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <div className="empty-state compact task-column-empty">
                        <p className="muted">No tasks in this lane.</p>
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
                        <th>Domain</th>
                        <th>Updated</th>
                        <th>Blocker</th>
                        <th>Next action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTasks.map((task) => {
                        const taskActor = actorById.get(task.assigneeId) || null;
                        return (
                          <tr key={task.id} className={`${task.stale ? "row-stale" : ""} ${actorTone(taskActor)}`}>
                            <td data-label="Task">
                              <strong>{task.title}</strong>
                              <p className="cell-note">{task.description}</p>
                              <div className="ref-row">
                                <code>{task.workstream}</code>
                                {task.sourceRefs.slice(0, 2).map((ref) => (
                                  <code key={ref}>{ref}</code>
                                ))}
                                {task.executionMode !== "standard" ? <code>{executionModeLabel(task.executionMode)}</code> : null}
                              </div>
                              <button type="button" className="secondary-button board-inline-open-button" onClick={() => openEdit(task)}>
                                Open task
                              </button>
                            </td>
                            <td data-label="Assignee">
                              <div className="table-stack-cell">
                                <a className="board-assignee-link" href={orgMemberHref(task.assigneeId)}>
                                  <span className="assignee-emoji">{taskActor?.emoji || "•"}</span>
                                  <span>{task.assigneeDisplayName}</span>
                                </a>
                                <span className="muted">{ownershipLabel(taskActor)}</span>
                              </div>
                            </td>
                            <td data-label="Status">
                              <span className={`badge status-${task.status}`}>{statusLabel(task.status)}</span>
                            </td>
                            <td data-label="Priority">
                              <span className={`badge priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                            </td>
                            <td data-label="Scope">{systemScopeLabel(task.systemScope)}</td>
                            <td data-label="Domain">{domainLabel(task.taskDomain)}</td>
                            <td data-label="Updated">
                              <div className="table-stack-cell">
                                <span>{formatDate(task.updatedAt)}</span>
                                <span className={task.stale ? "status-failed" : "muted"}>{staleLabel(task)}</span>
                              </div>
                            </td>
                            <td data-label="Blocker">
                              {task.blocked ? <span className="badge status-blocked">{task.blockerReason || "Blocked"}</span> : <span className="muted">Clear</span>}
                            </td>
                            <td data-label="Next action">{task.nextAction || <span className="muted">None</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state compact">
                  <h3>No tasks match the current filters</h3>
                  <p className="muted">Try another assignee, scope, or stale filter.</p>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="panel board-editor-panel">
          <div className="section-split">
            <div>
              <p className="eyebrow">{creating ? "Create task" : selectedTask ? "Edit task" : "Board editor"}</p>
              <h3>{creating ? "New board task" : selectedTask ? selectedTask.title : "Select a task or create a new one"}</h3>
            </div>
            {!creating && selectedTask ? (
              <button type="button" className="secondary-button" onClick={() => resetEditor()}>
                Close
              </button>
            ) : null}
          </div>

          {selectedActor ? <p className="muted">Updates will be recorded as {selectedActor.displayName}.</p> : null}
          {error ? <div className="warning-block"><strong>Board validation</strong><p className="muted">{error}</p></div> : null}

          {(creating || selectedTask) ? (
            <div className="board-editor-form">
              <div className="filters-grid board-editor-grid">
                <label>
                  Title
                  <input value={editorState.title} onChange={(event) => applyField("title", event.target.value)} type="text" />
                </label>
                <label>
                  Assignee
                  <select value={editorState.assigneeId} onChange={(event) => applyField("assigneeId", event.target.value)}>
                    {assigneeOptions.map((actor) => (
                      <option key={actor.id} value={actor.id}>
                        {actor.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select value={editorState.status} onChange={(event) => applyField("status", event.target.value as ProjectBoardStatus)}>
                    {payload.statusFlow.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select value={editorState.priority} onChange={(event) => applyField("priority", event.target.value as ProjectBoardPriority)}>
                    {payload.filterOptions.priorities.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  System scope
                  <select value={editorState.systemScope} onChange={(event) => applyField("systemScope", event.target.value as ProjectBoardSystemScope)}>
                    {payload.filterOptions.systemScopes.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Task domain
                  <select value={editorState.taskDomain} onChange={(event) => applyField("taskDomain", event.target.value as ProjectBoardTaskDomain)}>
                    {payload.filterOptions.taskDomains.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Execution mode
                  <select value={editorState.executionMode} onChange={(event) => applyField("executionMode", event.target.value as ProjectBoardExecutionMode)}>
                    <option value="standard">Standard</option>
                    <option value="brendan-only">Brendan-only</option>
                    <option value="proposal-for-brendan-review">Proposal for Brendan review</option>
                  </select>
                </label>
                <label>
                  Workstream
                  <input value={editorState.workstream} onChange={(event) => applyField("workstream", event.target.value)} type="text" />
                </label>
                <label>
                  Due date
                  <input value={editorState.dueDate} onChange={(event) => applyField("dueDate", event.target.value)} placeholder="2026-04-12" type="text" />
                </label>
                <label>
                  Deliverable link
                  <input value={editorState.deliverableLink} onChange={(event) => applyField("deliverableLink", event.target.value)} type="text" />
                </label>
                <label className="checkbox-filter">
                  <input checked={editorState.blocked} onChange={(event) => applyField("blocked", event.target.checked)} type="checkbox" />
                  Blocked
                </label>
                <label>
                  Blocker reason
                  <input value={editorState.blockerReason} onChange={(event) => applyField("blockerReason", event.target.value)} type="text" />
                </label>
              </div>

              <label>
                Description
                <textarea className="planner-textarea board-textarea" value={editorState.description} onChange={(event) => applyField("description", event.target.value)} />
              </label>
              <label>
                Next action
                <textarea className="planner-textarea board-textarea short" value={editorState.nextAction} onChange={(event) => applyField("nextAction", event.target.value)} />
              </label>
              <label>
                Dependencies (one per line)
                <textarea className="planner-textarea board-textarea short" value={editorState.dependenciesText} onChange={(event) => applyField("dependenciesText", event.target.value)} />
              </label>
              <label>
                Source refs (one per line)
                <textarea className="planner-textarea board-textarea short" value={editorState.sourceRefsText} onChange={(event) => applyField("sourceRefsText", event.target.value)} />
              </label>
              <label>
                Note to append on save
                <textarea className="planner-textarea board-textarea short" value={editorState.note} onChange={(event) => applyField("note", event.target.value)} />
              </label>

              <div className="warning-block compact-note-block">
                <strong>Routing rule</strong>
                <p className="muted">
                  {selectedTask?.routingRule ||
                    (editorState.systemScope === "mission-control"
                      ? "Mission Control is AI-only."
                      : editorState.systemScope === "openclaw"
                        ? "OpenClaw work must stay Brendan-only or Proposal for Brendan review."
                        : editorState.taskDomain === "manual-ops"
                          ? "Manual / non-coding work routes to Somwya only."
                          : "Assignee options are constrained by task domain and protected-system rules.")}
                </p>
                <div className="ref-row">
                  {assigneeOptions.map((actor) => (
                    <code key={actor.id}>{actor.displayName}</code>
                  ))}
                </div>
              </div>

              <div className="section-split">
                <button type="button" className="secondary-button" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : creating ? "Create task" : "Save changes"}
                </button>
                <button type="button" className="secondary-button" onClick={() => resetEditor()}>
                  Reset
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state compact board-editor-empty">
              <p className="muted">Select a task from the board or create a new one to edit status, assignee, notes, blockers, and handoff detail.</p>
            </div>
          )}

          {selectedTask ? (
            <div className="board-history-stack">
              <div>
                <p className="eyebrow">Status history</p>
                {selectedTask.statusHistory.length ? (
                  <ul className="history-list">
                    {selectedTask.statusHistory.slice().reverse().map((entry) => (
                      <li key={`${entry.timestamp}-${entry.toStatus}`}>
                        <strong>{entry.actorDisplayName}</strong>
                        <span>
                          {entry.fromStatus ? `${statusLabel(entry.fromStatus)} → ` : ""}
                          {statusLabel(entry.toStatus)}
                        </span>
                        <span className="muted">{formatDate(entry.timestamp)}</span>
                        {entry.note ? <p className="cell-note">{entry.note}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No logged transitions yet.</p>
                )}
              </div>
              <div>
                <p className="eyebrow">Notes</p>
                {selectedTask.notes.length ? (
                  <ul className="history-list">
                    {selectedTask.notes.slice().reverse().map((note) => (
                      <li key={note.id}>
                        <strong>{note.actorDisplayName}</strong>
                        <span className="muted">{formatDate(note.createdAt)}</span>
                        <p className="cell-note">{note.body}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No notes yet.</p>
                )}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
