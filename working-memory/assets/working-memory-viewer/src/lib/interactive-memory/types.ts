export const DAY_SCHEMA_VERSION = 8;
export const CALENDAR_SCHEMA_VERSION = 3;
export const INTERACTIVE_MEMORY_INDEX_SCHEMA_VERSION = 1;
export const PROMPT_SETTINGS_SCHEMA_VERSION = 1;

export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type TaskKind = "focus" | "task" | "quick" | "comms" | "personal" | "ad_hoc";
export type SourceKind = "jira" | "slack" | "gmail" | "calendar" | "meeting" | "doc" | "manual";
export type TrackerStatus = "active" | "waiting" | "blocked" | "done" | "dropped";
export type WorkDepth = "deep" | "shallow";
export type AgentReadiness = "ready" | "warning" | "incomplete";
export type AgentModel = "haiku" | "sonnet" | "opus" | "fable";

export type SourceRef = {
  kind: SourceKind;
  label: string;
  url?: string;
};

export type TicketFields = {
  objective: string;
  background: string;
  sourcesOverride?: string;
  constraintsNonGoals: string;
  doneWhen: string;
  verification: string;
};

export type AgentRun = {
  id: string;
  model: AgentModel;
  name: string;
  cwd: string;
  launchedAt: string;
  status: "launched";
  promptSha256: string;
};

export type TaskRecord = {
  id: string;
  title: string;
  agentName?: string;
  status: TaskStatus;
  kind: TaskKind;
  estimateMinutes: number;
  workDepth: WorkDepth;
  agentReadiness: AgentReadiness;
  readinessWarnings: string[];
  project?: string;
  sourceRefs: SourceRef[];
  trackerIds?: string[];
  ticketFields: TicketFields;
  agentRuns?: AgentRun[];
  scheduledStart?: string;
  scheduledEnd?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type TrackerRecord = {
  id: string;
  person: string;
  work: string;
  status: TrackerStatus;
  originalAskDate: string;
  sourceRefs: SourceRef[];
  notes: string;
  relatedTaskIds?: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type CalendarMeeting = {
  id: string;
  calendarId?: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  status?: string;
  responseStatus?: string;
  location?: string;
  htmlLink?: string;
  meetingUrl?: string;
  attendeeCount?: number;
  organizer?: string;
  transparency?: string;
  eventType?: string;
};

export type DaySettings = {
  startHour: number;
  endHour: number;
  slotMinutes: number;
  completionTargetPercent: number;
};

export type DayIdeas = {
  text: string;
  updatedAt?: string;
};

export type DayLifecycle = {
  morningRunAt?: string;
  morningSources?: Record<string, string>;
  generatedBy?: string;
};

export type DayBreak = {
  id: string;
  label: string;
  start: string;
  end: string;
  kind: "break" | "lunch";
};

export type CompletionFact = {
  subject: string;
  text: string;
};

export type DayPlan = {
  schemaVersion: number;
  date: string;
  timezone: string;
  title: string;
  status: "active" | "closed";
  settings: DaySettings;
  tasks: TaskRecord[];
  trackers: TrackerRecord[];
  breaks: DayBreak[];
  dayNotes: string;
  ideas: DayIdeas;
  lifecycle: DayLifecycle;
  completionFacts?: CompletionFact[];
  generatedAt: string;
  updatedAt: string;
};

export type CalendarFile = {
  schemaVersion: number;
  date: string;
  timezone: string;
  source: "google-calendar" | "manual" | "unavailable";
  generatedAt: string;
  meetings: CalendarMeeting[];
  error?: string;
};

export type DayBundle = {
  day: DayPlan;
  calendar: CalendarFile;
  paths: {
    dayDir: string;
    dayJson: string;
    calendarJson: string;
  };
};

export type InteractiveDayIndexEntry = {
  date: string;
  schemaVersion: number;
  title: string;
  status: DayPlan["status"];
  updatedAt: string;
  generatedAt: string;
  taskCount: number;
  morningRunComplete: boolean;
  morningRunAt?: string;
  generatedBy?: string;
};

export type InteractiveDayIndex = {
  schemaVersion: number;
  generatedAt: string;
  updatedAt: string;
  days: InteractiveDayIndexEntry[];
};

export type PromptSettings = {
  schemaVersion: number;
  promptTemplate: string;
  updatedAt: string;
};

export type StudioCurrentResponse = {
  today: string;
  selectedDate: string | null;
  todayExists: boolean;
  morningRunComplete: boolean;
  isFallback: boolean;
  availableDays: string[];
  bundle: DayBundle | null;
  settings: PromptSettings;
  settingsWarning?: string;
};

export const QUEUE_SCHEMA_VERSION = 1;

export type QueueItemStatus = "queued" | "dismissed" | "consumed";

export type QueueMatchedTask = {
  taskId: string;
  taskDate: string; // YYYY-MM-DD of the day plan the matched task lives on
  title: string;
};

export type QueueItem = {
  id: string; // "queue-" + crypto.randomUUID()
  status: QueueItemStatus;
  title: string; // short imperative candidate title
  summary: string; // 1-2 sentence gist
  harvestedContext: string; // raw excerpt(s); pre-seeds the grill conversation
  sourceRefs: SourceRef[]; // reuse existing SourceRef
  fingerprints: string[]; // stable source event ids, e.g. "slack:C0123:1720900000.123", "jira:PROJ-12:assigned"
  matchedTask?: QueueMatchedTask; // chip only; never suppresses
  dismissedBefore?: { at: string }; // set on explicit re-ask of a dismissed topic
  seenCount: number;
  firstSeenAt: string; // ISO
  lastSeenAt: string; // ISO
  dismissedAt?: string;
  consumedAt?: string;
  consumedTaskId?: string; // task created by grill apply
};

export type QueueSourceHealth = {
  source: SourceKind; // "slack" | "gmail" | "jira" | "calendar" | "meeting"
  status: "ok" | "failed" | "skipped";
  detail?: string;
};

export type QueueSweepMeta = {
  lastSweepAt?: string;
  lastSweepKind?: "scheduled" | "manual" | "morning";
  checkpoint?: string; // ISO; next sweep harvests events strictly after this
  sources: QueueSourceHealth[];
};

export type QueueFile = {
  schemaVersion: number;
  updatedAt: string;
  sweep: QueueSweepMeta;
  items: QueueItem[];
};

// Sweep submission shape (what the sweep agent POSTs).
// Event identity (the same event re-seen) is handled server-side via fingerprints.
// TOPIC identity (the same ask arriving via a new event) cannot be derived from
// fingerprints, so the sweep agent decides it and communicates via the id fields.
export type QueueCandidate = {
  title: string;
  summary: string;
  harvestedContext: string;
  sourceRefs: SourceRef[];
  fingerprints: string[]; // at least one, non-empty strings
  matchedTask?: QueueMatchedTask;
  mergeIntoItemId?: string; // same ask as an existing QUEUED item, new event
  reAskOfItemId?: string; // NEW explicit ask re-raising a DISMISSED item
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

export const TRACKER_STATUS_LABELS: Record<TrackerStatus, string> = {
  active: "Active",
  waiting: "Waiting",
  blocked: "Blocked",
  done: "Done",
  dropped: "Dropped",
};
