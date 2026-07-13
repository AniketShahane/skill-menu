import "server-only";

import { NextResponse } from "next/server";
import { isGrillEnabled } from "@/lib/runtime-config";
import { DaySaveConflictError, readExistingDay } from "./fs";
import {
  ClaudeAuthError,
  ClaudeBinMissingError,
  GrillDisabledError,
  GrillExpiredError,
  type GrillProposal,
  GrillSchemaError,
  type GrillSession,
  GrillTimeoutError,
  type GrillTurn,
  getGrillSessions,
  isProposalTurn,
  isQuestionsTurn,
  pruneExpiredGrillSessions,
} from "./grill";
import { assertDateKey } from "./paths";
import { getPromptWarnings } from "./prompt";
import { assertLocalOrigin, ForbiddenOriginError } from "./route-guards";
import { buildNewTask } from "./task-factory";
import type { QueueItem, TaskRecord } from "./types";

// Shared guard for every grill route (spec 6.2): feature flag, then the local-origin check,
// then day-key validation. Throws typed errors mapped by grillErrorResponse(); assertDateKey's
// plain Error falls through to the route's generic catch-all, matching the day/calendar routes.
export function assertGrillRouteAllowed(request: Request, rawDate: string): string {
  if (!isGrillEnabled()) {
    throw new GrillDisabledError();
  }
  assertLocalOrigin(request);
  return assertDateKey(rawDate);
}

// Revise double-start check: is there already a LIVE session grilling this task? A session that
// has already applied (appliedTombstone set) is skipped: the tombstone exists only to serve apply
// replays until the TTL reap, so it must not block a fresh revise grill on the same task after a
// successful apply.
export function findLiveGrillSessionForTask(
  date: string,
  taskId: string,
): GrillSession | undefined {
  pruneExpiredGrillSessions();
  for (const session of getGrillSessions().values()) {
    if (
      session.date === date &&
      session.mode === "revise" &&
      session.taskId === taskId &&
      !session.appliedTombstone
    ) {
      return session;
    }
  }
  return undefined;
}

// grillId-keyed lookup (v2). The date must match the session's date; taskId is no longer part
// of the key (create sessions have no task until apply).
export function requireGrillSession(date: string, grillId: string): GrillSession {
  pruneExpiredGrillSessions();
  const session = getGrillSessions().get(grillId);
  if (!session || session.date !== date) {
    throw new GrillExpiredError();
  }
  return session;
}

export function deleteGrillSession(grillId: string) {
  getGrillSessions().delete(grillId);
}

// Answer payload must be EXACTLY ONE of { message } (non-empty after trim) or { draftNow: true }
// (spec 6.2). Anything else is null, which the route maps to 400.
export function parseAnswerPayload(raw: unknown): { message: string } | { draftNow: true } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const hasMessage = Object.hasOwn(record, "message");
  const hasDraftNow = Object.hasOwn(record, "draftNow");
  if (hasMessage === hasDraftNow) return null; // neither, or both
  if (hasDraftNow) {
    return record.draftNow === true ? { draftNow: true } : null;
  }
  if (typeof record.message !== "string") return null;
  const trimmed = record.message.trim();
  if (trimmed.length === 0) return null;
  return { message: trimmed };
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => deepEqual(value, right[index]));
  }
  if (typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left as Record<string, unknown>);
    const rightKeys = Object.keys(right as Record<string, unknown>);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every(
      (key) =>
        Object.hasOwn(right as Record<string, unknown>, key) &&
        deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
    );
  }
  return false;
}

// Records a completed turn on the session (spec 6.2 bookkeeping): stash the turn for GET
// re-sync, remember a proposal for the echo guard + force-draft gate, and count pre-proposal
// question rounds. A questions turn AFTER a proposal (an ambiguous-correction clarifier) does
// not count and does not re-arm force-draft, because lastProposal is already set.
export function recordTurn(session: GrillSession, turn: GrillTurn) {
  session.lastTurn = turn;
  if (isProposalTurn(turn)) {
    session.lastProposal = turn;
  } else if (isQuestionsTurn(turn) && !session.lastProposal) {
    session.questionRounds += 1;
  }
  session.lastActivityAt = Date.now();
}

