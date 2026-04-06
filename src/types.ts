export type RouteId = "org-chart" | "command" | "knowledge" | "build-lab" | "runtime";

export type ConnectionState = "loading" | "connected" | "disconnected" | "empty" | "error";

export type ApiEnvelope<T> = {
  generatedAt: string;
  data: T;
};

export type SelectOption = {
  label: string;
  value: string;
};

export type ProjectBoardAssigneeType =
  | "human-authority"
  | "ai-orchestrator"
  | "chief"
  | "ai-specialist"
  | "human-collaborator";

export type ProjectBoardActorType = ProjectBoardAssigneeType | "system";
export type ProjectBoardStatus = "intake" | "scoping" | "ready" | "active" | "review" | "shipped" | "follow-up";
export type ProjectBoardPriority = "P0" | "P1" | "P2" | "P3";
export type ProjectBoardSystemScope = "aries-app" | "mission-control" | "openclaw" | "operations" | "knowledge" | "runtime";
export type ProjectBoardTaskDomain =
  | "frontend"
  | "backend"
  | "runtime-automation"
  | "operations-knowledge"
  | "manual-ops"
  | "mission-control"
  | "openclaw-change";
export type ProjectBoardExecutionMode = "standard" | "brendan-only" | "proposal-for-brendan-review";

export type ProjectBoardActorRef = {
  actorId: string;
  actorDisplayName: string;
  actorType: ProjectBoardActorType;
};

export type ProjectBoardNote = {
  id: string;
  body: string;
  createdAt: string;
  actorId: string;
  actorDisplayName: string;
};

export type ProjectBoardStatusHistoryEntry = {
  timestamp: string;
  actorId: string;
  actorDisplayName: string;
  fromStatus: ProjectBoardStatus | null;
  toStatus: ProjectBoardStatus;
  note?: string | null;
};

export type ProjectBoardActor = {
  id: string;
  label: string;
  displayName: string;
  emoji: string;
  assigneeType: ProjectBoardAssigneeType;
  title: string | null;
  department: string | null;
  parentChiefId: string | null;
  assignable: boolean;
};

export type ProjectBoardTask = {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  assigneeType: ProjectBoardAssigneeType;
  assigneeDisplayName: string;
  status: ProjectBoardStatus;
  priority: ProjectBoardPriority;
  createdAt: string;
  updatedAt: string;
  deliverableLink: string | null;
  notes: ProjectBoardNote[];
  workstream: string;
  systemScope: ProjectBoardSystemScope;
  taskDomain: ProjectBoardTaskDomain;
  blocked: boolean;
  blockerReason: string | null;
  statusHistory: ProjectBoardStatusHistoryEntry[];
  createdBy: ProjectBoardActorRef;
  updatedBy: ProjectBoardActorRef;
  allowedAssigneeTypes: ProjectBoardAssigneeType[];
  allowedAssigneeIds: string[];
  executionMode: ProjectBoardExecutionMode;
  dependencies: string[];
  nextAction: string;
  sourceRefs: string[];
  dueDate: string | null;
  routingRule: string;
  stale: boolean;
  staleDays: number;
};

export type CommandLinkedRecord = {
  id: string;
  title: string;
  summary: string;
  updatedAt: string | null;
  status: string;
  path: string | null;
  href: string;
  sourceEndpoint: string;
};

export type CommandSchedulerSummary = {
  cutoffAt: string;
  cutoffLabel: string;
  ranSinceCutoff: number;
  stats: {
    healthy: number;
    failed: number;
    disabled: number;
    unavailable: number;
    disconnected: number;
  };
  recentJobs: Array<{
    id: string;
    name: string;
    status: CronJobHealthStatus;
    lastRun: string | null;
    nextRun: string | null;
    outputTarget: string | null;
    href: string;
  }>;
  href: string;
  sourceEndpoint: string;
};

