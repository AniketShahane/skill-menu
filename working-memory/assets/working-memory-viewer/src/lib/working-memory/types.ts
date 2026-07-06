export type SectionKind =
  | "focus"
  | "tasks"
  | "quick"
  | "inbox"
  | "notes"
  | "trackers"
  | "parked"
  | "closed_today"
  | "source_gap"
  | "tomorrow"
  | "resume_refresh"
  | "strategy_note"
  | "other";

export type TaskStatus = "open" | "done" | "partial" | "dropped";
export type CommunicationState =
  | "owed_by_me"
  | "waiting_on_others"
  | "monitor"
  | "closed"
  | "source_gap";
export type CommunicationRisk = "none" | "stale" | "warning" | "critical";
export type SourceType = "slack" | "gmail" | "jira" | "calendar" | "meeting" | "unknown";
export type OwnerSide = "me" | "other" | "mixed" | "unknown";
export type Confidence = "high" | "medium" | "low";

export type MarkdownLink = {
  label: string;
  href: string;
};

export type NoteFrontmatter = {
  date?: string;
  tags: string[];
  type?: string;
  status?: string;
  deepWork?: string;
  completed?: number;
  total?: number;
};

export type Section = {
  heading: string;
  kind: SectionKind;
  rawMarkdown: string;
  lineRange: [number, number];
};

export type TaskItem = {
  id: string;
  date: string;
  section: SectionKind;
  sectionHeading: string;
  status: TaskStatus;
  title: string;
  rawTitle: string;
  rawMarkdown: string;
  details: Record<string, string[]>;
  jiraKeys: string[];
  links: MarkdownLink[];
  ageMarker?: string;
  lineRange: [number, number];
};

export type TrackerItem = {
  id: string;
  date: string;
  section: SectionKind;
  sectionHeading: string;
  title: string;
  rawMarkdown: string;
  jiraKeys: string[];
  links: MarkdownLink[];
  lineRange: [number, number];
};

export type SourceGap = {
  id: string;
  date: string;
  title: string;
  rawMarkdown: string;
  clean: boolean;
  lineRange: [number, number];
};

export type NoteStats = {
  coreDone: number;
  coreTotal: number;
  coreOpen: number;
  frontmatterCompleted?: number;
  frontmatterTotal?: number;
  completionRate: number;
  commRiskCount: number;
};

export type DailyNote = {
  date: string;
  path: string;
  title: string;
  rawMarkdown: string;
  frontmatter: NoteFrontmatter;
  sections: Section[];
  tasks: TaskItem[];
  trackers: TrackerItem[];
  sourceGaps: SourceGap[];
  stats: NoteStats;
  parseWarnings: string[];
};

export type CommunicationItem = {
  id: string;
  sourceId: string;
  state: CommunicationState;
  risk: CommunicationRisk;
  title: string;
  sourceType: SourceType;
  ownerSide: OwnerSide;
  firstSeen?: string;
  lastSeen: string;
  ageDays?: number;
  evidence: string;
  reason: string;
  confidence: Confidence;
  notePath: string;
  section: SectionKind;
  lineRange: [number, number];
};

export type WorkingMemoryHealth = {
  ok: boolean;
  workingMemoryDir: string;
  noteCount: number;
  latestDate?: string;
  parseWarningCount: number;
};

export type WorkingMemoryDataset = {
  generatedAt: string;
  notes: DailyNote[];
  latestDate?: string;
  comms: CommunicationItem[];
  health: WorkingMemoryHealth;
};
