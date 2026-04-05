export type SeatType = "AI" | "Human" | "Hybrid" | "TBD";

export type RoleTemplate = {
  id: string;
  roleTitle: string;
  seatType: SeatType;
  department: string;
  coreResponsibility: string;
  ownedOutcomes: string[];
  ownedWorkflows: string[];
  executionRatio: string;
  kpis: string[];
  handoffInputs: string[];
  handoffOutputs: string[];
  escalationPath: string;
  tooling: string[];
  remainHuman: string[];
  automateLater: string[];
  currentOwner: string;
};

export type NoteTemplate = {
  id: string;
  title: string;
  purpose: string;
  fields: string[];
  exampleTitle: string;
};

export type OpsPlaceholder = {
  id: string;
  title: string;
  surface: string;
  purpose: string;
  columns: string[];
  exampleRow: string[];
};

export type WorksheetSection = {
  id: string;
  title: string;
  prompt: string;
  starterBullets: string[];
};

export const roleTemplates: RoleTemplate[] = [
  {
    id: "frontend-owner",
    roleTitle: "Frontend Owner",
    seatType: "Human",
    department: "Engineering Delivery",
    coreResponsibility: "Own the Mission Control shell, module interfaces, layout behavior, and frontend integration surfaces for shipping aries-app.",
    ownedOutcomes: [
      "Dashboard surfaces remain usable and responsive across screen sizes.",
      "Frontend implementation lands without UI drift or broken handoffs.",
      "Release-ready interfaces stay stable under real runtime states.",
    ],
    ownedWorkflows: [
      "Mission Control dashboard hardening",
      "Episode planning surface implementation",
      "Frontend ↔ backend integration validation",
    ],
    executionRatio: "80% direct execution / 20% coordination",
    kpis: [
      "Responsive regressions closed before release",
      "Frontend blockers surfaced with exact dependency",
      "UI handoffs accepted without ambiguity",
    ],
    handoffInputs: ["Approved scope", "API contracts", "Runtime truth requirements"],
    handoffOutputs: ["Shippable UI", "QA notes", "Known edge cases"],
    escalationPath: "Jarvis first, Brendan for scope or priority changes.",
    tooling: ["Mission Control repo", "aries-app", "browser QA", "design system tokens"],
    remainHuman: ["Final UX judgment on dense surfaces", "Tradeoff calls when space is constrained"],
    automateLater: ["Responsive smoke snapshots", "Route-level QA checklists"],
    currentOwner: "Rohan",
  },
  {
    id: "backend-owner",
    roleTitle: "Backend Owner",
    seatType: "Human",
    department: "Engineering Delivery",
    coreResponsibility: "Own APIs, runtime adapters, data contracts, and workflow orchestration behind Aries delivery and Mission Control.",
    ownedOutcomes: [
      "Runtime views stay truthful to live OpenClaw sources.",
      "Backend integrations remain stable under real execution load.",
      "Workflow and data adapters fail loudly instead of fabricating state.",
    ],
    ownedWorkflows: [
      "Runtime adapter maintenance",
      "OpenClaw integration plumbing",
      "Workflow / API contract enforcement",
    ],
    executionRatio: "75% direct execution / 25% coordination",
    kpis: [
      "No fake telemetry shipped",
      "Broken runtime adapters diagnosed with exact failure reason",
      "Backend regressions surfaced before deploy handoff",
    ],
    handoffInputs: ["Product intent", "Frontend integration expectations", "Observed runtime failures"],
    handoffOutputs: ["Stable API/data layer", "Failure context", "Validation notes"],
    escalationPath: "Jarvis first, Brendan for high-risk production tradeoffs.",
    tooling: ["OpenClaw CLI", "repo workflows", "logs", "runtime adapters"],
    remainHuman: ["Infra-risk decisions", "Auth / credential changes"],
    automateLater: ["Adapter contract checks", "Failure classification summaries"],
    currentOwner: "Roy",
  },
  {
    id: "runtime-visibility-steward",
    roleTitle: "Runtime Visibility Steward",
    seatType: "AI",
    department: "Runtime & Automation",
    coreResponsibility: "Keep sessions, tasks, cron, flows, health, and model usage visible in Mission Control with exact source labeling.",
    ownedOutcomes: [
      "Runtime page stays readable at every supported width.",
      "Disconnected or unavailable states remain explicit.",
      "Source badges and failure context stay visible during incidents.",
    ],
    ownedWorkflows: [
      "Runtime source audits",
      "Telemetry surface QA",
      "Truth-state regression checks",
    ],
    executionRatio: "55% direct execution / 45% coordination",
    kpis: [
      "Runtime widgets never imply connectivity they do not have",
      "Failed probes show exact error context",
      "Screen-size changes do not hide failure states",
    ],
    handoffInputs: ["Live command output", "Runtime page bugs", "Operator questions"],
    handoffOutputs: ["Visible source state", "Wiring-gap notes", "Repair recommendations"],
    escalationPath: "Jarvis direct, Brendan if reliability tradeoff changes scope.",
    tooling: ["OpenClaw session/task/cron/health commands", "Mission Control runtime module"],
    remainHuman: ["Final judgment on acceptable operational risk"],
    automateLater: ["Probe-diff alerts", "Runtime layout verification at fixed breakpoints"],
    currentOwner: "Jarvis",
  },
  {
    id: "cron-monitor",
    roleTitle: "Cron / Scheduler Monitor",
    seatType: "AI",
    department: "Runtime & Automation",
    coreResponsibility: "Track recurring job health, schedule drift, delivery configuration, and chronic failure loops before they become invisible.",
    ownedOutcomes: [
      "Cron jobs reflect the real repo-owned automation structure.",
      "Broken jobs fail with actionable next steps.",
      "Placeholder recipients and stale job designs are removed quickly.",
    ],
    ownedWorkflows: [
      "Cron job audits",
      "Failure triage",
      "Schedule / payload alignment checks",
    ],
    executionRatio: "65% direct execution / 35% coordination",
    kpis: [
      "Consecutive failure loops do not linger unnoticed",
      "Scheduler config matches repo manifest",
      "Delivery configuration is explicit and valid",
    ],
    handoffInputs: ["Cron list", "Run history", "Automation manifest"],
    handoffOutputs: ["Clean scheduler state", "Escalations", "Repair notes"],
    escalationPath: "Jarvis first, Brendan for new recurring jobs or scope changes.",
    tooling: ["openclaw cron", "automation scripts", "Mission Control Runtime page"],
    remainHuman: ["Approving new recurring operational coverage"],
    automateLater: ["Failure trend summaries", "Runbook generation"],
    currentOwner: "Jarvis",
  },
  {
    id: "briefing-knowledge-steward",
    roleTitle: "Briefing / Knowledge Steward",
    seatType: "Hybrid",
    department: "Operations & Knowledge",
    coreResponsibility: "Keep briefs, decisions, planning notes, and org-design tradeoffs compressed enough to help shipping rather than creating more reading.",
    ownedOutcomes: [
      "Briefing feed contains current planning context and reusable templates.",
      "Decision history is easy to scan when Episode work resumes.",
      "Knowledge artifacts stay operational rather than decorative.",
    ],
    ownedWorkflows: [
      "Daily brief upkeep",
      "Org-design note hygiene",
      "Decision / handoff compression",
    ],
    executionRatio: "40% direct execution / 60% coordination",
    kpis: [
      "Briefs reduce follow-up questions",
      "Planning templates are discoverable in the dashboard",
      "Open loops are documented with owner and next step",
    ],
    handoffInputs: ["Project changes", "Decisions", "Blockers"],
    handoffOutputs: ["Concise briefs", "Decision notes", "Reusable templates"],
    escalationPath: "Jarvis first, Brendan when priorities or wording change meaningfully.",
    tooling: ["Briefing feed", "docs/plans", "memory", "daily brief automation"],
    remainHuman: ["Final strategic framing", "Sensitive people/role decisions"],
    automateLater: ["Heading extraction", "note indexing", "follow-up reminders"],
    currentOwner: "Jarvis + Brendan",
  },
  {
    id: "manual-verification-coordinator",
    roleTitle: "Manual Verification Coordinator",
    seatType: "Human",
    department: "Operations & Knowledge",
    coreResponsibility: "Close the human-only checks that still block shipping, runtime verification, release readiness, and account-level validation.",
    ownedOutcomes: [
      "Manual dependencies do not vanish between coding pushes.",
      "QA evidence exists for human-required checks.",
      "Release handoffs include explicit confirmation, not implied completion.",
    ],
    ownedWorkflows: [
      "Manual QA",
      "Dashboard / account verification",
      "Release checklist completion",
    ],
    executionRatio: "70% direct execution / 30% coordination",
    kpis: [
      "Manual blockers are named with owner and evidence",
      "Launch checklists are completed before release claims",
      "Human-only steps are visible in Command surfaces",
    ],
    handoffInputs: ["QA requests", "Manual checklists", "Unverified external state"],
    handoffOutputs: ["Evidence of completion", "Escalations", "Remaining blockers"],
    escalationPath: "Jarvis for coordination, Brendan for approvals or priority changes.",
    tooling: ["Dashboards", "checklists", "Mission Control Command + Briefing"],
    remainHuman: ["Account/dashboard access", "External approval steps"],
    automateLater: ["Checklist packaging", "follow-up reminders"],
    currentOwner: "Somwya",
  },
];

