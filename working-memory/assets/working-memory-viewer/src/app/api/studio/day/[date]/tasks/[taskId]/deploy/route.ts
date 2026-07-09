import { NextResponse } from "next/server";
import { resolveTaskAgentName } from "@/lib/interactive-memory/agent-names";
import {
  agentModelLabel,
  buildAgentRun,
  ClaudeAgentLaunchError,
  launchClaudeAgent,
  parseAgentModel,
} from "@/lib/interactive-memory/agents";
import {
  DaySaveConflictError,
  readExistingDay,
  readPromptSettings,
  saveDay,
} from "@/lib/interactive-memory/fs";
import { assertDateKey } from "@/lib/interactive-memory/paths";
import { renderAgentPrompt } from "@/lib/interactive-memory/prompt";
import { assertLocalOrigin, ForbiddenOriginError } from "@/lib/interactive-memory/route-guards";
import { getAgentCwd, isDirectAgentDeployEnabled } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ date: string; taskId: string }>;
};

type DeployPayload = {
  model?: unknown;
  baseUpdatedAt?: unknown;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { date: rawDate, taskId } = await context.params;
    assertLocalOrigin(request);
    const date = assertDateKey(rawDate);
    const payload = (await request.json().catch(() => ({}))) as DeployPayload;
    const model = parseAgentModel(payload.model);
    if (!model) {
      return NextResponse.json(
        { error: "Invalid agent model. Use haiku, sonnet, or opus." },
        { status: 400 },
      );
    }
    if (!isDirectAgentDeployEnabled()) {
      return NextResponse.json(
        {
          error:
            "Direct agent deploy is disabled. Set WORKING_MEMORY_ENABLE_DIRECT_DEPLOY=true to enable it.",
        },
        { status: 403 },
      );
    }

    const bundle = await readExistingDay(date);
    if (!bundle) {
      return NextResponse.json({ error: "Day archive not found." }, { status: 404 });
    }
    if (
      typeof payload.baseUpdatedAt === "string" &&
      bundle.day.updatedAt !== payload.baseUpdatedAt
    ) {
      return NextResponse.json(
        { error: "A newer version of this day exists. Save or reload before deploying." },
        { status: 409 },
      );
    }

    const task = bundle.day.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    const settings = await readPromptSettings();
    const rendered = renderAgentPrompt(task, settings);
    if (rendered.readiness !== "ready") {
      return NextResponse.json(
        {
          error: "Task is not agent-ready.",
          warnings: rendered.warnings,
        },
        { status: 400 },
      );
    }

    const name = resolveTaskAgentName(task);
    const cwd = getAgentCwd();
    await launchClaudeAgent({
      model,
      name,
      prompt: rendered.text,
      cwd,
    });

    const run = buildAgentRun({
      model,
      name,
      prompt: rendered.text,
      cwd,
    });
    const now = new Date().toISOString();
    const nextDay = {
      ...bundle.day,
      tasks: bundle.day.tasks.map((candidate) =>
        candidate.id === task.id
          ? {
              ...candidate,
              status: "in_progress" as const,
              completedAt: undefined,
              agentRuns: [...(candidate.agentRuns || []), run],
              updatedAt: now,
            }
          : candidate,
      ),
    };
    const saved = await saveDay(date, nextDay, { baseUpdatedAt: bundle.day.updatedAt });

    return NextResponse.json({
      bundle: saved,
      run,
      message: `Deployed ${agentModelLabel(model)} as ${name}.`,
    });
  } catch (error) {
    if (error instanceof ForbiddenOriginError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof DaySaveConflictError) {
      return NextResponse.json(
        {
          error:
            "Agent launched, but the day changed before the app could mark it in progress. Reload the day before deploying again.",
        },
        { status: 409 },
      );
    }
    if (error instanceof ClaudeAgentLaunchError) {
      return NextResponse.json(
        { error: error.stderr.trim() || error.message || "Claude agent failed to launch." },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to deploy agent." },
      { status: 500 },
    );
  }
}