export type CommandRuntimeSummary = {
  sessionCount: number;
  activeTaskCount: number;
  trackedTaskCount: number;
  flowCount: number;
  modelUsageCount: number;
  usageCostTotal: number | null;
  usageCostStatus: string;
  serviceIssues: Array<{
    id: string;
    label: string;
    status: string;
    detail: string;
    updatedAt: string | null;
    href: string;
  }>;
  href: string;
  sourceEndpoint: string;
};

export type CommandBuildLabSummary = {
  latestArtifact: CommandLinkedRecord | null;
  latestResearch: CommandLinkedRecord | null;
  latestPrototype: CommandLinkedRecord | null;
  latestIdea: CommandLinkedRecord | null;
};

export type CommandAttentionItem = {
  id: string;
  title: string;
  detail: string;
  tone: "danger" | "warning" | "neutral" | "success";
  href: string;
};

export type CommandLoopRecord = {
  id: string;
  producer: string;
  sourceKind: "file" | "runtime";
  sourcePath: string;
  apiEndpoints: string[];
  consumers: string[];
  state: "connected" | "unavailable";
  detail: string;
  updatedAt: string | null;
  href: string;
};

export type ProjectBoardQuickView = {
  id: string;
  label: string;
  count: number;
  filters: {
    assigneeId?: string;
    status?: ProjectBoardStatus;
    priority?: ProjectBoardPriority;
    workstream?: string;
    systemScope?: ProjectBoardSystemScope;
    taskDomain?: ProjectBoardTaskDomain;
    blocked?: boolean;
    stale?: boolean;
  };
};

export type ProjectBoardFilterOptions = {
  assignees: SelectOption[];
  statuses: SelectOption[];
  priorities: SelectOption[];
  workstreams: SelectOption[];
  systemScopes: SelectOption[];
  taskDomains: SelectOption[];
};

export type CommandPayload = {
  source: {
    kind: string;
    updatedAt: string;
    note: string;
    path: string;
    orgChartPath: string;
  };
  overview?: {
    cutoffAt: string;
    cutoffLabel: string;
    latestBrief: CommandLinkedRecord | null;
    latestKnowledgeNote: CommandLinkedRecord | null;
    scheduler: CommandSchedulerSummary;
    runtime: CommandRuntimeSummary;
    buildLab: CommandBuildLabSummary;
    attention: CommandAttentionItem[];
    loops: CommandLoopRecord[];
  };
  tasks: ProjectBoardTask[];
  assignees: ProjectBoardActor[];
  actors: ProjectBoardActor[];
  filterOptions: ProjectBoardFilterOptions;
  quickViews: ProjectBoardQuickView[];
  statusFlow: Array<{ id: ProjectBoardStatus; label: string }>;
  staleAfterDays: number;
};

export type BriefType =
  | "daily-engineering-brief"
  | "current-blockers"
  | "decisions-made"
  | "handoff-notes"
  | "bootcamp-translation"
  | "implementation-lessons"
  | "plan"
  | "system-reference"
  | "note";

export type BriefRecord = {
  id: string;
  title: string;
  type: BriefType;
  path: string;
  updatedAt: string;
  sourceGroup: string;
  summary: string;
  headings: string[];
  markdown: string;
};

export type BriefingPayload = {
  sourceRoots: string[];
  briefs: BriefRecord[];
  summary: {
    newestBriefId: string | null;
    briefCount: number;
    typeCounts: Array<{ type: BriefType; count: number }>;
  };
};

export type BuildLabOverviewTile = {
  ideas: {
    totalCount: number;
    thisWeekCount: number;
    latestTitle: string | null;
    latestState: string | null;
  };
  prototypes: {
    runningCount: number;
    totalCount: number;
    newestName: string | null;
    newestStatus: string | null;
  };
  artifacts: {
    latestStatus: string;
    latestTitle: string | null;
    latestChangedPath: string | null;
    latestUpdatedAt: string | null;
  };
  research: {
    latestDate: string | null;
    keyFindingCount: number;
    latestTopic: string | null;
    latestPath: string | null;
  };
};

