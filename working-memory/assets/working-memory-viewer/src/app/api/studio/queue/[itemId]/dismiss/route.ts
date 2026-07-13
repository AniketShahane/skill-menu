import { NextResponse } from "next/server";
import {
  dismissQueueItem,
  QueueItemNotFoundError,
  QueueItemNotQueuedError,
  QueueSaveConflictError,
} from "@/lib/interactive-memory/queue-store";
import { assertLocalOrigin, ForbiddenOriginError } from "@/lib/interactive-memory/route-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

type DismissPayload = {
  baseUpdatedAt?: unknown;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { itemId } = await context.params;
    assertLocalOrigin(request);
    const payload = (await request.json().catch(() => ({}))) as DismissPayload;
    if (typeof payload.baseUpdatedAt !== "string" || !payload.baseUpdatedAt) {
      return NextResponse.json({ error: "A baseUpdatedAt string is required." }, { status: 400 });
    }
    const queue = await dismissQueueItem(itemId, payload.baseUpdatedAt);
    return NextResponse.json(queue);
  } catch (error) {
    if (error instanceof ForbiddenOriginError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof QueueItemNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof QueueItemNotQueuedError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof QueueSaveConflictError) {
      return NextResponse.json({ error: error.message, code: "queue-conflict" }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to dismiss the queue item." },
      { status: 500 },
    );
  }
}
