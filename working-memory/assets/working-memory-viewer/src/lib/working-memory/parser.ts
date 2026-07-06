import matter from "gray-matter";
import { z } from "zod";
import type {
  CommunicationItem,
  CommunicationRisk,
  CommunicationState,
  Confidence,
  DailyNote,
  MarkdownLink,
  NoteFrontmatter,
  OwnerSide,
  Section,
  SectionKind,
  SourceGap,
  SourceType,
  TaskItem,
  TaskStatus,
  TrackerItem,
} from "./types";

const FrontmatterSchema = z
  .object({
    date: z.union([z.string(), z.date()]).optional(),
    tags: z
      .union([z.array(z.string()), z.string()])
      .optional()
      .transform((value) => {
        if (Array.isArray(value)) return value;
        if (typeof value === "string") return [value];
        return [];
      }),
    type: z.string().optional(),
    status: z.string().optional(),
    deep_work: z.string().optional(),
    completed: z.coerce.number().optional(),
    total: z.coerce.number().optional(),
  })
  .passthrough();

const CORE_SECTION_KINDS: SectionKind[] = ["focus", "tasks", "quick"];
const TASK_SECTION_KINDS: SectionKind[] = ["focus", "tasks", "quick", "inbox", "closed_today"];
const TRACKER_SECTION_KINDS: SectionKind[] = ["trackers", "parked", "tomorrow"];

type ParsedFrontmatter = z.infer<typeof FrontmatterSchema>;

export function parseDailyNote(markdown: string, filePath: string): DailyNote {
  const parsed = matter(markdown);
  const parseWarnings: string[] = [];
  const fileDate = extractDateFromPath(filePath);
  const frontmatter = normalizeFrontmatter(parsed.data, fileDate, parseWarnings);
  const date = frontmatter.date || fileDate || "unknown-date";
  const frontmatterLineCount = countFrontmatterLines(markdown);
  const sections = parseSections(parsed.content, frontmatterLineCount);
  const tasks = sections.flatMap((section) => extractTasks(section, date));
  const trackers = sections.flatMap((section) => extractTrackers(section, date));
  const sourceGaps = sections.flatMap((section) => extractSourceGaps(section, date));
  const title = extractTitle(parsed.content) || `${date}: Working Memory`;
  const stats = buildStats(tasks, frontmatter);

  if (!frontmatter.date) {
    parseWarnings.push("Missing frontmatter date; fell back to file name.");
  }
  if (frontmatter.total !== undefined && frontmatter.total !== stats.coreTotal) {
    parseWarnings.push(
      `Frontmatter total ${frontmatter.total} differs from parsed core total ${stats.coreTotal}.`,
    );
  }
  if (frontmatter.completed !== undefined && frontmatter.completed !== stats.coreDone) {
    parseWarnings.push(
      `Frontmatter completed ${frontmatter.completed} differs from parsed core done ${stats.coreDone}.`,
    );
  }

  return {
    date,
    path: filePath,
    title,
    rawMarkdown: markdown,
    frontmatter,
    sections,
    tasks,
    trackers,
    sourceGaps,
    stats,
    parseWarnings,
  };
}

