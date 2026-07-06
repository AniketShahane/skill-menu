import { NextResponse } from "next/server";
import { DaySaveConflictError, readOrCreateDay, saveDay } from "@/lib/interactive-memory/fs";
import { assertDateKey } from "@/lib/interactive-memory/paths";
import type { DayPlan } from "@/lib/interactive-memory/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    const bundle = await readOrCreateDay(assertDateKey(date));
    return NextResponse.json(bundle);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read interactive day." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    const payload = (await request.json()) as DayPlan | { day: DayPlan; baseUpdatedAt?: string };
    const dayPayload = "day" in payload ? payload.day : payload;
    const baseUpdatedAt = "day" in payload ? payload.baseUpdatedAt : undefined;
    const bundle = await saveDay(assertDateKey(date), dayPayload, { baseUpdatedAt });
    return NextResponse.json(bundle);
  } catch (error) {
    if (error instanceof DaySaveConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save interactive day." },
      { status: 500 },
    );
  }
}
