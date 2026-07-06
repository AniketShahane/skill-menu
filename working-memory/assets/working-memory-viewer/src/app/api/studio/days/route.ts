import { NextResponse } from "next/server";
import { listInteractiveDays } from "@/lib/interactive-memory/fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const days = await listInteractiveDays();
    return NextResponse.json({ days });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list interactive days." },
      { status: 500 },
    );
  }
}
