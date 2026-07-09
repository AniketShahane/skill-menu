import type { TaskKind, TaskRecord, TicketFields, WorkDepth } from "./types";

// Isomorphic id source: this module is imported by both the server routes and the 'use client'
// studio component, so it cannot use node:crypto (which does not bundle into the client). The Web
// Crypto API is present in the browser and in Node 20+, matching the "wm-<uuid>" id format the
// component already uses today.
function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

// The single TaskRecord constructor shared by the capture modal's manual add and the
// grill create-apply path (spec 6.2). It owns every default NOT sourced from a proposal so
// the two entry points cannot drift: crypto-random id, "todo" status, now timestamps, empty
// sourceRefs/trackerIds/agentRuns, and an unscheduled slot. `normalizeDayPlan` accepts the
// result unchanged and recomputes readiness on save.
export type NewTaskInput = Partial<{
  title: string;
  kind: TaskKind;
  estimateMinutes: number;
  workDepth: WorkDepth;
  agentName: string;
  ticketFields: TicketFields;
}>;

const EMPTY_TICKET_FIELDS: TicketFields = {
  objective: "",
  background: "",
  sourcesOverride: "",
  constraintsNonGoals: "",
  doneWhen: "",
  verification: "",
};

export function buildNewTask(input: NewTaskInput = {}): TaskRecord {
  const now = new Date().toISOString();
  const trimmedAgentName = input.agentName?.trim();
  return {
    id: `wm-${randomUUID()}`,
    title: (input.title ?? "").trim(),
    agentName: trimmedAgentName ? trimmedAgentName : undefined,
    status: "todo",
    kind: input.kind ?? "task",
    estimateMinutes: input.estimateMinutes ?? 30,
    workDepth: input.workDepth ?? "shallow",
    agentReadiness: "warning",
    readinessWarnings: [],
    sourceRefs: [],
    trackerIds: [],
    ticketFields: input.ticketFields ? { ...input.ticketFields } : { ...EMPTY_TICKET_FIELDS },
    agentRuns: [],
    createdAt: now,
    updatedAt: now,
  };
}