export const noteTemplates: NoteTemplate[] = [
  {
    id: "org-design-decision",
    title: "Org design decision",
    purpose: "Capture a concrete team-architecture decision without losing the tradeoff logic.",
    fields: ["Context", "Decision", "Alternatives considered", "Tradeoffs", "Current risk", "Follow-up", "Date / owner"],
    exampleTitle: "Should Runtime Visibility Steward exist as a dedicated seat?",
  },
  {
    id: "role-boundary-decision",
    title: "Role boundary decision",
    purpose: "Clarify where Jarvis, Brendan, Rohan, Roy, and Somwya should stop and hand off.",
    fields: ["Context", "Decision", "Boundary line", "Tradeoffs", "Current risk", "Follow-up", "Date / owner"],
    exampleTitle: "What stays with Brendan vs what Jarvis should absorb by default",
  },
  {
    id: "jarvis-execution-boundary",
    title: "Jarvis direct-execution boundary",
    purpose: "Define what Jarvis should build directly versus route to a human owner.",
    fields: ["Context", "Decision", "Direct execution lane", "Delegation lane", "Risk", "Follow-up", "Date / owner"],
    exampleTitle: "When Jarvis should patch Mission Control directly vs create a handoff",
  },
  {
    id: "delegation-tradeoff",
    title: "Delegation tradeoff",
    purpose: "Record cases where routing work outward might help or hurt shipping speed.",
    fields: ["Context", "Decision", "Alternatives considered", "Tradeoffs", "Current risk", "Follow-up", "Date / owner"],
    exampleTitle: "Should responsive hardening stay with Jarvis or route to Rohan?",
  },
  {
    id: "coverage-gap",
    title: "Coverage gap",
    purpose: "Document meaningful holes in team coverage before they become recurring blockers.",
    fields: ["Context", "Gap", "Impact", "Alternatives considered", "Current risk", "Follow-up", "Date / owner"],
    exampleTitle: "No dedicated owner for cross-surface QA and release readiness",
  },
  {
    id: "role-existence-check",
    title: "Should this role exist at all?",
    purpose: "Pressure-test whether a future seat is justified or just a label for vague discomfort.",
    fields: ["Context", "Decision", "Alternatives considered", "Tradeoffs", "Current risk", "Follow-up", "Date / owner"],
    exampleTitle: "Do we actually need a separate Cron Monitor seat yet?",
  },
];

