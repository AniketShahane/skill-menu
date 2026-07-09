import type { GrillProposal } from "./grill";
import type { TaskRecord } from "./types";

// Client-side (and unit-tested) diff of a revise proposal against the live task. The proposal
// card renders these marks (spec 7.3 item 5); they are computed here, never self-reported by
// the model. Pure: only type imports.
export type FieldChangeKind = "changed" | "added" | "removed" | "unchanged";

const TICKET_FIELD_KEYS = [
  "objective",
  "background",
  "sourcesOverride",
  "constraintsNonGoals",
  "doneWhen",
  "verification",
] as const;

function normalizeVal(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") return String(value);
  return String(value).trim();
}

function classify(before: unknown, after: unknown): FieldChangeKind {
  const b = normalizeVal(before);
  const a = normalizeVal(after);
  const bEmpty = b.length === 0;
  const aEmpty = a.length === 0;
  if (bEmpty && aEmpty) return "unchanged";
  if (bEmpty) return "added";
  if (aEmpty) return "removed";
  return b === a ? "unchanged" : "changed";
}

export function diffProposalAgainstTask(
  proposal: GrillProposal,
  task: TaskRecord,
): Record<string, FieldChangeKind> {
  const { ticket } = proposal;
  const result: Record<string, FieldChangeKind> = {
    title: classify(task.title, ticket.title),
    kind: classify(task.kind, ticket.kind),
    estimateMinutes: classify(task.estimateMinutes, ticket.estimateMinutes),
    workDepth: classify(task.workDepth, ticket.workDepth),
    // agentName absent in the proposal means "preserve existing" (spec 6.3), so a missing
    // proposal agentName is treated as unchanged rather than a removal.
    agentName:
      ticket.agentName === undefined ? "unchanged" : classify(task.agentName, ticket.agentName),
  };
  for (const key of TICKET_FIELD_KEYS) {
    result[`ticketFields.${key}`] = classify(task.ticketFields?.[key], ticket.ticketFields[key]);
  }
  return result;
}
