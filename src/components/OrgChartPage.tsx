import { useEffect, useMemo, useState } from "react";
import {
  noteTemplates,
  opsPlaceholders,
  roleTemplates,
  worksheetSections,
} from "../lib/orgDesign";
import type { OrgDepartment, OrgNode, OrgPlannerNotes } from "../types";

const WORKSPACE_STORAGE_KEY = "aries.mission-control.org-chart.episode-3.v1";

const topOrchestrator: OrgNode = {
  id: "jarvis-mission-control",
  name: "Jarvis",
  title: "Mission Control",
  responsibility: "Owns decomposition, routing, blocker visibility, synthesis, and bounded direct execution when that is the fastest honest path to shipping aries-app.",
  actorType: "AI",
  executionMode: "Coordination",
};

const departments: OrgDepartment[] = [
  {
    id: "engineering-delivery",
    name: "Engineering Delivery",
    summary: "Ships aries-app through explicit frontend/backend lanes plus bounded direct execution from Jarvis where helpful.",
    accent: "ops",
    head: {
      id: "jarvis-builder",
      name: "Jarvis",
      title: "Builder / Direct Implementation",
      responsibility: "Picks up bounded implementation work directly when it reduces ambiguity or keeps the delivery loop moving.",
      actorType: "AI",
      executionMode: "Direct Execution",
    },
    specialists: [
      {
        id: "rohan-frontend",
        name: "Rohan",
        title: "Frontend Owner",
        responsibility: "Owns UI, layout, client-side behavior, and frontend integration surfaces.",
        actorType: "Human",
        executionMode: "Direct Execution",
      },
      {
        id: "roy-backend",
        name: "Roy",
        title: "Backend Owner",
        responsibility: "Owns APIs, backend logic, integrations, workflows, and data correctness.",
        actorType: "Human",
        executionMode: "Direct Execution",
      },
      {
        id: "tbd-release-readiness",
        name: "TBD",
        title: "Release Readiness / QA",
        responsibility: "Covers cross-surface verification, handoff proof, and release checks when the org is ready for a dedicated seat.",
        actorType: "TBD",
        executionMode: "Direct Execution",
      },
    ],
  },
  {
    id: "runtime-automation",
    name: "Runtime & Automation",
    summary: "Keeps OpenClaw observability, scheduler integrity, and flow health visible enough to trust operationally.",
    accent: "brain",
    head: {
      id: "tbd-runtime-lead",
      name: "TBD",
      title: "Runtime & Automation Lead",
      responsibility: "Owns the operating loop around runtime truth, cron failures, flow oversight, and model/provider visibility.",
      actorType: "TBD",
      executionMode: "Coordination",
    },
    specialists: [
      {
        id: "jarvis-runtime",
        name: "Jarvis",
        title: "Runtime Visibility Steward",
        responsibility: "Keeps live state truthful and calls out missing wiring rather than smoothing it over.",
        actorType: "AI",
        executionMode: "Coordination",
      },
      {
        id: "tbd-cron-monitor",
        name: "TBD",
        title: "Cron / Scheduler Monitor",
        responsibility: "Owns recurring job integrity, failure detection, and drift cleanup.",
        actorType: "TBD",
        executionMode: "Coordination",
      },
      {
        id: "tbd-flow-steward",
        name: "TBD",
        title: "Lobster / Flow Steward",
        responsibility: "Tracks long-running workflows, repair loops, and automation ownership.",
        actorType: "TBD",
        executionMode: "Direct Execution",
      },
    ],
  },
  {
    id: "operations-knowledge",
    name: "Operations & Knowledge",
    summary: "Holds the human-required checks, note hygiene, and planning continuity that stop execution from stalling.",
    accent: "lab",
    head: {
      id: "somwya-human-ops",
      name: "Somwya",
      title: "Human Ops / Manual Execution",
      responsibility: "Owns manual verification, account checks, and other non-coding work that cannot be truthfully automated away.",
      actorType: "Human",
      executionMode: "Manual",
    },
    specialists: [
      {
        id: "tbd-briefing-steward",
        name: "TBD",
        title: "Briefing / Knowledge Steward",
        responsibility: "Compresses notes, decisions, and operating context into something usable during execution.",
        actorType: "TBD",
        executionMode: "Coordination",
      },
      {
        id: "tbd-handoff-verifier",
        name: "TBD",
        title: "QA / Handoff Validator",
        responsibility: "Confirms work is actually ready for the next owner before anyone calls it done.",
        actorType: "TBD",
        executionMode: "Manual",
      },
      {
        id: "tbd-approval-followthrough",
        name: "TBD",
        title: "Approval / Follow-through",
        responsibility: "Makes sure manual approvals and human-only dependencies do not disappear between sessions.",
        actorType: "TBD",
        executionMode: "Manual",
      },
    ],
  },
];

