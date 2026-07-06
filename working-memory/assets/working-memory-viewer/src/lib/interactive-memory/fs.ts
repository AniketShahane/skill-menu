import "server-only";

import fs from "node:fs/promises";
import { getAgentCwd, getWorkingMemoryTimeZone } from "@/lib/runtime-config";
import { sanitizeAgentName, suggestAgentName } from "./agent-names";
import {
  DATE_KEY_RE,
  dayFilePaths,
  getInteractiveMemoryDir,
  interactiveMemoryIndexPath,
  interactiveMemorySettingsPath,
} from "./paths";
import { DEFAULT_PROMPT_TEMPLATE, getPromptWarnings, getTaskReadiness } from "./prompt";
import {
  type AgentModel,
  type AgentRun,
  CALENDAR_SCHEMA_VERSION,
  type CalendarFile,
  type CalendarMeeting,
  type CompletionFact,
  DAY_SCHEMA_VERSION,
  type DayBreak,
  type DayBundle,
  type DayLifecycle,
  type DayPlan,
  INTERACTIVE_MEMORY_INDEX_SCHEMA_VERSION,
  type InteractiveDayIndex,
  type InteractiveDayIndexEntry,
  PROMPT_SETTINGS_SCHEMA_VERSION,
  type PromptSettings,
  type SourceRef,
  type StudioCurrentResponse,
  type TaskKind,
  type TaskRecord,
  type TaskStatus,
  type TicketFields,
  type TrackerRecord,
  type TrackerStatus,
  type WorkDepth,
} from "./types";

const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "review", "done"];
const TASK_KINDS: TaskKind[] = ["focus", "task", "quick", "comms", "personal", "ad_hoc"];
const TRACKER_STATUSES: TrackerStatus[] = ["active", "waiting", "blocked", "done", "dropped"];
const WORK_DEPTHS: WorkDepth[] = ["deep", "shallow"];
const AGENT_MODELS: AgentModel[] = ["haiku", "sonnet", "opus"];
const AGENT_RUN_STATUSES: AgentRun["status"][] = ["launched"];
const LEGACY_TEXT_SCHEMA_MAX_VERSION = 5;

type PreviousAgentContext = {
  objective?: string;
  context?: string;
  constraints?: string[];
  files?: string[];
  dataSources?: string[];
  acceptanceCriteria?: string[];
  verification?: string[];
  definitionOfDone?: string[];
};

type LegacyAgentBrief = {
  task: string;
  context: string;
  doneWhen: string;
};

type UnknownTaskRecord = Omit<Partial<TaskRecord>, "agentRuns"> & {
  agentContext?: PreviousAgentContext;
  agentRuns?: unknown;
  brief?: Partial<LegacyAgentBrief>;
  priority?: unknown;
  ticketBody?: string;
  rawThoughts?: string;
};

type UnknownTrackerRecord = Partial<TrackerRecord>;

type ParsedTicketBodySections = Partial<Omit<TicketFields, "sourcesOverride">> & {
  sources?: string;
};

type UnknownDayLifecycle = Partial<Omit<DayLifecycle, "morningSources">> & {
  morningSources?: unknown;
};

type UnknownDayPlan = Partial<
  Omit<DayPlan, "tasks" | "trackers" | "ideas" | "lifecycle" | "completionFacts">
> & {
  tasks?: UnknownTaskRecord[];
  trackers?: UnknownTrackerRecord[];
  breaks?: Partial<DayBreak>[];
  ideas?: DayPlan["ideas"];
  lifecycle?: UnknownDayLifecycle;
  completionFacts?: unknown;
};

type UnknownPromptSettings = Partial<PromptSettings>;

type UnknownCalendarFile = {
  [key: string]: unknown;
  schemaVersion?: unknown;
  date?: unknown;
  timezone?: unknown;
  source?: unknown;
  generatedAt?: unknown;
  meetings?: unknown;
  error?: unknown;
};

type UnknownCalendarMeeting = {
  [key: string]: unknown;
  id?: unknown;
  calendarId?: unknown;
  title?: unknown;
  summary?: unknown;
  name?: unknown;
  subject?: unknown;
  start?: unknown;
  end?: unknown;
  allDay?: unknown;
  status?: unknown;
  responseStatus?: unknown;
  selfResponse?: unknown;
  location?: unknown;
  htmlLink?: unknown;
  meetingUrl?: unknown;
  attendeeCount?: unknown;
  organizer?: unknown;
  transparency?: unknown;
  eventType?: unknown;
};

export class DaySaveConflictError extends Error {
  constructor() {
    super("A newer version of this interactive day already exists on disk.");
    this.name = "DaySaveConflictError";
  }
}

export class PromptSettingsSaveConflictError extends Error {
  constructor() {
    super("A newer prompt settings file already exists on disk.");
    this.name = "PromptSettingsSaveConflictError";
  }
}