// Seeds a create grill started from a monitoring-queue candidate (spec 6). The candidate's title,
// summary, harvested context, and sourceRefs are folded into the create-mode `intent` so they flow
// through the EXISTING create session-start pathway (buildGrillSystemPrompt's USER INTENT channel);
// no second session type is introduced. An optional user-typed note is appended below.
export function buildQueueGrillIntent(item: QueueItem, userIntent?: string): string {
  const lines: string[] = ["Candidate captured by the continuous monitoring queue."];
  lines.push("", `Title: ${item.title}`);
  if (item.summary.trim()) lines.push("", `Summary: ${item.summary.trim()}`);
  if (item.harvestedContext.trim()) {
    lines.push("", "Harvested context:", item.harvestedContext.trim());
  }
  if (item.sourceRefs.length > 0) {
    lines.push("", "Sources:");
    for (const source of item.sourceRefs) {
      lines.push(
        source.url
          ? `- ${source.kind}: ${source.label} (${source.url})`
          : `- ${source.kind}: ${source.label}`,
      );
    }
  }
  const trimmedUserIntent = userIntent?.trim();
  if (trimmedUserIntent) {
    lines.push("", "Additional note from me:", trimmedUserIntent);
  }
  return lines.join("\n");
}

// Create-apply constructor: a brand-new task from the approved proposal, via the shared
// buildNewTask so it cannot drift from the capture modal.
export function buildTaskFromProposal(proposal: GrillProposal): TaskRecord {
  return buildNewTask({
    title: proposal.ticket.title,
    kind: proposal.ticket.kind,
    estimateMinutes: proposal.ticket.estimateMinutes,
    workDepth: proposal.ticket.workDepth,
    agentName: proposal.ticket.agentName,
    ticketFields: proposal.ticket.ticketFields,
  });
}

// Revise-apply: full-body replace (spec 6.3). Replaces title, estimate, work depth, agentName
// (absent in the proposal preserves the existing one), and ALL ticketFields. Preserves id, kind,
// createdAt, status, schedule, sourceRefs, trackerIds, agentRuns, completedAt. saveDay bumps
// updatedAt and recomputes readiness via normalizeDayPlan.
export function applyProposal(task: TaskRecord, proposal: GrillProposal): TaskRecord {
  return {
    ...task,
    title: proposal.ticket.title,
    estimateMinutes: proposal.ticket.estimateMinutes,
    workDepth: proposal.ticket.workDepth,
    agentName: proposal.ticket.agentName ?? task.agentName,
    ticketFields: { ...proposal.ticket.ticketFields },
    updatedAt: new Date().toISOString(),
  };
}

// Server-computed readiness chips for a proposal turn (spec 6.2): build the hypothetical task
// (create: shared constructor; revise: applyProposal onto the current task, not persisted) and
// run the existing getPromptWarnings. Read-only; never writes a day file.
export async function computeProposalWarnings(
  session: GrillSession,
  proposal: GrillProposal,
): Promise<string[]> {
  if (session.mode === "create" || !session.taskId) {
    return getPromptWarnings(buildTaskFromProposal(proposal));
  }
  const bundle = await readExistingDay(session.date);
  const currentTask = bundle?.day.tasks.find((candidate) => candidate.id === session.taskId);
  if (!currentTask) {
    return getPromptWarnings(buildTaskFromProposal(proposal));
  }
  return getPromptWarnings(applyProposal(currentTask, proposal));
}

export function grillErrorResponse(error: unknown): NextResponse | undefined {
  if (error instanceof GrillDisabledError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ForbiddenOriginError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ClaudeBinMissingError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof ClaudeAuthError) {
    return NextResponse.json({ error: error.message, stderr: error.stderr }, { status: 502 });
  }
  if (error instanceof GrillTimeoutError) {
    return NextResponse.json({ error: error.message }, { status: 504 });
  }
  if (error instanceof GrillSchemaError) {
    return NextResponse.json(
      { error: error.message, stdoutTail: error.stdoutTail, stderrTail: error.stderrTail },
      { status: 502 },
    );
  }
  if (error instanceof GrillExpiredError) {
    return NextResponse.json({ error: error.message }, { status: 410 });
  }
  if (error instanceof DaySaveConflictError) {
    return NextResponse.json({ error: error.message, code: "day-conflict" }, { status: 409 });
  }
  return undefined;
}