export function buildCommunicationItems(notes: DailyNote[]) {
  const allItems: CommunicationItem[] = [];
  const sortedNotes = [...notes].sort((a, b) => a.date.localeCompare(b.date));

  for (const note of sortedNotes) {
    for (const task of note.tasks) {
      const item = classifyCommunication({
        sourceId: task.id,
        date: note.date,
        notePath: note.path,
        section: task.section,
        status: task.status,
        title: task.title,
        evidence: task.rawMarkdown,
        lineRange: task.lineRange,
      });
      if (item) allItems.push(item);
    }

    for (const tracker of note.trackers) {
      const item = classifyCommunication({
        sourceId: tracker.id,
        date: note.date,
        notePath: note.path,
        section: tracker.section,
        status: "open",
        title: tracker.title,
        evidence: tracker.rawMarkdown,
        lineRange: tracker.lineRange,
      });
      if (item) allItems.push(item);
    }

    for (const sourceGap of note.sourceGaps) {
      allItems.push({
        id: `comm-${sourceGap.id}`,
        sourceId: sourceGap.id,
        state: "source_gap",
        risk: sourceGap.clean ? "none" : "critical",
        title: sourceGap.title,
        sourceType: "unknown",
        ownerSide: "unknown",
        firstSeen: note.date,
        lastSeen: note.date,
        evidence: sourceGap.rawMarkdown,
        reason: sourceGap.clean ? "Source scan was recorded as clean." : "Source gap was recorded.",
        confidence: "high",
        notePath: note.path,
        section: "source_gap",
        lineRange: sourceGap.lineRange,
      });
    }
  }

  const deduped = new Map<string, CommunicationItem>();
  for (const item of allItems) {
    const key = signatureForCommunication(item);
    const existing = deduped.get(key);
    if (!existing || existing.lastSeen <= item.lastSeen) {
      deduped.set(key, {
        ...item,
        firstSeen: existing?.firstSeen || item.firstSeen || item.lastSeen,
      });
    }
  }

  return [...deduped.values()]
    .map((item) => ({
      ...item,
      ageDays: item.firstSeen ? daysBetween(item.firstSeen, item.lastSeen) : undefined,
    }))
    .sort(compareCommunicationItems);
}

export function attachCommunicationStats(notes: DailyNote[], comms: CommunicationItem[]) {
  const riskByDate = new Map<string, number>();
  for (const comm of comms) {
    if (comm.risk === "none" || comm.state === "closed") continue;
    riskByDate.set(comm.lastSeen, (riskByDate.get(comm.lastSeen) || 0) + 1);
  }

  return notes.map((note) => ({
    ...note,
    stats: {
      ...note.stats,
      commRiskCount: riskByDate.get(note.date) || 0,
    },
  }));
}

function normalizeFrontmatter(
  data: Record<string, unknown>,
  fileDate: string | undefined,
  parseWarnings: string[],
): NoteFrontmatter {
  const parsed = FrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    parseWarnings.push("Frontmatter could not be fully parsed.");
    return { tags: [], date: fileDate };
  }

  const value: ParsedFrontmatter = parsed.data;
  return {
    date: normalizeDate(value.date) || fileDate,
    tags: value.tags,
    type: value.type,
    status: value.status,
    deepWork: value.deep_work,
    completed: value.completed,
    total: value.total,
  };
}

