import { NextResponse } from "next/server";
import { getCurrentStudioResponse } from "@/lib/interactive-memory/fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getCurrentStudioResponse());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load current studio day." },
      { status: 500 },
    );
  }
}
