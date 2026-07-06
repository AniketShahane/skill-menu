import type { SourceRef, TaskRecord, TicketFields } from "./types";

export const MAX_AGENT_NAME_LENGTH = 48;

const FILLER_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "please",
  "project",
  "projects",
  "task",
  "the",
  "thing",
  "ticket",
  "today",
  "to",
  "work",
]);

type NameableTask = {
  id?: string;
  title: string;
  agentName?: string;
  project?: string;
  sourceRefs?: SourceRef[];
  ticketFields?: Partial<TicketFields>;
};

type SuggestibleTask = Pick<TaskRecord, "title"> & {
  project?: string;
  sourceRefs?: SourceRef[];
  ticketFields?: Partial<TicketFields>;
};

export function sanitizeAgentName(value: string, maxLength = MAX_AGENT_NAME_LENGTH) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, maxLength).replace(/-+$/g, "");
}

export function suggestAgentName(task: SuggestibleTask) {
  const sourceKey = firstJiraKey(task.sourceRefs || []);
  const tokens = usefulNameTokens(
    sourceKey
      ? [task.title, task.ticketFields?.objective || "", task.project || ""].join(" ")
      : [task.project || "", task.title, task.ticketFields?.objective || ""].join(" "),
  );
  const keyTokens = sourceKey ? [sourceKey] : [];
  const selectedTokens = [...keyTokens, ...tokens].slice(0, 3);
  if (!sourceKey && tokens.includes("etl") && !selectedTokens.includes("etl")) {
    selectedTokens.splice(-1, 1, "etl");
  }
  return sanitizeAgentName(selectedTokens.join("-")) || "working-memory-task";
}

export function resolveTaskAgentName(task: NameableTask) {
  return (
    sanitizeAgentName(task.agentName || "") ||
    suggestAgentName(task) ||
    sanitizeAgentName(task.id || "") ||
    "working-memory-task"
  );
}

function firstJiraKey(sourceRefs: SourceRef[]) {
  for (const source of sourceRefs) {
    const match = source.label.match(/\b[A-Z][A-Z0-9]+-\d+\b/i);
    if (match) return match[0].toLowerCase();
  }
  return undefined;
}

function usefulNameTokens(text: string) {
  const tokens = sanitizeAgentName(text, 140).split("-").filter(Boolean);
  const uniqueTokens: string[] = [];
  for (const token of tokens) {
    if (FILLER_WORDS.has(token)) continue;
    if (uniqueTokens.includes(token)) continue;
    uniqueTokens.push(token);
  }
  return uniqueTokens;
}