export async function readOrCreateDay(date: string): Promise<DayBundle> {
  const rootDir = getInteractiveMemoryDir();
  const paths = dayFilePaths(rootDir, date);
  await fs.mkdir(paths.dayDir, { recursive: true });

  const existingDay = await readOptionalJson<UnknownDayPlan>(paths.dayJson);
  assertSupportedDaySchema(existingDay);
  const rawDay = existingDay ?? (await buildInitialDay(date));
  const day = normalizeDayPlan({ ...rawDay, date: rawDay.date || date });
  if (!existingDay || shouldPersistNormalizedDay(existingDay)) {
    await writeJsonFile(paths.dayJson, day);
  }

  const calendar = normalizeCalendarFile(
    await readOrCreateJson(paths.calendarJson, () => buildEmptyCalendar(date)),
    date,
    day.timezone,
  );
  await refreshInteractiveDayIndex(rootDir);

  return {
    day,
    calendar,
    paths,
  };
}

export async function saveDay(
  date: string,
  nextDay: DayPlan,
  options: { baseUpdatedAt?: string } = {},
): Promise<DayBundle> {
  const rootDir = getInteractiveMemoryDir();
  const paths = dayFilePaths(rootDir, date);
  await fs.mkdir(paths.dayDir, { recursive: true });

  const existing = await readOptionalJson<UnknownDayPlan>(paths.dayJson);
  assertSupportedDaySchema(existing);
  assertSupportedDaySchema(nextDay);
  if (options.baseUpdatedAt !== undefined && existing?.updatedAt !== options.baseUpdatedAt) {
    throw new DaySaveConflictError();
  }
  if (options.baseUpdatedAt === undefined && isNewerThan(existing?.updatedAt, nextDay.updatedAt)) {
    throw new DaySaveConflictError();
  }

  const normalized = normalizeDayPlan({
    ...nextDay,
    date,
    schemaVersion: DAY_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  });

  await writeJsonFile(paths.dayJson, normalized);
  const calendar = normalizeCalendarFile(
    await readOrCreateJson(paths.calendarJson, () => buildEmptyCalendar(date)),
    date,
    normalized.timezone,
  );
  await refreshInteractiveDayIndex(rootDir);

  return {
    day: normalized,
    calendar,
    paths,
  };
}

export async function saveCalendar(date: string, calendar: UnknownCalendarFile) {
  const rootDir = getInteractiveMemoryDir();
  const paths = dayFilePaths(rootDir, date);
  await fs.mkdir(paths.dayDir, { recursive: true });
  await writeJsonFile(paths.calendarJson, normalizeCalendarFile({ ...calendar, date }, date));
  await refreshInteractiveDayIndex(rootDir);
}

export async function listInteractiveDays() {
  const index = await refreshInteractiveDayIndex(getInteractiveMemoryDir());
  return index.days.map((entry) => entry.date);
}

export async function readExistingDay(date: string): Promise<DayBundle | null> {
  const rootDir = getInteractiveMemoryDir();
  const paths = dayFilePaths(rootDir, date);
  const rawDay = await readOptionalJson<UnknownDayPlan>(paths.dayJson);
  if (!rawDay) return null;
  assertSupportedDaySchema(rawDay);

  const day = normalizeDayPlan({ ...rawDay, date: rawDay.date || date });
  const rawCalendar = await readOptionalJson<UnknownCalendarFile>(paths.calendarJson);
  const calendar = normalizeCalendarFile(rawCalendar, date, day.timezone);

  return {
    day,
    calendar,
    paths,
  };
}

export async function readPromptSettings(): Promise<PromptSettings> {
  return (await readPromptSettingsWithWarning()).settings;
}

export async function readPromptSettingsWithWarning(): Promise<{
  settings: PromptSettings;
  warning?: string;
}> {
  const settingsPath = interactiveMemorySettingsPath(getInteractiveMemoryDir());
  try {
    const raw = await readJsonFile<UnknownPromptSettings>(settingsPath);
    return { settings: normalizePromptSettings(raw) };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { settings: buildDefaultPromptSettings() };
    }
    return {
      settings: buildDefaultPromptSettings(),
      warning:
        error instanceof Error
          ? `Prompt settings could not be loaded: ${error.message}`
          : "Prompt settings could not be loaded.",
    };
  }
}

export async function savePromptSettings(nextSettings: PromptSettings): Promise<PromptSettings> {
  const rootDir = getInteractiveMemoryDir();
  await fs.mkdir(rootDir, { recursive: true });
  const settingsPath = interactiveMemorySettingsPath(rootDir);
  const existing = await readExistingPromptSettingsForConflict(settingsPath);
  if (isNewerThan(existing?.updatedAt, nextSettings.updatedAt)) {
    throw new PromptSettingsSaveConflictError();
  }

  const normalized = normalizePromptSettings({
    ...nextSettings,
    updatedAt: new Date().toISOString(),
  });
  await writeJsonFile(settingsPath, normalized);
  return normalized;
}

async function readExistingPromptSettingsForConflict(settingsPath: string) {
  try {
    return await readOptionalJson<UnknownPromptSettings>(settingsPath);
  } catch (error) {
    if (isNotFoundError(error)) return undefined;
    return undefined;
  }
}

export async function getCurrentStudioResponse(now = new Date()): Promise<StudioCurrentResponse> {
  const today = getTodayDateKey(getWorkingMemoryTimeZone(), now);
  const rootDir = getInteractiveMemoryDir();
  const indexEntries = await scanInteractiveDayIndexEntries(rootDir);
  const settings = await readPromptSettingsWithWarning();
  const availableDays = sortIndexEntries(indexEntries).map((entry) => entry.date);
  const selection = selectCurrentInteractiveDay({ today, availableDays });
  const bundle = selection.selectedDate ? await readExistingDay(selection.selectedDate) : null;

  return {
    today,
    selectedDate: bundle ? selection.selectedDate : null,
    todayExists: selection.todayExists,
    morningRunComplete: Boolean(
      bundle && !selection.isFallback && isMorningRunComplete(bundle.day),
    ),
    isFallback: Boolean(bundle && selection.isFallback),
    availableDays,
    bundle,
    settings: settings.settings,
    settingsWarning: settings.warning,
  };
}