export type PrototypeRegistryItem = {
  id: string;
  name: string;
  description: string;
  workstream: string;
  owner: string;
  previewUrl: string | null;
  previewPort: number | null;
  previewLabel: string | null;
  localOnly: boolean;
  status: "running" | "stopped" | "archived" | "unavailable";
  statusDetail: string;
  priorityScore: number | null;
  maturityScore: number | null;
  updatedAt: string;
  sourceRefs: string[];
  isNew: boolean;
};

export type PrototypeRegistryPayload = {
  source: {
    kind: string;
    path: string;
    updatedAt: string;
    note: string;
  };
  stats: {
    running: number;
    stopped: number;
    archived: number;
    unavailable: number;
    total: number;
  };
  items: PrototypeRegistryItem[];
};

export type IdeaBacklogItem = {
  id: string;
  title: string;
  descriptionSnippet: string;
  date: string;
  workstream: string;
  category: string;
  currentState: "candidate" | "active" | "deferred" | "promoted" | "archived";
  impactScore: number | null;
  implementationSpeed: number | null;
  technicalLeverage: number | null;
  observabilityValue: number | null;
  dependencyBurden: number | null;
  confidence: number | null;
  totalScore: number | null;
  sourceRefs: string[];
  isNew: boolean;
};

export type IdeaBacklogPayload = {
  source: {
    kind: string;
    path: string;
    updatedAt: string;
    note: string;
  };
  filters: {
    categories: string[];
    workstreams: string[];
  };
  items: IdeaBacklogItem[];
};

export type BuildArtifact = {
  id: string;
  title: string;
  path: string;
  kind: string;
  state: "available" | "empty" | "unavailable";
  updatedAt: string | null;
  fileCount: number;
  sizeLabel: string;
  latestChangedPath: string | null;
  latestChangedAt: string | null;
  recentFiles: Array<{ path: string; updatedAt: string; sizeLabel: string }>;
  summary: string;
};

export type BuildArtifactsPayload = {
  source: {
    kind: string;
    updatedAt: string;
    note: string;
  };
  items: BuildArtifact[];
};

export type ResearchRecord = {
  id: string;
  title: string;
  path: string;
  sourceGroup: string;
  topic: string;
  stage: string;
  updatedAt: string;
  sizeLabel: string;
  summary: string;
  findingCount: number | null;
  producedFiles: string[];
  viewUrl: string;
};

export type ResearchDashboardPayload = {
  source: {
    kind: string;
    updatedAt: string;
    note: string;
  };
  sourceStates: Array<{
    id: string;
    label: string;
    path: string;
    state: "connected" | "empty" | "unavailable";
    detail: string;
  }>;
  timeline: ResearchRecord[];
  summary: {
    latestDate: string | null;
    totalRecords: number;
    keyFindingCount: number;
    latestTopic: string | null;
    latestPath: string | null;
  };
};

export type BuildLabPayload = {
  source: {
    kind: string;
    updatedAt: string;
    note: string;
  };
  overview: {
    source: {
      kind: string;
      updatedAt: string;
      note: string;
    };
    tiles: BuildLabOverviewTile;
  };
  prototypes: PrototypeRegistryPayload;
  ideas: IdeaBacklogPayload;
  artifacts: BuildArtifactsPayload;
  research: ResearchDashboardPayload;
};

export type RuntimeSource = {
  id: string;
  label: string;
  command: string;
  state: ConnectionState;
  detail: string;
  checkedAt: string;
};

export type SessionRow = {
  id: string;
  sessionKey: string;
  sessionType: string;
  initiator: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  ageMinutes: number | null;
  currentState: string | null;
  model: string | null;
  provider: string | null;
  tokenTotal: number | null;
};

export type TaskRow = {
  id: string;
  label: string;
  runtime: string;
  status: string;
  agentId: string | null;
  childSessionKey: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  latestStatus: string;
  failureReason: string | null;
  model: string | null;
  provider: string | null;
};