function normalizeDate(value: string | Date | undefined) {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

function extractDateFromPath(filePath: string) {
  return filePath.match(/(\d{4}-\d{2}-\d{2})\.md$/)?.[1];
}

function countFrontmatterLines(markdown: string) {
  const lines = splitLines(markdown);
  if (lines[0]?.trim() !== "---") return 0;
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return endIndex >= 0 ? endIndex + 1 : 0;
}

function parseSections(content: string, lineOffset: number): Section[] {
  const lines = splitLines(content);
  const headingIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (/^##\s+/.test(line)) headingIndexes.push(index);
  });

  return headingIndexes.map((headingIndex, index) => {
    const nextHeading = headingIndexes[index + 1] ?? lines.length;
    const heading = lines[headingIndex].replace(/^##\s+/, "").trim();
    const rawMarkdown = lines
      .slice(headingIndex + 1, nextHeading)
      .join("\n")
      .trimEnd();

    return {
      heading,
      kind: normalizeSectionKind(heading),
      rawMarkdown,
      lineRange: [lineOffset + headingIndex + 1, lineOffset + nextHeading],
    };
  });
}

function normalizeSectionKind(heading: string): SectionKind {
  const normalized = heading
    .toLowerCase()
    .replace(/\s*\(.+\)\s*/g, "")
    .trim();
  if (normalized === "focus") return "focus";
  if (normalized === "tasks") return "tasks";
  if (normalized === "quick") return "quick";
  if (normalized === "inbox") return "inbox";
  if (normalized === "notes") return "notes";
  if (normalized.startsWith("trackers")) return "trackers";
  if (normalized === "parked") return "parked";
  if (normalized === "closed today") return "closed_today";
  if (normalized === "source gap") return "source_gap";
  if (normalized.startsWith("tomorrow")) return "tomorrow";
  if (normalized.startsWith("resume refresh")) return "resume_refresh";
  if (normalized.startsWith("strategy note")) return "strategy_note";
  return "other";
}

function extractTitle(content: string) {
  return splitLines(content)
    .find((line) => /^#\s+/.test(line))
    ?.replace(/^#\s+/, "")
    .trim();
}

function extractTasks(section: Section, date: string): TaskItem[] {
  if (!TASK_SECTION_KINDS.includes(section.kind)) return [];
  const lines = splitLines(section.rawMarkdown);
  const taskStartIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (/^- \[[ xX/-]\]\s+/.test(line)) taskStartIndexes.push(index);
  });

  return taskStartIndexes.map((startIndex, index) => {
    const nextStart = taskStartIndexes[index + 1] ?? lines.length;
    const blockLines = lines.slice(startIndex, nextStart);
    const match = blockLines[0].match(/^- \[([ xX/-])\]\s+(.*)$/);
    const rawTitle = match?.[2]?.trim() || blockLines[0].trim();
    const status = normalizeTaskStatus(match?.[1]);
    const rawMarkdown = blockLines.join("\n").trimEnd();
    const id = `task-${date}-${section.kind}-${index}`;

    return {
      id,
      date,
      section: section.kind,
      sectionHeading: section.heading,
      status,
      title: cleanInlineMarkdown(rawTitle),
      rawTitle,
      rawMarkdown,
      details: extractDetails(blockLines.slice(1)),
      jiraKeys: extractJiraKeys(rawMarkdown),
      links: extractLinks(rawMarkdown),
      ageMarker: extractAgeMarker(rawMarkdown),
      lineRange: [
        section.lineRange[0] + 1 + startIndex,
        section.lineRange[0] + Math.max(startIndex + 1, nextStart),
      ],
    };
  });
}

function normalizeTaskStatus(value: string | undefined): TaskStatus {
  if (value === "x" || value === "X") return "done";
  if (value === "/") return "partial";
  if (value === "-") return "dropped";
  return "open";
}

function extractTrackers(section: Section, date: string): TrackerItem[] {
  if (!TRACKER_SECTION_KINDS.includes(section.kind)) return [];
  const lines = splitLines(section.rawMarkdown);
  const trackerStartIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (/^- (?!\[[ xX/-]\])/.test(line)) trackerStartIndexes.push(index);
  });

  return trackerStartIndexes.map((startIndex, index) => {
    const nextStart = trackerStartIndexes[index + 1] ?? lines.length;
    const blockLines = lines.slice(startIndex, nextStart);
    const rawMarkdown = blockLines.join("\n").trimEnd();
    const rawTitle = blockLines[0].replace(/^- /, "").trim();

    return {
      id: `tracker-${date}-${section.kind}-${index}`,
      date,
      section: section.kind,
      sectionHeading: section.heading,
      title: cleanInlineMarkdown(rawTitle),
      rawMarkdown,
      jiraKeys: extractJiraKeys(rawMarkdown),
      links: extractLinks(rawMarkdown),
      lineRange: [
        section.lineRange[0] + 1 + startIndex,
        section.lineRange[0] + Math.max(startIndex + 1, nextStart),
      ],
    };
  });
}

