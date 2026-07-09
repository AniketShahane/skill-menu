import { NextResponse } from "next/server";
import { readExistingDay, readOrCreateDay, saveDay } from "@/lib/interactive-memory/fs";
import { GrillProposalSchema } from "@/lib/interactive-memory/grill";
import {
  applyProposal,
  assertGrillRouteAllowed,
  buildTaskFromProposal,
  deepEqual,
  grillErrorResponse,
  requireGrillSession,
} from "@/lib/interactive-memory/grill-routes";
import type { DayPlan, TaskRecord } from "@/lib/interactive-memory/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ date: string; grillId: string }>;
};

type ApplyPayload = {
  proposal?: unknown;
  acknowledgeTaskUpdatedAt?: unknown;
};

function findTask(day: DayPlan, taskId: string): TaskRecord | undefined {
  return day.tasks.find((candidate) => candidate.id === taskId);
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { date: rawDate, grillId } = await context.params;
    const date = assertGrillRouteAllowed(request, rawDate);
    const session = requireGrillSession(date, grillId);

    // Tombstone replay (spec 6.2): a retry after a response timeout or a double-click returns
    // the SAME success (the created/updated task) instead of 410, preventing duplicate tickets.
    if (session.appliedTombstone) {
      const { taskId } = session.appliedTombstone;
      const bundle = await readExistingDay(date);
      const task = bundle ? findTask(bundle.day, taskId) : undefined;
      return NextResponse.json({ task, day: bundle?.day });
    }

    if (session.busy) {
      return NextResponse.json(
        { error: "A grill turn is already in flight.", code: "turn-in-flight" },
        { status: 409 },
      );
    }
    session.busy = true;
    try {
      const payload = (await request.json().catch(() => ({}))) as ApplyPayload;
      const parsedProposal = GrillProposalSchema.safeParse(payload.proposal);
      if (
        !parsedProposal.success ||
        !session.lastProposal ||
        !deepEqual(parsedProposal.data, session.lastProposal)
      ) {
        return NextResponse.json(
          {
            error: "The proposal being applied is not the session's current proposal.",
            code: "proposal-stale",
          },
          { status: 409 },
        );
      }
      const proposal = parsedProposal.data;

      if (session.mode === "create" || !session.taskId) {
        const bundle = await readOrCreateDay(date);
        const task = buildTaskFromProposal(proposal);
        const nextDay: DayPlan = {
          ...bundle.day,
          tasks: [task, ...bundle.day.tasks],
        };
        const saved = await saveDay(date, nextDay, { baseUpdatedAt: bundle.day.updatedAt });
        session.appliedTombstone = { taskId: task.id };
        return NextResponse.json({ task: findTask(saved.day, task.id), day: saved.day });
      }

      // Revise mode.
      const bundle = await readExistingDay(date);
      const currentTask = bundle ? findTask(bundle.day, session.taskId) : undefined;
      if (!bundle || !currentTask) {
        return NextResponse.json({ error: "Task no longer exists." }, { status: 404 });
      }

      if (currentTask.updatedAt !== session.taskUpdatedAtAtStart) {
        const acknowledged =
          typeof payload.acknowledgeTaskUpdatedAt === "string" &&
          payload.acknowledgeTaskUpdatedAt === currentTask.updatedAt;
        if (!acknowledged) {
          return NextResponse.json(
            {
              error: "The task changed since this grill started.",
              code: "task-changed",
              freshTask: currentTask,
            },
            { status: 409 },
          );
        }
      }

      // Kind is frozen in revise (spec 2.5 / 6.3): the model must echo the existing kind.
      if (proposal.ticket.kind !== currentTask.kind) {
        return NextResponse.json(
          { error: "A task's kind cannot be changed by grilling.", code: "kind-mismatch" },
          { status: 400 },
        );
      }

      const merged = applyProposal(currentTask, proposal);
      const nextDay: DayPlan = {
        ...bundle.day,
        tasks: bundle.day.tasks.map((candidate) =>
          candidate.id === session.taskId ? merged : candidate,
        ),
      };
      const saved = await saveDay(date, nextDay, { baseUpdatedAt: bundle.day.updatedAt });
      session.appliedTombstone = { taskId: currentTask.id };
      return NextResponse.json({ task: findTask(saved.day, currentTask.id), day: saved.day });
    } finally {
      session.busy = false;
    }
  } catch (error) {
    const mapped = grillErrorResponse(error);
    if (mapped) return mapped;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to apply proposal." },
      { status: 500 },
    );
  }
}