export const opsPlaceholders: OpsPlaceholder[] = [
  {
    id: "role-coverage-matrix",
    title: "Role coverage matrix",
    surface: "Command",
    purpose: "See which internal execution lanes are truly covered versus assumed.",
    columns: ["Function", "Current owner", "Coverage state", "Evidence", "Next move"],
    exampleRow: ["Runtime page reliability", "Jarvis + Roy", "Partial", "Runtime adapters live; narrow-width QA still needed", "Add release-level QA owner"],
  },
  {
    id: "current-workload-coverage",
    title: "Current workload coverage",
    surface: "Command",
    purpose: "Track where active work is concentrated so overload becomes visible early.",
    columns: ["Work bucket", "Primary owner", "Backup", "Load signal", "Risk"],
    exampleRow: ["Mission Control responsive hardening", "Jarvis", "Rohan", "High", "Frontend throughput bottleneck if more Episode 3 scope lands too early"],
  },
  {
    id: "capacity-gap-register",
    title: "Capacity gap register",
    surface: "Command",
    purpose: "Keep a running list of work that matters but has no realistic owner bandwidth.",
    columns: ["Gap", "Why it matters", "Current impact", "Candidate seat", "Decision needed"],
    exampleRow: ["Release-readiness QA coverage", "Prevents fake done states", "Medium", "QA / handoff validation", "When to formalize the seat"],
  },
  {
    id: "handoff-risk-register",
    title: "Handoff risk register",
    surface: "Command",
    purpose: "Make risky cross-owner seams explicit before they cause churn.",
    columns: ["Handoff", "Risk", "Current owner", "Failure mode", "Mitigation"],
    exampleRow: ["Frontend ↔ backend runtime adapters", "High", "Rohan / Roy", "UI claims connected state while adapter is broken", "Require live-source proof before release"],
  },
  {
    id: "ownership-ambiguity-register",
    title: "Ownership ambiguity register",
    surface: "Command",
    purpose: "Capture work that keeps floating between owners without a stable home.",
    columns: ["Work item", "Why ambiguous", "Interim owner", "Impact", "Resolution path"],
    exampleRow: ["Cross-surface verification", "Touches UI, runtime, and manual QA", "Jarvis", "Delayed closure", "Define QA / handoff seat or explicit rotation"],
  },
  {
    id: "work-landing-on-brendan",
    title: "Work that keeps landing on Brendan",
    surface: "Command",
    purpose: "Identify decision and execution load that should not stay centralized forever.",
    columns: ["Work", "Why Brendan still owns it", "Can delegate?", "Candidate owner", "Blocker"],
    exampleRow: ["Final release readiness judgment", "No dedicated QA / release steward yet", "Partially", "TBD release-readiness seat", "Need trusted verification loop"],
  },
  {
    id: "jarvis-absorb-register",
    title: "Work Jarvis should probably absorb",
    surface: "Command",
    purpose: "Track repeatable work that should move into Jarvis default ownership.",
    columns: ["Work", "Why it fits Jarvis", "Guardrail", "Current gain", "Open question"],
    exampleRow: ["Cron structure audits", "Bounded, repetitive, evidence-driven", "No destructive changes without approval", "Fewer silent failures", "How much auto-repair is acceptable?"],
  },
  {
    id: "stay-human-register",
    title: "Work that still must stay human",
    surface: "Command",
    purpose: "Protect critical human-only decisions and checks from accidental automation creep.",
    columns: ["Work", "Why human", "Owner", "Evidence required", "Review cadence"],
    exampleRow: ["External account verification", "Requires human access / judgment", "Somwya", "Screenshot or explicit confirmation", "Per release or incident"],
  },
];