const defaultNotes: OrgPlannerNotes = {
  agentIdeas: "",
  missingRoles: "",
  repetitiveTasks: "",
  humanVsAgent: "",
  modelGaps: "",
};

const docPaths = [
  "docs/plans/episode-3-org-role-template.md",
  "docs/plans/episode-3-org-design-decision-template.md",
  "docs/plans/episode-3-role-boundary-template.md",
  "docs/plans/episode-3-delegation-tradeoff-template.md",
  "docs/plans/episode-3-command-ops-registers.md",
  "docs/plans/episode-3-workload-worksheet.md",
];

type WorkspaceState = {
  notes: OrgPlannerNotes;
  worksheet: Record<string, string>;
};

function buildDefaultWorksheet() {
  return Object.fromEntries(worksheetSections.map((section) => [section.id, ""]));
}

export function OrgChartPage() {
  const [notes, setNotes] = useState<OrgPlannerNotes>(defaultNotes);
  const [worksheet, setWorksheet] = useState<Record<string, string>>(buildDefaultWorksheet());
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (!raw) {
        setIsHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
      setNotes({
        agentIdeas: parsed.notes?.agentIdeas ?? "",
        missingRoles: parsed.notes?.missingRoles ?? "",
        repetitiveTasks: parsed.notes?.repetitiveTasks ?? "",
        humanVsAgent: parsed.notes?.humanVsAgent ?? "",
        modelGaps: parsed.notes?.modelGaps ?? "",
      });
      setWorksheet({ ...buildDefaultWorksheet(), ...(parsed.worksheet ?? {}) });
    } catch {
      setNotes(defaultNotes);
      setWorksheet(buildDefaultWorksheet());
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const payload: WorkspaceState = { notes, worksheet };
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(payload));
  }, [isHydrated, notes, worksheet]);

  const summary = useMemo(() => {
    const allNodes = [topOrchestrator, ...departments.flatMap((department) => [department.head, ...department.specialists])];
    const filled = allNodes.filter((node) => node.name !== "TBD").length;
    const tbd = allNodes.filter((node) => node.name === "TBD").length;
    const directExecution = allNodes.filter((node) => node.executionMode === "Direct Execution").length;
    const automatedFriendly = roleTemplates.filter((template) => template.seatType === "AI" || template.seatType === "Hybrid").length;

    return {
      totalSeats: allNodes.length,
      filled,
      tbd,
      directExecution,
      automatedFriendly,
    };
  }, []);

  function updateNote(field: keyof OrgPlannerNotes, value: string) {
    setNotes((current) => ({ ...current, [field]: value }));
  }

  function updateWorksheet(id: string, value: string) {
    setWorksheet((current) => ({ ...current, [id]: value }));
  }

  function resetWorkspace() {
    setNotes(defaultNotes);
    setWorksheet(buildDefaultWorksheet());
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  }

  return (
    <section className="page-stack">
      <header className="page-header panel org-page-header">
        <div>
          <p className="eyebrow">Episode 3</p>
          <h2>Org design workspace for internal engineering execution</h2>
          <p className="muted">
            Built for shipping <code>aries-app</code>, operating OpenClaw Mission Control, and deciding what Jarvis should execute directly versus delegate.
          </p>
        </div>
        <div className="stats-grid compact-stats">
          <div className="stat-card">
            <span>Seats mapped</span>
            <strong>{summary.totalSeats}</strong>
          </div>
          <div className="stat-card success">
            <span>Known roles</span>
            <strong>{summary.filled}</strong>
          </div>
          <div className="stat-card warning">
            <span>TBD seats</span>
            <strong>{summary.tbd}</strong>
          </div>
          <div className="stat-card">
            <span>AI / hybrid templates</span>
            <strong>{summary.automatedFriendly}</strong>
          </div>
        </div>
      </header>

      <section className="panel org-governance-panel">
        <div className="section-split">
          <div>
            <p className="eyebrow">Authority + use</p>
            <h3>Brendan stays above the org design workspace</h3>
            <p className="muted">
              This package is for internal execution planning only. It helps you decide how work should flow across Brendan, Jarvis, Rohan, Roy, Somwya, and any future specialist seats.
            </p>
          </div>
          <div className="decision-maker-badge">
            <strong>Brendan</strong>
            <span>Final decision-maker / Head of Software Engineering</span>
          </div>
        </div>
      </section>

      <div className="org-main-grid">
        <section className="panel org-chart-panel">
          <div className="section-split">
            <div>
              <p className="eyebrow">Current operating model</p>
              <h3>Mission Control + execution starter map</h3>
              <p className="muted">A practical starting point, not decorative org art.</p>
            </div>
            <span className="badge neutral">Internal only</span>
          </div>

          <div className="org-chart-canvas">
            <div className="org-top-node accent-brain">
              <OrgNodeCard node={topOrchestrator} />
            </div>
            <div className="org-top-connector" />
            <div className="org-department-grid">
              {departments.map((department) => (
                <DepartmentColumn department={department} key={department.id} />
              ))}
            </div>
          </div>
        </section>

        <section className="panel worksheet-panel">
          <p className="eyebrow">Package footprint</p>
          <h3>Where the Episode 3 tools now live</h3>
          <div className="surface-map-grid">
            <article className="list-card">
              <strong>Org Chart</strong>
              <p className="cell-note">Role templates, worksheet prompts, direct-vs-delegate notes, and the internal operating map.</p>
            </article>
            <article className="list-card">
              <strong>Briefing</strong>
              <p className="cell-note">Reusable note templates plus real markdown docs under <code>docs/plans</code> for org decisions and tradeoffs.</p>
            </article>
            <article className="list-card">
              <strong>Command</strong>
              <p className="cell-note">Coverage matrix, workload gaps, handoff risk, ownership ambiguity, and Jarvis / human boundary placeholders.</p>
            </article>
          </div>

          <div className="doc-path-list">
            {docPaths.map((docPath) => (
              <code key={docPath}>{docPath}</code>
            ))}
          </div>
        </section>
      </div>

      <section className="panel page-stack">
        <div className="section-split">
          <div>
            <p className="eyebrow">Role templates</p>
            <h3>Starter seats for real Mission Control operations</h3>
            <p className="muted">Every template is grounded in internal engineering delivery, runtime truth, manual verification, or knowledge stewardship.</p>
          </div>
          <span className="badge neutral">Template library</span>
        </div>

        <div className="role-template-grid">
          {roleTemplates.map((template) => (
            <article className="list-card role-template-card" key={template.id}>
              <div className="section-split">
                <div>
                  <strong>{template.roleTitle}</strong>
                  <p className="cell-note">{template.department}</p>
                </div>
                <div className="badge-row">
                  <span className="badge neutral">{template.seatType}</span>
                  <span className="badge neutral">{template.currentOwner}</span>
                </div>
              </div>

              <p>{template.coreResponsibility}</p>

              <div className="template-metadata-grid">
                <MetadataBlock label="Owned outcomes" items={template.ownedOutcomes} />
                <MetadataBlock label="Owned workflows" items={template.ownedWorkflows} />
                <MetadataBlock label="KPIs / success" items={template.kpis} />
                <MetadataBlock label="Inputs" items={template.handoffInputs} />
                <MetadataBlock label="Outputs" items={template.handoffOutputs} />
                <MetadataBlock label="Tooling" items={template.tooling} />
                <MetadataBlock label="Remain human" items={template.remainHuman} />
                <MetadataBlock label="Automate later" items={template.automateLater} />
              </div>

              <div className="placeholder-example role-template-footer">
                <div className="placeholder-example-row">
                  <span>Direct vs coordination ratio</span>
                  <strong>{template.executionRatio}</strong>
                </div>
                <div className="placeholder-example-row">
                  <span>Escalation path</span>
                  <strong>{template.escalationPath}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel page-stack">
        <div className="section-split">
          <div>
            <p className="eyebrow">Briefing note structures</p>
            <h3>Templates for org decisions and role-boundary tradeoffs</h3>
            <p className="muted">The same structures also appear in the Briefing surface so planning can live with the rest of your operating context.</p>
          </div>
          <span className="badge neutral">Markdown + UI</span>
        </div>

        <div className="template-grid">
          {noteTemplates.map((template) => (
            <article className="list-card template-card" key={template.id}>
              <div className="section-split">
                <strong>{template.title}</strong>
                <span className="badge neutral">Decision note</span>
              </div>
              <p>{template.purpose}</p>
              <p className="cell-note">Example prompt: {template.exampleTitle}</p>
              <ul className="inline-list with-spacing">
                {template.fields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="panel planner-panel">
        <div className="section-split">
          <div>
            <p className="eyebrow">Practical worksheet</p>
            <h3>Map current workload to future seats</h3>
            <p className="muted">Local browser persistence only. Use this to think through what should stay with Brendan, what Jarvis should absorb, and what future seats are justified.</p>
          </div>
          <button className="secondary-button" type="button" onClick={resetWorkspace}>
            Reset workspace
          </button>
        </div>

        <div className="planner-grid worksheet-grid">
          {worksheetSections.map((section) => (
            <label className="planner-field" key={section.id}>
              <div>
                <h3>{section.title}</h3>
                <p className="muted">{section.prompt}</p>
              </div>
              <ul className="inline-list">
                {section.starterBullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <textarea
                className="planner-textarea"
                value={worksheet[section.id] ?? ""}
                onChange={(event) => updateWorksheet(section.id, event.target.value)}
                placeholder="Capture real current workload, ownership drift, candidate specialists, and what should stay human."
                rows={7}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="panel planner-panel">
        <div className="section-split">
          <div>
            <p className="eyebrow">Jarvis boundary notes</p>
            <h3>Direct execution vs delegation scratchpad</h3>
          </div>
          <span className="badge neutral">Local only</span>
        </div>

        <div className="planner-grid">
          <PlannerField
            title="Agent ideas"
            prompt="Which future AI roles would most reduce operational drag around aries-app and Mission Control?"
            value={notes.agentIdeas}
            onChange={(value) => updateNote("agentIdeas", value)}
            placeholder="Examples: runtime visibility steward, cron monitor, QA verifier, briefing steward…"
          />
          <PlannerField
            title="Missing roles"
            prompt="Which responsibilities still feel uncovered if the goal is clean delivery and truthful runtime visibility?"
            value={notes.missingRoles}
            onChange={(value) => updateNote("missingRoles", value)}
            placeholder="Examples: release readiness, handoff validation, approval follow-through…"
          />
          <PlannerField
            title="Repetitive tasks worth automation"
            prompt="Which repeating tasks are predictable enough that they suggest an AI-owned seat or automation path?"
            value={notes.repetitiveTasks}
            onChange={(value) => updateNote("repetitiveTasks", value)}
            placeholder="Examples: cron audits, runtime source checks, note compression, handoff reminders…"
          />
          <PlannerField
            title="What stays human vs agent-owned"
            prompt="Where do you want a hard line between human authority and agent execution?"
            value={notes.humanVsAgent}
            onChange={(value) => updateNote("humanVsAgent", value)}
            placeholder="Examples: approvals stay human, bounded code fixes can go to Jarvis, dashboard checks stay human…"
          />
          <PlannerField
            title="Operating model gaps"
            prompt="What still feels fuzzy, overloaded, or likely to create ownership drift?"
            value={notes.modelGaps}
            onChange={(value) => updateNote("modelGaps", value)}
            placeholder="Examples: cross-surface QA ownership, runtime truth verification, Jarvis capacity split…"
          />
        </div>
      </section>

      <section className="panel page-stack">
        <div className="section-split">
          <div>
            <p className="eyebrow">Command / Ops preview</p>
            <h3>Registers now mirrored in Command</h3>
            <p className="muted">These are the same simple placeholders surfaced in Command so org risk is visible next to execution work.</p>
          </div>
          <span className="badge neutral">8 placeholders</span>
        </div>

        <div className="placeholder-grid">
          {opsPlaceholders.slice(0, 4).map((placeholder) => (
            <article className="list-card placeholder-card" key={placeholder.id}>
              <strong>{placeholder.title}</strong>
              <p className="cell-note">{placeholder.purpose}</p>
              <div className="placeholder-columns">
                {placeholder.columns.map((column) => (
                  <code key={column}>{column}</code>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function DepartmentColumn({ department }: { department: OrgDepartment }) {
  return (
    <article className={`department-card accent-${department.accent}`}>
      <div className="department-connector" />
      <div className="department-frame">
        <p className="eyebrow">{department.name}</p>
        <p className="muted">{department.summary}</p>

        <div className="org-column-section">
          <p className="org-section-label">Department head</p>
          <OrgNodeCard node={department.head} />
        </div>

        <div className="org-column-section">
          <p className="org-section-label">Starter specialists</p>
          <div className="org-specialist-stack">
            {department.specialists.map((node) => (
              <OrgNodeCard key={node.id} node={node} compact />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function OrgNodeCard({ node, compact = false }: { node: OrgNode; compact?: boolean }) {
  const statusClass = node.name === "TBD" ? "is-tbd" : "is-filled";

  return (
    <article className={`org-node-card ${compact ? "is-compact" : ""} ${statusClass}`}>
      <div className="section-split org-node-heading">
        <div>
          <strong>{node.name}</strong>
          <p className="cell-note">{node.title}</p>
        </div>
        <div className="badge-row org-node-badges">
          <span className={`badge entity-${node.actorType.toLowerCase()}`}>{node.actorType}</span>
          <span className={`badge mode-${node.executionMode.toLowerCase().replace(/\s+/g, "-")}`}>{node.executionMode}</span>
        </div>
      </div>
      <p className="org-node-responsibility">{node.responsibility}</p>
    </article>
  );
}

function PlannerField({
  title,
  prompt,
  value,
  onChange,
  placeholder,
}: {
  title: string;
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="planner-field">
      <div>
        <h3>{title}</h3>
        <p className="muted">{prompt}</p>
      </div>
      <textarea
        className="planner-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={6}
      />
    </label>
  );
}

function MetadataBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="metadata-block">
      <span>{label}</span>
      <ul className="inline-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