export function selectCurrentInteractiveDay({
  today,
  availableDays,
}: {
  today: string;
  availableDays: string[];
}) {
  const sortedDays = Array.from(new Set(availableDays))
    .filter((date) => DATE_KEY_RE.test(date))
    .sort()
    .reverse();
  const todayExists = sortedDays.includes(today);
  const selectedDate = todayExists ? today : sortedDays.find((date) => date < today) || null;

  return {
    selectedDate,
    todayExists,
    isFallback: Boolean(selectedDate && selectedDate !== today),
  };
}

export function getTodayDateKey(timeZone = getWorkingMemoryTimeZone(), now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Could not compute date key for timezone ${timeZone}.`);
  }

  return `${year}-${month}-${day}`;
}

async function buildInitialDay(date: string): Promise<DayPlan> {
  const now = new Date().toISOString();
  const timezone = getWorkingMemoryTimeZone();

  return {
    schemaVersion: DAY_SCHEMA_VERSION,
    date,
    timezone,
    title: `${date}: Working Memory`,
    status: "active",
    settings: {
      startHour: 8,
      endHour: 18,
      slotMinutes: 30,
      completionTargetPercent: 100,
    },
    tasks: [],
    trackers: [],
    breaks: [],
    dayNotes: "",
    ideas: { text: "" },
    lifecycle: {
      generatedBy: "working-memory-viewer",
    },
    completionFacts: [],
    generatedAt: now,
    updatedAt: now,
  };
}

function buildEmptyCalendar(date: string): CalendarFile {
  return {
    schemaVersion: CALENDAR_SCHEMA_VERSION,
    date,
    timezone: getWorkingMemoryTimeZone(),
    source: "unavailable",
    generatedAt: new Date().toISOString(),
    meetings: [],
  };
}

export function normalizeDayPlan(day: UnknownDayPlan): DayPlan {
  const now = new Date().toISOString();
  const sourceSchemaVersion = normalizeSchemaVersion(day.schemaVersion);
  const tasks = (day.tasks || []).map((task, index) =>
    normalizeTask(task, index, sourceSchemaVersion),
  );
  return {
    schemaVersion: DAY_SCHEMA_VERSION,
    date: day.date || "",
    timezone: day.timezone || getWorkingMemoryTimeZone(),
    title: day.title || `${day.date}: Working Memory`,
    status: day.status === "closed" ? "closed" : "active",
    settings: {
      startHour: day.settings?.startHour ?? 8,
      endHour: day.settings?.endHour ?? 18,
      slotMinutes: day.settings?.slotMinutes ?? 30,
      completionTargetPercent: day.settings?.completionTargetPercent ?? 100,
    },
    tasks,
    trackers: normalizeTrackers(day.trackers, tasks, day.date || "", now),
    breaks: normalizeBreaks(day.breaks),
    dayNotes: day.dayNotes || "",
    ideas: normalizeIdeas(day.ideas),
    lifecycle: normalizeLifecycle(day.lifecycle),
    completionFacts: normalizeCompletionFacts(day.completionFacts),
    generatedAt: day.generatedAt || now,
    updatedAt: day.updatedAt || now,
  };
}

export function isMorningRunComplete(day: Pick<DayPlan, "lifecycle">) {
  return Boolean(day.lifecycle.morningRunAt?.trim());
}

function normalizeTask(
  task: UnknownTaskRecord,
  index: number,
  sourceSchemaVersion: number,
): TaskRecord {
  const now = new Date().toISOString();
  const canUseLegacyText = sourceSchemaVersion <= LEGACY_TEXT_SCHEMA_MAX_VERSION;
  const legacyBrief = canUseLegacyText ? normalizeLegacyBrief(task) : emptyLegacyBrief();
  const sourceRefs = normalizeSourceRefs(task.sourceRefs);
  const parsedTicketBody = canUseLegacyText ? parseTicketBodySections(task.ticketBody) : {};
  const title =
    task.title?.trim() ||
    task.ticketFields?.objective?.trim() ||
    parsedTicketBody.objective ||
    legacyBrief.task ||
    "Untitled task";
  const kind = normalizeTaskKind(task.kind);
  const estimateMinutes = normalizeEstimateMinutes(task.estimateMinutes);
  const workDepth = normalizeWorkDepth(task.workDepth, kind);
  const ticketFields = normalizeTicketFields({
    task,
    parsedTicketBody,
    legacyBrief,
    sourceRefs,
    title,
  });
  const agentRuns = normalizeAgentRuns(task.agentRuns);
  const project = task.project?.trim() || undefined;
  const agentName =
    sanitizeAgentName(task.agentName || "") ||
    sanitizeAgentName(agentRuns?.at(-1)?.name || "") ||
    suggestAgentName({ title, ticketFields, sourceRefs, project });
  const candidate: TaskRecord = {
    id: task.id || `task-${index + 1}`,
    title,
    agentName: agentName || undefined,
    status: normalizeTaskStatus(task.status),
    kind,
    estimateMinutes,
    workDepth,
    agentReadiness: "warning",
    readinessWarnings: [],
    project,
    sourceRefs,
    trackerIds: normalizeTrackerIds(task.trackerIds),
    ticketFields,
    agentRuns,
    scheduledStart: task.scheduledStart,
    scheduledEnd: task.scheduledEnd,
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || now,
    completedAt: task.completedAt,
  };
  const validatedWarnings = getPromptWarnings(candidate);

  return {
    ...candidate,
    agentReadiness: getTaskReadiness({ ...candidate, readinessWarnings: validatedWarnings }),
    readinessWarnings: validatedWarnings,
  };
}

function normalizeTrackers(
  trackers: UnknownTrackerRecord[] | undefined,
  tasks: TaskRecord[],
  date: string,
  now: string,
): TrackerRecord[] {
  const normalizedTrackers = Array.isArray(trackers)
    ? trackers
        .map((tracker, index) => normalizeTracker(tracker, index, now))
        .filter((tracker): tracker is TrackerRecord => Boolean(tracker))
    : deriveLegacyTrackers(tasks, date, now);

  const seen = new Set<string>();
  return normalizedTrackers.filter((tracker) => {
    if (seen.has(tracker.id)) return false;
    seen.add(tracker.id);
    return true;
  });
}

function normalizeTracker(
  tracker: UnknownTrackerRecord,
  index: number,
  now: string,
): TrackerRecord | undefined {
  const person = tracker.person?.trim();
  const work = tracker.work?.trim();
  if (!person || !work) return undefined;

  const createdAt = tracker.createdAt?.trim() || now;
  const originalAskDate =
    normalizeDateKey(tracker.originalAskDate) ||
    normalizeDateKey(createdAt) ||
    createdAt.slice(0, 10);

  return {
    id: tracker.id?.trim() || `tracker-${index + 1}`,
    person,
    work,
    status: normalizeTrackerStatus(tracker.status),
    originalAskDate,
    sourceRefs: normalizeSourceRefs(tracker.sourceRefs),
    notes: tracker.notes?.trim() || "",
    relatedTaskIds: normalizeTrackerIds(tracker.relatedTaskIds),
    createdAt,
    updatedAt: tracker.updatedAt?.trim() || createdAt,
    completedAt: tracker.completedAt?.trim() || undefined,
  };
}

function deriveLegacyTrackers(tasks: TaskRecord[], date: string, now: string): TrackerRecord[] {
  return tasks.flatMap((task) => {
    const text = [task.title, task.ticketFields.objective, task.ticketFields.background].join("\n");
    const lowerText = text.toLowerCase();
    if (!/\btrack(?:er|ing)?\b/.test(lowerText)) return [];
    if (/\bmigration tracker\b|\bgoogle sheet\b|\bspreadsheet\b/.test(lowerText)) return [];

    const person = extractTrackerPerson(text);
    if (!person) return [];

    const createdAt = task.createdAt || now;
    const originalAskDate = normalizeDateKey(createdAt) || date || now.slice(0, 10);
    return [
      {
        id: `tracker-${task.id}`,
        person,
        work: extractTrackerWork(task, person),
        status: task.status === "done" ? "done" : "active",
        originalAskDate,
        sourceRefs: task.sourceRefs,
        notes: task.ticketFields.background || task.ticketFields.objective || "",
        relatedTaskIds: [task.id],
        createdAt,
        updatedAt: task.updatedAt || createdAt,
        completedAt: task.completedAt,
      } satisfies TrackerRecord,
    ];
  });
}

function normalizeLegacyBrief(task: UnknownTaskRecord): LegacyAgentBrief {
  if (task.brief) {
    return {
      task: task.brief.task?.trim() || task.title?.trim() || "",
      context: task.brief.context?.trim() || "",
      doneWhen: task.brief.doneWhen?.trim() || "",
    };
  }

  const context = task.agentContext;
  return {
    task: context?.objective?.trim() || task.title?.trim() || "",
    context: joinSections([
      context?.context,
      labeledSection("Files / areas", context?.files),
      labeledSection("Constraints", context?.constraints),
      labeledSection("Data sources / external inputs", context?.dataSources),
      task.project ? `Project / area: ${task.project}` : undefined,
    ]),
    doneWhen: joinSections([
      labeledSection("Success criteria", context?.acceptanceCriteria),
      labeledSection("Verification", context?.verification),
      labeledSection("Definition of done", context?.definitionOfDone),
    ]),
  };
}

function emptyLegacyBrief(): LegacyAgentBrief {
  return {
    task: "",
    context: "",
    doneWhen: "",
  };
}

function normalizeTicketFields({
  legacyBrief,
  parsedTicketBody,
  sourceRefs,
  task,
  title,
}: {
  legacyBrief: LegacyAgentBrief;
  parsedTicketBody: ParsedTicketBodySections;
  sourceRefs: SourceRef[];
  task: UnknownTaskRecord;
  title: string;
}): TicketFields {
  const raw = task.ticketFields;
  return {
    objective:
      normalizeOptionalText(raw?.objective) ||
      parsedTicketBody.objective ||
      legacyBrief.task ||
      title,
    background:
      normalizeOptionalText(raw?.background) ||
      parsedTicketBody.background ||
      normalizeLegacyBackground(task, legacyBrief),
    sourcesOverride:
      normalizeUsefulSourceText(raw?.sourcesOverride) ||
      sourceOverrideFromLegacy(parsedTicketBody.sources, sourceRefs),
    constraintsNonGoals:
      normalizeOptionalText(raw?.constraintsNonGoals) ||
      parsedTicketBody.constraintsNonGoals ||
      normalizeLegacyConstraints(task),
    doneWhen:
      normalizeOptionalText(raw?.doneWhen) ||
      parsedTicketBody.doneWhen ||
      normalizeLegacyDoneWhen(task, legacyBrief),
    verification:
      normalizeOptionalText(raw?.verification) ||
      parsedTicketBody.verification ||
      normalizeLegacyVerification(task),
  };
}

function parseTicketBodySections(ticketBody: unknown): ParsedTicketBodySections {
  const body = normalizeOptionalText(ticketBody);
  if (!body) return {};

  const headingMatches = Array.from(body.matchAll(/^##\s+(.+?)\s*$/gm));
  const parsed: ParsedTicketBodySections = {};
  for (let index = 0; index < headingMatches.length; index += 1) {
    const match = headingMatches[index];
    const heading = normalizeSectionHeading(match[1]);
    const start = (match.index || 0) + match[0].length;
    const end = headingMatches[index + 1]?.index ?? body.length;
    const content = normalizeLegacyTicketText(body.slice(start, end));
    if (!content) continue;

    if (heading === "objective") parsed.objective = content;
    if (heading === "background") parsed.background = content;
    if (heading === "sources") parsed.sources = content;
    if (heading === "constraints/non-goals") parsed.constraintsNonGoals = content;
    if (heading === "done when") parsed.doneWhen = content;
    if (heading === "verification") parsed.verification = content;
  }

  return parsed;
}

function normalizeSectionHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .replace(/^constraints \/ non-goals$/, "constraints/non-goals");
}

function normalizeLegacyTicketText(value: unknown) {
  const text = normalizeOptionalText(value);
  if (!text || /^(unknown|\[missing:[^\]]+\])$/i.test(text)) return undefined;
  return text;
}

function normalizeLegacyBackground(task: UnknownTaskRecord, legacyBrief: LegacyAgentBrief) {
  const context = task.agentContext;
  if (!context) return legacyBrief.context;
  return joinSections([
    context.context,
    labeledSection("Files / areas", context.files),
    labeledSection("Data sources / external inputs", context.dataSources),
    task.project ? `Project / area: ${task.project}` : undefined,
  ]);
}

function normalizeLegacyConstraints(task: UnknownTaskRecord) {
  return joinPlainLines(task.agentContext?.constraints);
}

function normalizeLegacyDoneWhen(task: UnknownTaskRecord, legacyBrief: LegacyAgentBrief) {
  const context = task.agentContext;
  if (!context) return legacyBrief.doneWhen;
  return joinSections([
    labeledSection("Success criteria", context.acceptanceCriteria),
    labeledSection("Definition of done", context.definitionOfDone),
  ]);
}

function normalizeLegacyVerification(task: UnknownTaskRecord) {
  return joinPlainLines(task.agentContext?.verification);
}

function sourceOverrideFromLegacy(value: string | undefined, sourceRefs: SourceRef[]) {
  const normalized = normalizeLegacyTicketText(value);
  if (!normalized) return undefined;
  if (sameNormalizedText(normalized, sourceRefsToMarkdown(sourceRefs))) return undefined;
  return normalized;
}

function normalizeUsefulSourceText(value: unknown) {
  const text = normalizeOptionalText(value);
  if (!text || /^unknown$/i.test(text)) return undefined;
  return text;
}

function sourceRefsToMarkdown(sourceRefs: SourceRef[]) {
  const lines = sourceRefs.map((source) =>
    source.url
      ? `- ${source.kind}: [${source.label}](${source.url})`
      : `- ${source.kind}: ${source.label}`,
  );
  return lines.length > 0 ? lines.join("\n") : "";
}

function sameNormalizedText(left: string, right: string) {
  return left.replace(/\s+/g, " ").trim() === right.replace(/\s+/g, " ").trim();
}

function normalizeTaskStatus(status: string | undefined): TaskStatus {
  return status && TASK_STATUSES.includes(status as TaskStatus) ? (status as TaskStatus) : "todo";
}

function normalizeTaskKind(kind: string | undefined): TaskKind {
  return kind && TASK_KINDS.includes(kind as TaskKind) ? (kind as TaskKind) : "task";
}

function normalizeWorkDepth(depth: string | undefined, kind: TaskKind): WorkDepth {
  if (depth && WORK_DEPTHS.includes(depth as WorkDepth)) return depth as WorkDepth;
  return kind === "focus" ? "deep" : "shallow";
}

function normalizeTrackerStatus(status: string | undefined): TrackerStatus {
  return status && TRACKER_STATUSES.includes(status as TrackerStatus)
    ? (status as TrackerStatus)
    : "active";
}

function normalizeEstimateMinutes(value: number | undefined) {
  return Number.isFinite(value) && value ? Math.max(5, Math.round(value)) : 30;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSchemaVersion(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeTrackerIds(trackerIds: string[] | undefined) {
  const ids = (trackerIds || []).map((id) => id.trim()).filter(Boolean);
  return ids.length > 0 ? Array.from(new Set(ids)) : undefined;
}

function normalizeAgentRuns(agentRuns: unknown) {
  if (!Array.isArray(agentRuns)) return undefined;
  const runs = agentRuns
    .map((run): AgentRun | undefined => {
      if (!run || typeof run !== "object") return undefined;
      const raw = run as Partial<AgentRun>;
      const id = normalizeOptionalText(raw.id);
      const name = normalizeOptionalText(raw.name);
      const launchedAt = normalizeOptionalText(raw.launchedAt);
      const promptSha256 = normalizeOptionalText(raw.promptSha256);
      const cwd = normalizeOptionalText(raw.cwd) || getAgentCwd();
      const model =
        typeof raw.model === "string" && AGENT_MODELS.includes(raw.model as AgentModel)
          ? (raw.model as AgentModel)
          : undefined;
      const status = raw.status && AGENT_RUN_STATUSES.includes(raw.status) ? raw.status : undefined;
      if (!id || !name || !launchedAt || !promptSha256 || !model || !status) return undefined;
      return {
        id,
        model,
        name,
        cwd,
        launchedAt,
        status,
        promptSha256,
      };
    })
    .filter((run): run is AgentRun => Boolean(run));

  return runs.length > 0 ? runs : undefined;
}

function normalizeSourceRefs(sourceRefs: SourceRef[] | undefined): SourceRef[] {
  return (sourceRefs || [])
    .filter((source) => source.label?.trim())
    .map((source) => ({
      ...source,
      label: source.label.trim(),
      url: source.url?.trim() || undefined,
    }));
}

function normalizeBreaks(breaks: Partial<DayBreak>[] | undefined): DayBreak[] {
  if (!Array.isArray(breaks)) return [];
  return breaks
    .map((dayBreak, index) => normalizeBreak(dayBreak, index))
    .filter((dayBreak): dayBreak is DayBreak => Boolean(dayBreak));
}

function normalizeBreak(dayBreak: Partial<DayBreak>, index: number): DayBreak | undefined {
  const start = dayBreak.start?.trim();
  const end = dayBreak.end?.trim();
  if (!start || !end) return undefined;

  return {
    id: dayBreak.id?.trim() || `break-${index + 1}`,
    label: dayBreak.label?.trim() || (dayBreak.kind === "lunch" ? "Lunch" : "Break"),
    start,
    end,
    kind: dayBreak.kind === "lunch" ? "lunch" : "break",
  };
}

function normalizeDateKey(value: string | undefined) {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1];
}

function extractTrackerPerson(text: string) {
  const patterns = [
    /\btrack\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:'s|\s)/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+(?:driving|working on|building|owning|handling)\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)'s\s+(?:deliverable|work|one-pager|doc)\b/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function extractTrackerWork(task: TaskRecord, person: string) {
  const escapedPerson = escapeRegExp(person);
  const trackMatch = task.title.match(new RegExp(`track\\s+${escapedPerson}'s\\s+([^.;()]+)`, "i"));
  if (trackMatch?.[1]) return cleanTrackerWork(trackMatch[1]);

  const text = [task.title, task.ticketFields.background, task.ticketFields.objective].join(" ");
  const deliverableMatch = text.match(/\bdeliverable:\s*([^.;]+)/i);
  if (deliverableMatch?.[1]) return cleanTrackerWork(deliverableMatch[1]);

  const drivingMatch = text.match(
    new RegExp(
      `${escapedPerson}\\s+is\\s+(?:driving|working on|building|owning|handling)\\s+([^.;]+)`,
      "i",
    ),
  );
  if (drivingMatch?.[1]) return cleanTrackerWork(drivingMatch[1]);

  return cleanTrackerWork(task.ticketFields.objective || task.title);
}

