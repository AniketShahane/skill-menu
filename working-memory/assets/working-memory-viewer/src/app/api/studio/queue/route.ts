import { NextResponse } from "next/server";
import { readQueue } from "@/lib/interactive-memory/queue-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readQueue());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read the monitoring queue." },
      { status: 500 },
    );
  }
}
