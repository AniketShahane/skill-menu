import { NextResponse } from "next/server";
import { isProposalTurn } from "@/lib/interactive-memory/grill";
import {
  assertGrillRouteAllowed,
  computeProposalWarnings,
  deleteGrillSession,
  grillErrorResponse,
  requireGrillSession,
} from "@/lib/interactive-memory/grill-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ date: string; grillId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { date: rawDate, grillId } = await context.params;
    const date = assertGrillRouteAllowed(request, rawDate);
    const session = requireGrillSession(date, grillId);

    const turn = session.lastTurn;
    const computedWarnings =
      turn && isProposalTurn(turn) ? await computeProposalWarnings(session, turn) : undefined;

    return NextResponse.json({
      grillId: session.grillId,
      mode: session.mode,
      ...(session.taskId ? { taskId: session.taskId } : {}),
      busy: session.busy,
      turn,
      ...(computedWarnings ? { computedWarnings } : {}),
      ...(session.appliedTombstone ? { applied: session.appliedTombstone } : {}),
    });
  } catch (error) {
    const mapped = grillErrorResponse(error);
    if (mapped) return mapped;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read grill session." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { date: rawDate, grillId } = await context.params;
    const date = assertGrillRouteAllowed(request, rawDate);

    const session = requireGrillSession(date, grillId);
    deleteGrillSession(session.grillId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Discarding an already-gone session is not an error worth surfacing to the client.
    if (error instanceof Error && error.name === "GrillExpiredError") {
      return NextResponse.json({ ok: true });
    }
    const mapped = grillErrorResponse(error);
    if (mapped) return mapped;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel grill." },
      { status: 500 },
    );
  }
}
