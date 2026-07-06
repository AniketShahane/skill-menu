import { NextResponse } from "next/server";
import { saveCalendar } from "@/lib/interactive-memory/fs";
import { assertDateKey } from "@/lib/interactive-memory/paths";
import type { CalendarFile } from "@/lib/interactive-memory/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    const safeDate = assertDateKey(date);
    const payload = (await request.json()) as CalendarFile;
    await saveCalendar(safeDate, payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save interactive calendar." },
      { status: 500 },
    );
  }
}