export const worksheetSections: WorksheetSection[] = [
  {
    id: "brendan-current-load",
    title: "What Brendan still personally owns today",
    prompt: "List decisions, reviews, or operational loops that are still landing on Brendan by default.",
    starterBullets: [
      "Release readiness calls for aries-app",
      "High-risk tradeoffs that change scope or reliability",
      "Approvals that no current seat can close confidently",
    ],
  },
  {
    id: "jarvis-direct-execution",
    title: "What Jarvis should execute directly",
    prompt: "Capture bounded work that moves faster when Jarvis does it instead of routing it out.",
    starterBullets: [
      "Mission Control responsive hardening",
      "Cron audits and scheduler cleanup",
      "Runtime adapter truth-state verification",
    ],
  },
  {
    id: "frontend-lane",
    title: "What should go to Rohan",
    prompt: "Separate clean frontend ownership from cross-functional noise.",
    starterBullets: [
      "Component and layout work",
      "Interaction refinements",
      "Frontend integration surfaces once contracts are stable",
    ],
  },
  {
    id: "backend-lane",
    title: "What should go to Roy",
    prompt: "Call out backend and runtime adapter work that needs a true backend owner.",
    starterBullets: [
      "API and adapter fixes",
      "Workflow/backend orchestration",
      "Data correctness and reliability issues",
    ],
  },
  {
    id: "manual-lane",
    title: "What should go to Somwya",
    prompt: "List human-required validation or operations work that should never masquerade as automated completion.",
    starterBullets: [
      "Manual dashboard/account checks",
      "Human-only QA confirmation",
      "External approval follow-through",
    ],
  },
  {
    id: "future-specialists",
    title: "What repeated work suggests a future specialist seat",
    prompt: "Use patterns, not vibes. Only nominate seats where repeated work and risk justify them.",
    starterBullets: [
      "Runtime visibility",
      "Cron / scheduler monitoring",
      "Lobster / flow oversight",
      "Model / provider visibility",
      "Briefing / knowledge stewardship",
      "QA / handoff validation",
      "Release readiness",
    ],
  },
];