function extractSourceGaps(section: Section, date: string): SourceGap[] {
  if (section.kind === "source_gap") {
    return sourceGapLines(section.rawMarkdown).map((line, index) => ({
      id: `source-gap-${date}-${index}`,
      date,
      title: cleanInlineMarkdown(line),
      rawMarkdown: line,
      clean: isCleanSourceGap(line),
      lineRange: [section.lineRange[0] + 1 + index, section.lineRange[0] + 1 + index],
    }));
  }

  if (section.kind !== "notes") return [];

  const lines = splitLines(section.rawMarkdown);
  const sourceGapIndex = lines.findIndex((line) => /\*\*source gap/i.test(line));
  if (sourceGapIndex < 0) return [];

  const followingLines = lines
    .slice(sourceGapIndex + 1)
    .filter((line) => line.trim() && !/^\*\*.+\*\*/.test(line.trim()));

  return sourceGapLines(followingLines.join("\n")).map((line, index) => ({
    id: `source-gap-${date}-notes-${index}`,
    date,
    title: cleanInlineMarkdown(line),
    rawMarkdown: line,
    clean: isCleanSourceGap(line),
    lineRange: [
      section.lineRange[0] + 1 + sourceGapIndex + 1 + index,
      section.lineRange[0] + 1 + sourceGapIndex + 1 + index,
    ],
  }));
}

function sourceGapLines(rawMarkdown: string) {
  const lines = splitLines(rawMarkdown)
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean)
    .filter((line) => !/^\*\(mid-day captures/i.test(line));
  return lines.length ? lines : [rawMarkdown.trim()].filter(Boolean);
}

function isCleanSourceGap(text: string) {
  const lower = text.toLowerCase();
  return lower.includes("clean") || lower.includes("reachable") || lower.includes("no gap");
}

function buildStats(tasks: TaskItem[], frontmatter: NoteFrontmatter) {
  const coreTasks = tasks.filter((task) => CORE_SECTION_KINDS.includes(task.section));
  const coreDone = coreTasks.filter((task) => task.status === "done").length;
  const coreTotal = coreTasks.length;

  return {
    coreDone,
    coreTotal,
    coreOpen: coreTasks.filter((task) => task.status === "open" || task.status === "partial")
      .length,
    frontmatterCompleted: frontmatter.completed,
    frontmatterTotal: frontmatter.total,
    completionRate: coreTotal ? Math.round((coreDone / coreTotal) * 100) : 0,
    commRiskCount: 0,
  };
}

type CommunicationCandidate = {
  sourceId: string;
  date: string;
  notePath: string;
  section: SectionKind;
  status: TaskStatus;
  title: string;
  evidence: string;
  lineRange: [number, number];
};

function classifyCommunication(candidate: CommunicationCandidate): CommunicationItem | undefined {
  const text = `${candidate.title}\n${candidate.evidence}`;
  const owedSignal =
    /\b(reply|respond|follow[- ]?up|nudge|ping|send|post|share|forward|comment|outreach|reach out)\b/i.test(
      text,
    ) || /read .*decide/i.test(text);
  const waitingSignal =
    /\b(awaiting|waiting on|waiting for|no repl|silent|pending|passive monitor|monitor for replies|blocked on|unblocks|still hasn't replied)\b/i.test(
      text,
    );
  const sourceSignal = /\b(slack|gmail|email|dm|thread|channel|jira|meeting|calendar|zoom)\b/i.test(
    text,
  );
  const closedSignal = /\b(closed|sent|already sent|acknowledged|resolved|dropped|done)\b/i.test(
    text,
  );
  const suppressed =
    candidate.section === "parked" ||
    /\b(parked|ignored|fyi only|informational|out of carry-forward|deprioritized)\b/i.test(text);

  if (!owedSignal && !waitingSignal && !sourceSignal && !closedSignal) return undefined;

  let state: CommunicationState = "monitor";
  let reason = "Source or coordination wording made this worth monitoring.";
  let confidence: Confidence = sourceSignal ? "medium" : "low";

  if (candidate.status === "done" || candidate.status === "dropped" || closedSignal) {
    state = "closed";
    reason = "Checkbox or wording indicates this communication loop is closed.";
    confidence = "high";
  } else if (suppressed) {
    state = "monitor";
    reason = "Communication wording is present, but the note parks or suppresses active risk.";
    confidence = "medium";
  } else if (waitingSignal) {
    state = "waiting_on_others";
    reason = "Waiting/awaiting/no-reply wording indicates the next move is outside your court.";
    confidence = "high";
  } else if (owedSignal) {
    state = "owed_by_me";
    reason = "Reply/send/post/follow-up wording indicates you owe the next communication.";
    confidence = "high";
  }

  const risk = riskFromText(text, state, suppressed);

  return {
    id: `comm-${candidate.sourceId}`,
    sourceId: candidate.sourceId,
    state,
    risk,
    title: candidate.title,
    sourceType: detectSourceType(text),
    ownerSide: ownerForState(state),
    firstSeen: candidate.date,
    lastSeen: candidate.date,
    evidence: candidate.evidence,
    reason,
    confidence,
    notePath: candidate.notePath,
    section: candidate.section,
    lineRange: candidate.lineRange,
  };
}

