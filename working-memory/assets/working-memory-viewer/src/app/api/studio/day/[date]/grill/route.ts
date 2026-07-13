import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readExistingDay } from "@/lib/interactive-memory/fs";
import {
  assertReviseFirstTurn,
  buildGrillSystemPrompt,
  GrillSchemaError,
  type GrillSession,
  getGrillSessions,
  isProposalTurn,
  runGrillTurn,
} from "@/lib/interactive-memory/grill";
import {
  assertGrillRouteAllowed,
  buildQueueGrillIntent,
  computeProposalWarnings,
  deleteGrillSession,
  findLiveGrillSessionForTask,
  grillErrorResponse,
  recordTurn,
} from "@/lib/interactive-memory/grill-routes";
import { readQueue } from "@/lib/interactive-memory/queue-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ date: string }>;
};

type StartPayload = {
  mode?: unknown;
  intent?: unknown;
  taskId?: unknown;
  restart?: unknown;
  queueItemId?: unknown;
};

const REVISE_KICKOFF =
  "Review the current ticket. Give your short read of it in the note, then ask which parts are wrong.";

const REVISE_NOTE_CORRECTION =
  "Your first reply must carry a short read of the current ticket in the note field, then ask which parts are wrong. Reply again with ONLY valid JSON matching the turn schema.";

export async function POST(request: Request, context: RouteContext) {
  try {
    const { date: rawDate } = await context.params;
    const date = assertGrillRouteAllowed(request, rawDate);
    const payload = (await request.json().catch(() => ({}))) as StartPayload;

    if (payload.mode === "create") {
      const userIntent = typeof payload.intent === "string" ? payload.intent.trim() : "";
      let intent = userIntent;
      let queueItemId: string | undefined;

      // Grill-from-queue seeding (spec 6): when a queueItemId is present, require the item is
      // `queued` (404 unknown, 409 not queued) and fold its title/summary/harvestedContext/
      // sourceRefs into the create-mode intent so the model's first round sees it as originating
      // context. The lookup runs BEFORE the session is registered so a 404/409 leaks nothing.
      const rawQueueItemId =
        typeof payload.queueItemId === "string" ? payload.queueItemId.trim() : "";
      if (rawQueueItemId) {
        const queue = await readQueue();
        const item = queue.items.find((candidate) => candidate.id === rawQueueItemId);
        if (!item) {
          return NextResponse.json({ error: "Queue item not found." }, { status: 404 });
        }
        if (item.status !== "queued") {
          return NextResponse.json(
            { error: "Queue item is not queued.", code: "not-queued" },
            { status: 409 },
          );
        }
        queueItemId = item.id;
        intent = buildQueueGrillIntent(item, userIntent);
      }

      if (!intent) {
        return NextResponse.json({ error: "A non-empty intent is required." }, { status: 400 });
      }

      const grillId = randomUUID();
      const now = Date.now();
      const session: GrillSession = {
        grillId,
        date,
        mode: "create",
        ...(queueItemId ? { queueItemId } : {}),
        questionRounds: 0,
        busy: true,
        createdAt: now,
        lastActivityAt: now,
      };
      // Register the (busy) session BEFORE the first turn so a concurrent start cannot slip
      // through the busy/turn lock during the first-turn window (spec 6.2). A failed first turn
      // deletes it in the catch, so nothing leaks (the 502 tests assert an empty registry).
      getGrillSessions().set(grillId, session);
      const systemPrompt = buildGrillSystemPrompt({ mode: "create", intent });
      try {
        const turn = await runGrillTurn({ session, userMessage: intent, systemPrompt });
        session.busy = false;
        recordTurn(session, turn);

        const computedWarnings = isProposalTurn(turn)
          ? await computeProposalWarnings(session, turn)
          : undefined;
        return NextResponse.json({
          grillId,
          turn,
          ...(computedWarnings ? { computedWarnings } : {}),
        });
      } catch (error) {
        deleteGrillSession(grillId);
        throw error;
      }
    }

    if (payload.mode === "revise") {
      const taskId = typeof payload.taskId === "string" ? payload.taskId : "";
      if (!taskId) {
        return NextResponse.json({ error: "A taskId is required for revise." }, { status: 400 });
      }
      const restart = payload.restart === true;

      // Close the revise double-start TOCTOU (finding 1): the live-session check and the
      // registration of the new (busy) session run in ONE synchronous block with no await between
      // them, so two concurrent revise starts on the same task cannot both pass the check. Reading
      // the day and running the first CLI turn happen AFTER the session is already registered and
      // visible to findLiveGrillSessionForTask. Any first-turn failure (missing task, persistent
      // revise-note miss, engine error) deletes the session in the catch, so nothing leaks.
      const existing = findLiveGrillSessionForTask(date, taskId);
      if (existing) {
        if (!restart) {
          return NextResponse.json(
            {
              error: "A grill is already running for this task.",
              code: "session-exists",
              grillId: existing.grillId,
            },
            { status: 409 },
          );
        }
        // Never tear down a session mid-turn on restart (spec 6.2 turn lock): make the caller wait.
        if (existing.busy) {
          return NextResponse.json(
            { error: "A grill turn is already in flight.", code: "turn-in-flight" },
            { status: 409 },
          );
        }
        deleteGrillSession(existing.grillId);
      }

      const grillId = randomUUID();
      const now = Date.now();
      const session: GrillSession = {
        grillId,
        date,
        mode: "revise",
        taskId,
        questionRounds: 0,
        busy: true,
        createdAt: now,
        lastActivityAt: now,
      };
      getGrillSessions().set(grillId, session);

      try {
        const bundle = await readExistingDay(date);
        const task = bundle?.day.tasks.find((candidate) => candidate.id === taskId);
        if (!bundle || !task) {
          deleteGrillSession(grillId);
          return NextResponse.json({ error: "Task not found." }, { status: 404 });
        }
        session.taskUpdatedAtAtStart = task.updatedAt;

        const systemPrompt = buildGrillSystemPrompt({ mode: "revise", task });
        let turn = await runGrillTurn({ session, userMessage: REVISE_KICKOFF, systemPrompt });
        // Revise turn-1 note enforcement (spec 6.1): a questions turn must carry the model's
        // short read of the ticket. On a miss, send ONE standard corrective re-ask (the CLI
        // session resumes via the claudeSessionId set on turn 1) and re-enforce; a second miss
        // rethrows the GrillSchemaError, which the outer catch maps to 502.
        try {
          assertReviseFirstTurn(turn);
        } catch (noteError) {
          if (!(noteError instanceof GrillSchemaError)) throw noteError;
          turn = await runGrillTurn({ session, userMessage: REVISE_NOTE_CORRECTION });
          assertReviseFirstTurn(turn);
        }
        session.busy = false;
        recordTurn(session, turn);

        const computedWarnings = isProposalTurn(turn)
          ? await computeProposalWarnings(session, turn)
          : undefined;
        return NextResponse.json({
          grillId,
          turn,
          ...(computedWarnings ? { computedWarnings } : {}),
        });
      } catch (error) {
        deleteGrillSession(grillId);
        throw error;
      }
    }

    return NextResponse.json({ error: "Unknown grill mode." }, { status: 400 });
  } catch (error) {
    const mapped = grillErrorResponse(error);
    if (mapped) return mapped;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start grill." },
      { status: 500 },
    );
  }
}
