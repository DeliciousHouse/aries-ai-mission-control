import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "../lib/format";
import { orgMemberHref } from "../lib/orgLinks";
import type {
  CommandPayload,
  ProjectBoardActor,
  ProjectBoardExecutionMode,
  ProjectBoardForceActionEntry,
  ProjectBoardPriority,
  ProjectBoardStatus,
  ProjectBoardStatusHistoryEntry,
  ProjectBoardSystemScope,
  ProjectBoardTask,
  ProjectBoardTaskDomain,
} from "../types";

export type EditorState = {
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

const DEFAULT_ACTOR_ID = "jarvis";

export function defaultEditorState(assigneeId = DEFAULT_ACTOR_ID): EditorState {
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

export function toEditorState(task: ProjectBoardTask): EditorState {
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
  return value.split("\n").map((entry) => entry.trim()).filter(Boolean);
}

export function taskToInput(state: EditorState) {
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

type DrawerTab = "details" | "history" | "notes";

type Props = {
  task: ProjectBoardTask | null;
  creating: boolean;
  actors: ProjectBoardActor[];
  assignees: ProjectBoardActor[];
  statusFlow: Array<{ id: ProjectBoardStatus; label: string }>;
  filterOptions: CommandPayload["filterOptions"];
  actorId: string;
  onSave: (editorState: EditorState, forceAction?: boolean, forceReason?: string) => Promise<void>;
  onClose: () => void;
  saving: boolean;
  error: string | null;
};

function statusLabel(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function allowedAssigneeIdsForDraft(
  taskDomain: ProjectBoardTaskDomain,
  systemScope: ProjectBoardSystemScope,
  executionMode: ProjectBoardExecutionMode,
  actors: ProjectBoardActor[],
) {
  if (taskDomain === "openclaw-change" || systemScope === "openclaw") {return ["brendan"];}
  if (taskDomain === "manual-ops") {return ["somwya"];}
  const aiActors = actors
    .filter((actor) => ["ai-orchestrator", "chief", "ai-specialist"].includes(actor.assigneeType))
    .map((actor) => actor.id);
  if (taskDomain === "frontend") {return [...new Set([...aiActors, "rohan"])];}
  if (taskDomain === "backend") {return [...new Set([...aiActors, "roy"])];}
  if (executionMode !== "standard") {return ["brendan"];}
  return aiActors;
}

export function TaskDrawer({ task, creating, actors, assignees, statusFlow, filterOptions, actorId, onSave, onClose, saving, error }: Props) {
  const isOpen = creating || task !== null;
  const [tab, setTab] = useState<DrawerTab>("details");
  const [editor, setEditor] = useState<EditorState>(() => task ? toEditorState(task) : defaultEditorState());
  const [forceExpanded, setForceExpanded] = useState(false);
  const [forceReason, setForceReason] = useState("");

  useEffect(() => {
    if (task && !creating) {
      setEditor(toEditorState(task));
      setForceExpanded(false);
      setForceReason("");
    } else if (creating) {
      setEditor(defaultEditorState());
      setForceExpanded(false);
      setForceReason("");
    }
  }, [task, creating]);

  useEffect(() => {
    if (!isOpen) {return;}
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {onClose();}
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const applyField = useCallback(<K extends keyof EditorState>(field: K, value: EditorState[K]) => {
    setEditor((current) => ({ ...current, [field]: value }));
  }, []);

  const availableAssigneeIds = useMemo(
    () => allowedAssigneeIdsForDraft(editor.taskDomain, editor.systemScope, editor.executionMode, assignees),
    [editor.executionMode, editor.systemScope, editor.taskDomain, assignees],
  );

  const assigneeOptions = useMemo(
    () => assignees.filter((actor) => availableAssigneeIds.includes(actor.id)),
    [availableAssigneeIds, assignees],
  );

  useEffect(() => {
    if (!assigneeOptions.length) {return;}
    if (!availableAssigneeIds.includes(editor.assigneeId)) {
      setEditor((current) => ({ ...current, assigneeId: assigneeOptions[0].id }));
    }
  }, [assigneeOptions, availableAssigneeIds, editor.assigneeId]);

  const handleQuickAction = useCallback(async (updates: Partial<EditorState>, actionNote: string) => {
    const merged = { ...editor, ...updates, note: actionNote };
    await onSave(merged);
  }, [editor, onSave]);

  const handleSave = useCallback(async () => {
    if (forceExpanded && forceReason.trim()) {
      await onSave(editor, true, forceReason.trim());
    } else {
      await onSave(editor);
    }
  }, [editor, forceExpanded, forceReason, onSave]);

  const quickActions = useMemo(() => {
    if (creating || !task) {return [];}
    const actions: Array<{ label: string; cls: string; updates: Partial<EditorState>; note: string }> = [];
    const s = task.status;

    if (["intake", "scoping", "ready"].includes(s)) {
      actions.push({ label: "Start", cls: "action-start", updates: { status: "active" }, note: "Started task" });
    }
    if (["intake", "scoping"].includes(s)) {
      actions.push({ label: "Ready", cls: "action-ready", updates: { status: "ready" }, note: "Moved to ready" });
    }
    if (s === "active") {
      actions.push({ label: "Review", cls: "action-review", updates: { status: "review" }, note: "Moved to review" });
    }
    if (s === "review") {
      actions.push({ label: "Ship", cls: "action-ship", updates: { status: "shipped" }, note: "Shipped" });
    }
    if (["shipped", "follow-up"].includes(s)) {
      actions.push({ label: "Reopen", cls: "action-reopen", updates: { status: "active" }, note: "Reopened task" });
    }
    if (!task.blocked) {
      actions.push({ label: "Block", cls: "action-block", updates: { blocked: true }, note: "Blocked" });
    } else {
      actions.push({ label: "Unblock", cls: "action-unblock", updates: { blocked: false, blockerReason: "" }, note: "Unblocked" });
    }
    return actions;
  }, [creating, task]);

  const actorById = useMemo(() => new Map(actors.map((actor) => [actor.id, actor])), [actors]);

  return (
    <>
      <div className={`task-drawer-overlay ${isOpen ? "is-open" : ""}`} onClick={onClose} role="presentation" />
      <aside className={`task-drawer ${isOpen ? "is-open" : ""}`} role="dialog" aria-label={creating ? "Create task" : task?.title || "Task details"}>
        <div className="task-drawer-header">
          <div className="section-split" style={{ alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <p className="eyebrow">{creating ? "New task" : task ? statusLabel(task.status) : "Task"}</p>
              <h3 style={{ margin: "4px 0 0", fontSize: "1.1rem" }}>{creating ? "Create task" : task?.title || "Select a task"}</h3>
            </div>
            <button type="button" className="task-drawer-close" onClick={onClose} aria-label="Close drawer">{"\u2715"}</button>
          </div>
          {task && !creating ? (
            <div className="badge-row" style={{ gap: "6px" }}>
              <span className={`badge priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
              <span className={`badge status-${task.status}`}>{statusLabel(task.status)}</span>
              {task.blocked ? <span className="badge status-blocked">Blocked</span> : null}
              {task.stale ? <span className="badge status-failed">Stale {task.staleDays}d</span> : null}
            </div>
          ) : null}
        </div>

        {quickActions.length > 0 ? (
          <div className="task-drawer-quick-actions">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={`quick-action-btn ${action.cls}`}
                disabled={saving}
                onClick={() => handleQuickAction(action.updates, action.note)}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="task-drawer-tabs">
          {(["details", "history", "notes"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`drawer-tab ${tab === t ? "is-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "details" ? "Details" : t === "history" ? `History${task ? ` (${task.statusHistory.length})` : ""}` : `Notes${task ? ` (${task.notes.length})` : ""}`}
            </button>
          ))}
        </div>

        <div className="task-drawer-body">
          {error ? <div className="warning-block"><strong>Validation error</strong><p className="muted">{error}</p></div> : null}

          {tab === "details" ? (
            <DetailsTab
              editor={editor}
              applyField={applyField}
              assigneeOptions={assigneeOptions}
              statusFlow={statusFlow}
              filterOptions={filterOptions}
              creating={creating}
              saving={saving}
              task={task}
              onSave={handleSave}
              onReset={() => setEditor(task ? toEditorState(task) : defaultEditorState())}
            />
          ) : tab === "history" ? (
            <HistoryTab task={task} actorById={actorById} />
          ) : (
            <NotesTab task={task} actorById={actorById} editor={editor} applyField={applyField} />
          )}

          {!creating && task ? (
            <div className={`force-override-section ${forceExpanded ? "is-expanded" : ""}`}>
              <button type="button" className="force-override-toggle" onClick={() => setForceExpanded((v) => !v)}>
                <span>Force override</span>
                <span className="chevron">{"\u25BC"}</span>
              </button>
              <div className="force-override-body">
                <div className="warning-block" style={{ marginBottom: "12px" }}>
                  <p className="muted" style={{ margin: 0, fontSize: "0.84rem" }}>
                    Force actions bypass routing rules and are permanently recorded in the audit trail.
                  </p>
                </div>
                <label style={{ display: "grid", gap: "5px", color: "var(--muted)", fontSize: "0.84rem" }}>
                  Reason (required for force actions)
                  <input
                    className="force-reason-input"
                    type="text"
                    value={forceReason}
                    onChange={(event) => setForceReason(event.target.value)}
                    placeholder="Why is this override needed?"
                  />
                </label>
                <div className="force-override-actions" style={{ marginTop: "10px" }}>
                  <button
                    type="button"
                    className="force-action-btn"
                    disabled={!forceReason.trim() || saving}
                    onClick={handleSave}
                  >
                    Force save current changes
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function DetailsTab({
  editor,
  applyField,
  assigneeOptions,
  statusFlow,
  filterOptions,
  creating,
  saving,
  task,
  onSave,
  onReset,
}: {
  editor: EditorState;
  applyField: <K extends keyof EditorState>(field: K, value: EditorState[K]) => void;
  assigneeOptions: ProjectBoardActor[];
  statusFlow: Array<{ id: ProjectBoardStatus; label: string }>;
  filterOptions: CommandPayload["filterOptions"];
  creating: boolean;
  saving: boolean;
  task: ProjectBoardTask | null;
  onSave: () => Promise<void>;
  onReset: () => void;
}) {
  return (
    <div className="task-drawer-section">
      <div className="drawer-form-grid">
        <label className="full-width">
          Title
          <input value={editor.title} onChange={(event) => applyField("title", event.target.value)} type="text" />
        </label>
        <label>
          Assignee
          <select value={editor.assigneeId} onChange={(event) => applyField("assigneeId", event.target.value)}>
            {assigneeOptions.map((actor) => (
              <option key={actor.id} value={actor.id}>{actor.label}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={editor.status} onChange={(event) => applyField("status", event.target.value as ProjectBoardStatus)}>
            {statusFlow.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={editor.priority} onChange={(event) => applyField("priority", event.target.value as ProjectBoardPriority)}>
            {filterOptions.priorities.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label>
          System scope
          <select value={editor.systemScope} onChange={(event) => applyField("systemScope", event.target.value as ProjectBoardSystemScope)}>
            {filterOptions.systemScopes.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label>
          Task domain
          <select value={editor.taskDomain} onChange={(event) => applyField("taskDomain", event.target.value as ProjectBoardTaskDomain)}>
            {filterOptions.taskDomains.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label>
          Execution mode
          <select value={editor.executionMode} onChange={(event) => applyField("executionMode", event.target.value as ProjectBoardExecutionMode)}>
            <option value="standard">Standard</option>
            <option value="brendan-only">Brendan-only</option>
            <option value="proposal-for-brendan-review">Proposal for Brendan review</option>
          </select>
        </label>
        <label>
          Workstream
          <input value={editor.workstream} onChange={(event) => applyField("workstream", event.target.value)} type="text" />
        </label>
        <label>
          Due date
          <input value={editor.dueDate} onChange={(event) => applyField("dueDate", event.target.value)} placeholder="2026-04-12" type="text" />
        </label>
        <label>
          Deliverable link
          <input value={editor.deliverableLink} onChange={(event) => applyField("deliverableLink", event.target.value)} type="text" />
        </label>
        <label className="checkbox-filter">
          <input checked={editor.blocked} onChange={(event) => applyField("blocked", event.target.checked)} type="checkbox" />
          Blocked
        </label>
        {editor.blocked ? (
          <label>
            Blocker reason
            <input value={editor.blockerReason} onChange={(event) => applyField("blockerReason", event.target.value)} type="text" />
          </label>
        ) : null}
      </div>

      <label style={{ display: "grid", gap: "5px", color: "var(--muted)", fontSize: "0.84rem" }}>
        Description
        <textarea className="drawer-textarea" value={editor.description} onChange={(event) => applyField("description", event.target.value)} />
      </label>
      <label style={{ display: "grid", gap: "5px", color: "var(--muted)", fontSize: "0.84rem" }}>
        Next action
        <textarea className="drawer-textarea short" value={editor.nextAction} onChange={(event) => applyField("nextAction", event.target.value)} />
      </label>
      <label style={{ display: "grid", gap: "5px", color: "var(--muted)", fontSize: "0.84rem" }}>
        Note to append on save
        <textarea className="drawer-textarea short" value={editor.note} onChange={(event) => applyField("note", event.target.value)} placeholder="Optional note recorded with this change" />
      </label>

      {task?.routingRule ? (
        <div className="warning-block compact-note-block" style={{ marginBottom: 0 }}>
          <strong style={{ fontSize: "0.82rem" }}>Routing rule</strong>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.82rem" }}>{task.routingRule}</p>
        </div>
      ) : null}

      <div className="drawer-save-row">
        <button type="button" className="drawer-save-btn" onClick={onSave} disabled={saving}>
          {saving ? "Saving\u2026" : creating ? "Create task" : "Save changes"}
        </button>
        <button type="button" className="drawer-reset-btn" onClick={onReset}>Reset</button>
      </div>
    </div>
  );
}

function HistoryTab({ task, actorById }: { task: ProjectBoardTask | null; actorById: Map<string, ProjectBoardActor> }) {
  if (!task) {return <p className="muted">No task selected.</p>;}

  const forceHistory: ProjectBoardForceActionEntry[] = task.forcedActionHistory ?? [];

  type TimelineItem =
    | { type: "status"; entry: ProjectBoardStatusHistoryEntry; ts: string }
    | { type: "force"; entry: ProjectBoardForceActionEntry; ts: string };

  const allEntries: TimelineItem[] = [
    ...task.statusHistory.map((entry) => ({ type: "status" as const, entry, ts: entry.timestamp })),
    ...forceHistory.map((entry) => ({ type: "force" as const, entry, ts: entry.timestamp })),
  ].toSorted((a, b) => (Date.parse(b.ts) || 0) - (Date.parse(a.ts) || 0));

  if (!allEntries.length) {
    return <p className="muted">No status changes recorded yet.</p>;
  }

  return (
    <div className="timeline-stack">
      {allEntries.map((item, index) => {
        if (item.type === "status") {
          const entry = item.entry;
          return (
            <div className="timeline-entry" key={`status-${entry.timestamp}-${index}`}>
              <div className="timeline-entry-header">
                <span className="timeline-actor">{entry.actorDisplayName}</span>
                <span className="timeline-date">{formatDate(entry.timestamp)}</span>
              </div>
              <div className="timeline-transition">
                {entry.fromStatus ? (
                  <>
                    <span className={`badge status-${entry.fromStatus}`}>{statusLabel(entry.fromStatus)}</span>
                    <span className="arrow">{"\u2192"}</span>
                  </>
                ) : null}
                <span className={`badge status-${entry.toStatus}`}>{statusLabel(entry.toStatus)}</span>
              </div>
              {entry.note ? <p className="timeline-detail">{entry.note}</p> : null}
            </div>
          );
        }
        const entry = item.entry;
        return (
          <div className="timeline-entry is-force" key={`force-${entry.id}-${index}`}>
            <div className="timeline-entry-header">
              <span className="timeline-actor">{entry.actorDisplayName}</span>
              <span className="badge status-failed">Force</span>
              <span className="timeline-date">{formatDate(entry.timestamp)}</span>
            </div>
            <p className="timeline-detail">
              <strong>{entry.action}</strong>
              {entry.fromValue ? `: ${entry.fromValue} \u2192 ${entry.toValue}` : null}
            </p>
            <p className="timeline-detail">{entry.reason}</p>
          </div>
        );
      })}
    </div>
  );
}

function NotesTab({
  task,
  actorById,
  editor,
  applyField,
}: {
  task: ProjectBoardTask | null;
  actorById: Map<string, ProjectBoardActor>;
  editor: EditorState;
  applyField: <K extends keyof EditorState>(field: K, value: EditorState[K]) => void;
}) {
  if (!task) {return <p className="muted">No task selected.</p>;}

  return (
    <div className="task-drawer-section">
      <label style={{ display: "grid", gap: "5px", color: "var(--muted)", fontSize: "0.84rem" }}>
        Add a note (saved with next update)
        <textarea
          className="drawer-textarea short"
          value={editor.note}
          onChange={(event) => applyField("note", event.target.value)}
          placeholder="Write a note, decision, or blocker detail\u2026"
        />
      </label>

      {task.notes.length > 0 ? (
        <div className="timeline-stack">
          {task.notes.slice().toReversed().map((note, index) => (
            <div className="timeline-entry" key={`note-${note.id}-${index}`}>
              <div className="timeline-entry-header">
                <span className="timeline-actor">{note.actorDisplayName}</span>
                <span className="timeline-date">{formatDate(note.createdAt)}</span>
              </div>
              <p className="timeline-detail">{note.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No notes yet. Add one above and save changes to record it.</p>
      )}
    </div>
  );
}