export type FlowRow = {
  id: string;
  ownerKey: string | null;
  status: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  stage: string | null;
  relatedTaskId: string | null;
  relatedSessionKey: string | null;
};

export type CronRow = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  lastResult: string | null;
  failureReason: string | null;
  consecutiveFailures: number | null;
};

export type ModelUsageRow = {
  id: string;
  model: string;
  provider: string;
  linkedTo: string;
  linkedType: "session" | "task";
  sessionKey: string | null;
  taskId: string | null;
  updatedAt: string | null;
  tokenTotal: number | null;
  costTotal: number | null;
};

export type HealthItem = {
  id: string;
  label: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  detail: string;
  updatedAt: string | null;
};

export type RuntimePayload = {
  freshness: string;
  sources: RuntimeSource[];
  sessions: {
    state: ConnectionState;
    detail: string;
    rows: SessionRow[];
  };
  tasks: {
    state: ConnectionState;
    detail: string;
    rows: TaskRow[];
  };
  flows: {
    state: ConnectionState;
    detail: string;
    rows: FlowRow[];
  };
  cron: {
    state: ConnectionState;
    detail: string;
    rows: CronRow[];
  };
  modelUsage: {
    state: ConnectionState;
    detail: string;
    configuredDefault: string | null;
    configuredFallbacks: string[];
    rows: ModelUsageRow[];
    usageCost: {
      totalCost: number | null;
      totalTokens: number | null;
    };
  };
  health: {
    state: ConnectionState;
    detail: string;
    rows: HealthItem[];
  };
};

export type MemoryFileRecord = {
  path: string;
  sizeBytes: number;
  updatedAt: string;
  isPinned: boolean;
};

export type MemoryFilePayload = {
  files: MemoryFileRecord[];
  warnings: string[];
};

export type MemoryFileContentPayload = {
  path: string;
  content: string;
  updatedAt: string;
  sizeBytes: number;
};

export type BriefingArchiveType =
  | "brief"
  | "plan"
  | "debrief"
  | "note"
  | "system-reference"
  | "implementation-lessons"
  | "unknown";

export type BriefingDeliveryStatus = "Delivered" | "Pending" | "Unknown" | "Unavailable";

export type BriefingArchiveRecord = {
  id: string;
  title: string;
  type: BriefingArchiveType;
  path: string;
  updatedAt: string;
  preview: string;
  markdown: string;
  deliveryStatus: BriefingDeliveryStatus;
};

export type BriefingArchivePayload = {
  items: BriefingArchiveRecord[];
  warnings: string[];
};

export type StandupStatus = "complete" | "partial" | "failed";

export type StandupChiefRecord = {
  chiefId: string;
  title: string;
  status: string;
  agentId: string | null;
  preview: string;
  markdown: string;
};

export type StandupRecord = {
  id: string;
  title: string;
  date: string;
  path: string;
  updatedAt: string;
  generatedAt: string;
  status: StandupStatus;
  preview: string;
  markdown: string;
  audioPath: string | null;
  delivery: string;
  boardPath: string;
  chiefs: StandupChiefRecord[];
};

export type StandupArchivePayload = {
  items: StandupRecord[];
  warnings: string[];
  summary: {
    latestId: string | null;
    total: number;
    complete: number;
    partial: number;
    failed: number;
  };
};

export type SkillSource = "Bundled" | "Local" | "Workspace";

export type SkillReference = {
  kind: "cron" | "workflow" | "agent" | "automation" | "unknown";
  label: string;
  detail: string;
};

export type SkillCatalogRecord = {
  name: string;
  description: string;
  path: string;
  source: SkillSource;
  category: string | null;
  frontmatterParsed: boolean;
  frontmatterError: string | null;
  references: SkillReference[];
};

export type SkillCatalogPayload = {
  records: SkillCatalogRecord[];
  categories: string[];
  warnings: string[];
};