function riskFromText(
  text: string,
  state: CommunicationState,
  suppressed: boolean,
): CommunicationRisk {
  if (state === "closed" || suppressed) return "none";
  const age = extractAgeDays(text);
  if (age !== undefined) {
    if (age >= 5) return "critical";
    if (age >= 3) return "warning";
    if (age >= 2) return "stale";
  }
  if (text.includes("\u26A0") || /\boverdue\b/i.test(text)) return "warning";
  return "none";
}

function detectSourceType(text: string): SourceType {
  if (/\b(slack|dm|thread|channel)\b/i.test(text)) return "slack";
  if (/\b(gmail|email)\b/i.test(text)) return "gmail";
  if (/\b(jira|[A-Z][A-Z0-9]+-\d+)\b/i.test(text)) return "jira";
  if (/\b(calendar|zoom|book|schedule|meeting)\b/i.test(text)) return "calendar";
  if (/\bmeeting\b/i.test(text)) return "meeting";
  return "unknown";
}

function ownerForState(state: CommunicationState): OwnerSide {
  if (state === "owed_by_me") return "me";
  if (state === "waiting_on_others") return "other";
  if (state === "closed") return "mixed";
  return "unknown";
}

function compareCommunicationItems(a: CommunicationItem, b: CommunicationItem) {
  const riskOrder: Record<CommunicationRisk, number> = {
    critical: 0,
    warning: 1,
    stale: 2,
    none: 3,
  };
  const stateOrder: Record<CommunicationState, number> = {
    owed_by_me: 0,
    waiting_on_others: 1,
    monitor: 2,
    source_gap: 3,
    closed: 4,
  };

  return (
    riskOrder[a.risk] - riskOrder[b.risk] ||
    stateOrder[a.state] - stateOrder[b.state] ||
    b.lastSeen.localeCompare(a.lastSeen) ||
    a.title.localeCompare(b.title)
  );
}

function signatureForCommunication(item: CommunicationItem) {
  return `${item.sourceType}:${normalizeSignature(item.title)}`;
}

function normalizeSignature(value: string) {
  return value
    .toLowerCase()
    .replace(/\b[A-Z][A-Z0-9]+-\d+\b/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 120);
}

function daysBetween(start: string, end: string) {
  const startDate = Date.parse(`${start}T00:00:00Z`);
  const endDate = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate) || Number.isNaN(endDate)) return undefined;
  return Math.max(0, Math.round((endDate - startDate) / 86_400_000));
}

function extractDetails(lines: string[]) {
  const details: Record<string, string[]> = {};
  for (const line of lines) {
    const match = line.match(/^\s+-\s+([^:]{2,48}):\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim();
    details[key] ||= [];
    details[key].push(cleanInlineMarkdown(match[2].trim()));
  }
  return details;
}

function extractJiraKeys(text: string) {
  return [...new Set(text.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) || [])];
}

function extractLinks(text: string): MarkdownLink[] {
  return [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map((match) => ({
    label: cleanInlineMarkdown(match[1]),
    href: match[2],
  }));
}

function extractAgeMarker(text: string) {
  const match = text.match(/day[-\s]?\d+\+?/i);
  if (match) return match[0];
  if (text.includes("\u26A0")) return "warning";
  return undefined;
}

function extractAgeDays(text: string) {
  const match = text.match(/day[-\s]?(\d+)\+?/i);
  if (!match) return undefined;
  return Number.parseInt(match[1], 10);
}

function cleanInlineMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLines(value: string) {
  return value.split(/\r?\n/);
}
