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

export type ExecutionOwner = "Brendan" | "Rohan" | "Roy" | "Somwya" | "Jarvis";
export type ExecutionStatus = "todo" | "in_progress" | "blocked" | "done";
export type ExecutionPriority = "P0" | "P1" | "P2" | "P3";

export type ExecutionTask = {
  id: string;
  title: string;
  owner: ExecutionOwner;
  status: ExecutionStatus;
  priority: ExecutionPriority;
  workstream: string;
  dueDate: string | null;
  blocked: boolean;
  blockerReason: string | null;
  dependencies: string[];
  nextAction: string;
  sourceRefs: string[];
  description: string;
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

export type CommandPayload = {
  source: {
    kind: string;
    updatedAt: string;
    note: string;
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
  tasks: ExecutionTask[];
  owners: SelectOption[];
  workstreams: SelectOption[];
  views: Array<{ id: string; label: string; count: number }>;
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