function cleanTrackerWork(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^a\s+/i, "")
    .replace(/\s+to\s+track$/i, "")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labeledSection(label: string, values: string[] | undefined) {
  const lines = values?.map((value) => value.trim()).filter(Boolean) || [];
  if (lines.length === 0) return undefined;
  return `${label}:\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function joinPlainLines(values: string[] | undefined) {
  return (
    values
      ?.map((value) => value.trim())
      .filter(Boolean)
      .join("\n") || ""
  );
}

function joinSections(values: Array<string | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("\n\n");
}

function normalizeIdeas(ideas: DayPlan["ideas"] | undefined): DayPlan["ideas"] {
  return {
    text: ideas?.text || "",
    updatedAt: ideas?.updatedAt,
  };
}

const COMPLETION_FACTS_MAX = 20;

function normalizeCompletionFacts(facts: unknown): CompletionFact[] {
  if (!Array.isArray(facts)) return [];
  const normalized: CompletionFact[] = [];
  for (const entry of facts) {
    if (!entry || typeof entry !== "object") continue;
    const subject = (entry as { subject?: unknown }).subject;
    const text = (entry as { text?: unknown }).text;
    if (typeof subject !== "string" || typeof text !== "string") continue;
    const trimmedSubject = subject.trim();
    const trimmedText = text.trim();
    if (!trimmedSubject || !trimmedText) continue;
    normalized.push({ subject: trimmedSubject, text: trimmedText });
    if (normalized.length >= COMPLETION_FACTS_MAX) break;
  }
  return normalized;
}

function normalizeLifecycle(lifecycle: UnknownDayLifecycle | undefined): DayLifecycle {
  const normalized: DayLifecycle = {};
  const morningRunAt = lifecycle?.morningRunAt?.trim();
  const generatedBy = lifecycle?.generatedBy?.trim();
  const morningSources =
    lifecycle?.morningSources &&
    typeof lifecycle.morningSources === "object" &&
    !Array.isArray(lifecycle.morningSources)
      ? Object.fromEntries(
          Object.entries(lifecycle.morningSources)
            .filter((entry): entry is [string, string] => typeof entry[1] === "string")
            .map(([source, status]) => [source.trim(), status.trim()])
            .filter(([source, status]) => source && status),
        )
      : undefined;

  if (morningRunAt) normalized.morningRunAt = morningRunAt;
  if (morningSources && Object.keys(morningSources).length > 0) {
    normalized.morningSources = morningSources;
  }
  if (generatedBy) normalized.generatedBy = generatedBy;

  return normalized;
}

function buildDefaultPromptSettings(): PromptSettings {
  return {
    schemaVersion: PROMPT_SETTINGS_SCHEMA_VERSION,
    promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    updatedAt: new Date().toISOString(),
  };
}

function normalizePromptSettings(settings: UnknownPromptSettings | undefined): PromptSettings {
  return {
    schemaVersion: PROMPT_SETTINGS_SCHEMA_VERSION,
    promptTemplate: settings?.promptTemplate?.trim() || DEFAULT_PROMPT_TEMPLATE,
    updatedAt: settings?.updatedAt?.trim() || new Date().toISOString(),
  };
}

function assertSupportedDaySchema(day: Pick<UnknownDayPlan, "schemaVersion"> | undefined) {
  if (!day?.schemaVersion || day.schemaVersion <= DAY_SCHEMA_VERSION) return;
  throw new Error(
    `Unsupported working-memory day schema ${day.schemaVersion}; app supports ${DAY_SCHEMA_VERSION}.`,
  );
}

function normalizeCalendarFile(
  calendar: UnknownCalendarFile | undefined,
  date: string,
  timezone = getWorkingMemoryTimeZone(),
): CalendarFile {
  return {
    schemaVersion: CALENDAR_SCHEMA_VERSION,
    date: normalizeOptionalText(calendar?.date) || date,
    timezone: normalizeOptionalText(calendar?.timezone) || timezone,
    source: normalizeCalendarSource(calendar?.source),
    generatedAt: normalizeOptionalText(calendar?.generatedAt) || new Date().toISOString(),
    meetings: Array.isArray(calendar?.meetings)
      ? calendar.meetings.map((meeting, index) => normalizeCalendarMeeting(meeting, index))
      : [],
    error: normalizeOptionalText(calendar?.error),
  };
}

function normalizeCalendarMeeting(meeting: unknown, index: number): CalendarMeeting {
  const raw = meeting && typeof meeting === "object" ? (meeting as UnknownCalendarMeeting) : {};
  const start = normalizeOptionalText(raw.start) || "";
  const responseStatus =
    normalizeOptionalText(raw.responseStatus) || normalizeOptionalText(raw.selfResponse);

  return {
    ...raw,
    id: normalizeOptionalText(raw.id) || `meeting-${index + 1}`,
    calendarId: normalizeOptionalText(raw.calendarId),
    title:
      normalizeOptionalText(raw.title) ||
      normalizeOptionalText(raw.summary) ||
      normalizeOptionalText(raw.name) ||
      normalizeOptionalText(raw.subject) ||
      "Untitled event",
    start,
    end: normalizeOptionalText(raw.end) || start,
    allDay: normalizeBoolean(raw.allDay),
    status: normalizeOptionalText(raw.status),
    responseStatus,
    location: normalizeOptionalText(raw.location),
    htmlLink: normalizeOptionalText(raw.htmlLink),
    meetingUrl: normalizeOptionalText(raw.meetingUrl),
    attendeeCount: normalizeOptionalNumber(raw.attendeeCount),
    organizer: normalizeOptionalText(raw.organizer),
    transparency: normalizeOptionalText(raw.transparency),
    eventType: normalizeOptionalText(raw.eventType),
  };
}

function normalizeCalendarSource(source: unknown): CalendarFile["source"] {
  return source === "google-calendar" || source === "manual" || source === "unavailable"
    ? source
    : "unavailable";
}

function normalizeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function refreshInteractiveDayIndex(rootDir: string): Promise<InteractiveDayIndex> {
  await fs.mkdir(rootDir, { recursive: true });
  const entries = await scanInteractiveDayIndexEntries(rootDir);
  const nextDays = sortIndexEntries(entries);
  const indexPath = interactiveMemoryIndexPath(rootDir);
  const existing = normalizeInteractiveDayIndex(
    await readOptionalJson<Partial<InteractiveDayIndex>>(indexPath),
  );

  if (
    existing &&
    existing.schemaVersion === INTERACTIVE_MEMORY_INDEX_SCHEMA_VERSION &&
    sameIndexEntries(existing.days, nextDays)
  ) {
    return existing;
  }

  const now = new Date().toISOString();
  const nextIndex: InteractiveDayIndex = {
    schemaVersion: INTERACTIVE_MEMORY_INDEX_SCHEMA_VERSION,
    generatedAt: existing?.generatedAt || now,
    updatedAt: now,
    days: nextDays,
  };
  await writeJsonFile(indexPath, nextIndex);
  return nextIndex;
}

async function scanInteractiveDayIndexEntries(
  rootDir: string,
): Promise<InteractiveDayIndexEntry[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const dayEntries = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && DATE_KEY_RE.test(entry.name))
      .map(async (entry) => {
        const paths = dayFilePaths(rootDir, entry.name);
        const rawDay = await readOptionalJson<UnknownDayPlan>(paths.dayJson);
        if (!rawDay) return undefined;
        assertSupportedDaySchema(rawDay);
        return dayToIndexEntry(normalizeDayPlan({ ...rawDay, date: rawDay.date || entry.name }));
      }),
  );

  return dayEntries.filter((entry): entry is InteractiveDayIndexEntry => Boolean(entry));
}

function normalizeInteractiveDayIndex(
  index: Partial<InteractiveDayIndex> | undefined,
): InteractiveDayIndex | undefined {
  if (!index || !Array.isArray(index.days)) return undefined;
  return {
    schemaVersion: index.schemaVersion || 0,
    generatedAt: index.generatedAt || new Date().toISOString(),
    updatedAt: index.updatedAt || new Date().toISOString(),
    days: sortIndexEntries(index.days.filter(isIndexEntry)),
  };
}

function isIndexEntry(entry: unknown): entry is InteractiveDayIndexEntry {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "date" in entry &&
    typeof (entry as InteractiveDayIndexEntry).date === "string" &&
    DATE_KEY_RE.test((entry as InteractiveDayIndexEntry).date)
  );
}

function dayToIndexEntry(day: DayPlan): InteractiveDayIndexEntry {
  return {
    date: day.date,
    schemaVersion: day.schemaVersion,
    title: day.title,
    status: day.status,
    updatedAt: day.updatedAt,
    generatedAt: day.generatedAt,
    taskCount: day.tasks.length,
    morningRunComplete: isMorningRunComplete(day),
    morningRunAt: day.lifecycle.morningRunAt,
    generatedBy: day.lifecycle.generatedBy,
  };
}

function sortIndexEntries(entries: InteractiveDayIndexEntry[]) {
  return [...entries].sort((left, right) => right.date.localeCompare(left.date));
}

function sameIndexEntries(left: InteractiveDayIndexEntry[], right: InteractiveDayIndexEntry[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function shouldPersistNormalizedDay(day: UnknownDayPlan) {
  const sourceSchemaVersion = normalizeSchemaVersion(day.schemaVersion);
  return (
    day.schemaVersion !== DAY_SCHEMA_VERSION ||
    !day.lifecycle ||
    !Array.isArray(day.tasks) ||
    !Array.isArray(day.trackers) ||
    !Array.isArray(day.breaks) ||
    day.tasks.some(
      (task, index) =>
        task.agentContext ||
        "priority" in task ||
        "brief" in task ||
        "ticketBody" in task ||
        "rawThoughts" in task ||
        !task.ticketFields ||
        !task.workDepth ||
        !task.agentReadiness ||
        !Array.isArray(task.readinessWarnings) ||
        hasStaleAgentRuns(task) ||
        hasStaleComputedReadiness(task, index, sourceSchemaVersion),
    )
  );
}

function hasStaleAgentRuns(task: UnknownTaskRecord) {
  if (task.agentRuns === undefined) return false;
  if (!Array.isArray(task.agentRuns)) return true;
  return (
    JSON.stringify(task.agentRuns) !== JSON.stringify(normalizeAgentRuns(task.agentRuns) || [])
  );
}

function hasStaleComputedReadiness(
  task: UnknownTaskRecord,
  index: number,
  sourceSchemaVersion: number,
) {
  const normalized = normalizeTask(task, index, sourceSchemaVersion);
  return (
    task.agentName !== normalized.agentName ||
    task.agentReadiness !== normalized.agentReadiness ||
    !sameStringArray(task.readinessWarnings, normalized.readinessWarnings)
  );
}

function sameStringArray(left: string[] | undefined, right: string[]) {
  return JSON.stringify(left || []) === JSON.stringify(right);
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function readOrCreateJson<T>(filePath: string, create: () => T | Promise<T>): Promise<T> {
  try {
    return await readJsonFile<T>(filePath);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
    const initial = await create();
    await writeJsonFile(filePath, initial);
    return initial;
  }
}

async function readOptionalJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return await readJsonFile<T>(filePath);
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

function isNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isNewerThan(existing: string | undefined, incoming: string | undefined) {
  if (!existing || !incoming) return false;
  const existingTime = Date.parse(existing);
  const incomingTime = Date.parse(incoming);
  return (
    Number.isFinite(existingTime) && Number.isFinite(incomingTime) && existingTime > incomingTime
  );
}

async function writeJsonFile(filePath: string, data: unknown) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const backupPath = `${filePath}.bak`;
  const content = `${JSON.stringify(data, null, 2)}\n`;

  await fs.writeFile(tempPath, content, "utf8");
  JSON.parse(await fs.readFile(tempPath, "utf8"));
  try {
    await fs.copyFile(filePath, backupPath);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  await fs.rename(tempPath, filePath);
}
