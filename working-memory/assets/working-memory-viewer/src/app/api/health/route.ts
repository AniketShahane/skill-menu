import { NextResponse } from "next/server";
import { getWorkingMemoryDataset } from "@/lib/working-memory/fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dataset = await getWorkingMemoryDataset();
    return NextResponse.json(dataset.health);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown health check error",
      },
      { status: 500 },
    );
  }
}
