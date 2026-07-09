import { NextResponse } from "next/server";
import {
  DRAFT_NOW_MESSAGE,
  FORCE_DRAFT_NUDGE,
  isProposalTurn,
  runGrillTurn,
  shouldForceDraft,
} from "@/lib/interactive-memory/grill";
import {
  assertGrillRouteAllowed,
  computeProposalWarnings,
  grillErrorResponse,
  parseAnswerPayload,
  recordTurn,
  requireGrillSession,
} from "@/lib/interactive-memory/grill-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ date: string; grillId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { date: rawDate, grillId } = await context.params;
    const date = assertGrillRouteAllowed(request, rawDate);
    const session = requireGrillSession(date, grillId);

    const payload = await request.json().catch(() => undefined);
    const parsed = parseAnswerPayload(payload);
    if (!parsed) {
      return NextResponse.json(
        { error: "Body must be exactly one of { message } or { draftNow: true }." },
        { status: 400 },
      );
    }

    if (session.busy) {
      return NextResponse.json(
        { error: "A grill turn is already in flight.", code: "turn-in-flight" },
        { status: 409 },
      );
    }
    session.busy = true;
    try {
      let userMessage = "draftNow" in parsed ? DRAFT_NOW_MESSAGE : parsed.message;
      // Pre-proposal round cap: if we have served the cap and still have no proposal, append
      // the force-draft nudge so the model proposes instead of asking again (spec 5). Correction
      // turns after a proposal are exempt because lastProposal is set (shouldForceDraft is false).
      if (shouldForceDraft(session)) {
        userMessage += FORCE_DRAFT_NUDGE;
      }
      const turn = await runGrillTurn({ session, userMessage });
      recordTurn(session, turn);

      const computedWarnings = isProposalTurn(turn)
        ? await computeProposalWarnings(session, turn)
        : undefined;
      return NextResponse.json({ turn, ...(computedWarnings ? { computedWarnings } : {}) });
    } finally {
      session.busy = false;
    }
  } catch (error) {
    const mapped = grillErrorResponse(error);
    if (mapped) return mapped;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to continue grill." },
      { status: 500 },
    );
  }
}
