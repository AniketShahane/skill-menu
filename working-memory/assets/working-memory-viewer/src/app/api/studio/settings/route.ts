import { NextResponse } from "next/server";
import {
  PromptSettingsSaveConflictError,
  readPromptSettingsWithWarning,
  savePromptSettings,
} from "@/lib/interactive-memory/fs";
import { validatePromptTemplate } from "@/lib/interactive-memory/prompt";
import type { PromptSettings } from "@/lib/interactive-memory/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readPromptSettingsWithWarning());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load prompt settings." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as PromptSettings;
    const settings = await savePromptSettings(payload);
    return NextResponse.json({
      settings,
      warnings: validatePromptTemplate(settings.promptTemplate),
    });
  } catch (error) {
    if (error instanceof PromptSettingsSaveConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save prompt settings." },
      { status: 500 },
    );
  }
}