export type CronJobHealthStatus = "healthy" | "failed" | "disabled" | "unavailable" | "disconnected";

export type CronJobHealthRecord = {
  id: string;
  name: string;
  enabled: boolean;
  status: CronJobHealthStatus;
  lastRun: string | null;
  nextRun: string | null;
  lastError: string | null;
  schedule: string;
};

export type CronHealthPayload = {
  stats: {
    healthy: number;
    failed: number;
    disabled: number;
    unavailable: number;
    disconnected: number;
  };
  jobs: CronJobHealthRecord[];
  warnings: string[];
  generatedAt: string;
};

export type OrgActorType = "AI" | "Human" | "TBD";
export type OrgExecutionMode = "Direct Execution" | "Coordination" | "Manual";
export type OrgAccent = "ops" | "brain" | "lab";

export type OrgNode = {
  id: string;
  name: string;
  title: string;
  responsibility: string;
  actorType: OrgActorType;
  executionMode: OrgExecutionMode;
};

export type OrgDepartment = {
  id: string;
  name: string;
  summary: string;
  accent: OrgAccent;
  head: OrgNode;
  specialists: OrgNode[];
};

export type OrgPlannerNotes = {
  agentIdeas: string;
  missingRoles: string;
  repetitiveTasks: string;
  humanVsAgent: string;
  modelGaps: string;
};

export type OrgPresenceStatus = "online" | "offline" | "unavailable";
export type OrgMemberKind = "ai" | "human";
export type OrgActivityKind = "session" | "board" | "standup" | "human";

export type OrgActivityItem = {
  id: string;
  kind: OrgActivityKind;
  timestamp: string | null;
  detail: string;
  href: string;
  source: string;
};

export type OrgRuntimeState = {
  agentId: string | null;
  registered: boolean;
  status: OrgPresenceStatus;
  lastSeen: string | null;
  currentModel: string | null;
  modelSource: "active-session" | "configured-agent" | "default-config" | "unavailable";
  statusSource: "session-evidence" | "no-session-evidence" | "runtime-unavailable";
  detail: string;
};

export type OrgBoardLoad = {
  total: number;
  open: number;
  blocked: number;
  active: number;
  ready: number;
  review: number;
  shipped: number;
  completionRate: number | null;
  latestUpdatedAt: string | null;
};

export type OrgStandupState = {
  latestStandupId: string | null;
  latestStandupDate: string | null;
  latestStandupStatus: StandupStatus | null;
  latestChiefStatus: string | null;
  latestMention: string | null;
  latestTranscriptPath: string | null;
};

export type OrgMemberRecord = {
  id: string;
  name: string;
  title: string;
  department: string;
  emoji: string;
  memberKind: OrgMemberKind;
  isChief: boolean;
  roleSummary: string;
  runtime: OrgRuntimeState | null;
  board: OrgBoardLoad;
  standup: OrgStandupState;
  recentActivity: OrgActivityItem[];
  recentActivitySummary: string;
  humanActivitySummary: string | null;
};

export type OrgLatestStandupSummary = {
  id: string | null;
  title: string | null;
  date: string | null;
  status: StandupStatus | null;
  path: string | null;
  preview: string | null;
  respondingChiefCount: number | null;
  chiefCount: number | null;
  decisions: string[];
  delivery: string | null;
};

export type OrgPayload = {
  source: {
    orgChartPath: string;
    boardPath: string;
    standupPath: string;
    openclawConfigPath: string | null;
  };
  summary: {
    persistentAiSeats: number;
    chiefs: {
      total: number;
      online: number;
      offline: number;
      unavailable: number;
    };
    humans: number;
    openBlockerCount: number;
    lastStandupDate: string | null;
    lastStandupStatus: StandupStatus | null;
    chiefResponseCount: number | null;
  };
  latestStandup: OrgLatestStandupSummary | null;
  members: OrgMemberRecord[];
};
