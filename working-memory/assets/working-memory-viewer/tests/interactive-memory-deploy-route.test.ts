import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/studio/day/[date]/tasks/[taskId]/deploy/route";
import { resolveTaskAgentName } from "@/lib/interactive-memory/agent-names";
import {
  ClaudeAgentLaunchError,
  hashAgentPrompt,
  launchClaudeAgent,
} from "@/lib/interactive-memory/agents";
import {
  normalizeDayPlan,
  readExistingDay,
  readPromptSettings,
  saveDay,
} from "@/lib/interactive-memory/fs";
import { renderAgentPrompt } from "@/lib/interactive-memory/prompt";
import type { TaskRecord } from "@/lib/interactive-memory/types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/interactive-memory/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/interactive-memory/agents")>();
  return {
    ...actual,
    launchClaudeAgent: vi.fn(),
  };
});

const launchMock = vi.mocked(launchClaudeAgent);

beforeEach(() => {
  launchMock.mockResolvedValue({ stdout: "", stderr: "" });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("working memory deploy route", () => {
  it("rejects invalid models before launching", async () => {
    const response = await deploy("2026-06-26", "task-1", { model: "bogus" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid agent model. Use haiku, sonnet, opus, or fable.",
    });
    expect(launchMock).not.toHaveBeenCalled();
  });

  it("keeps direct deploy disabled by default", async () => {
    const { bundle } = await setupDay({ enableDeploy: false });
    const response = await deploy(bundle.day.date, "task-1", {
      model: "sonnet",
      baseUpdatedAt: bundle.day.updatedAt,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "Direct agent deploy is disabled. Set WORKING_MEMORY_ENABLE_DIRECT_DEPLOY=true to enable it.",
    });
    expect(launchMock).not.toHaveBeenCalled();
  });

  it("rejects non-ready tasks before launching", async () => {
    const { bundle } = await setupDay({
      task: readyTask({
        id: "task-1",
        title: "Incomplete task",
        kind: "focus",
        workDepth: "deep",
        sourceRefs: [],
        ticketFields: {
          objective: "Investigate the issue.",
          background: "",
          constraintsNonGoals: "",
          doneWhen: "",
          verification: "",
        },
      }),
    });

    const response = await deploy(bundle.day.date, "task-1", {
      model: "sonnet",
      baseUpdatedAt: bundle.day.updatedAt,
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ error: "Task is not agent-ready." });
    expect(json.warnings).toContain("missing done when");
    expect(launchMock).not.toHaveBeenCalled();
  });

  it("deploys ready tasks, records run metadata, and marks in progress after launch", async () => {
    const { bundle } = await setupDay();
    vi.stubEnv("WORKING_MEMORY_AGENT_CWD", "/tmp/agent-work");
    const task = bundle.day.tasks[0];
    const settings = await readPromptSettings();
    const expectedPrompt = renderAgentPrompt(task, settings).text;
    const expectedName = resolveTaskAgentName(task);

    const response = await deploy(bundle.day.date, task.id, {
      model: "opus",
      baseUpdatedAt: bundle.day.updatedAt,
    });
    const json = await response.json();
    const saved = await readExistingDay(bundle.day.date);

    expect(response.status).toBe(200);
    expect(launchMock).toHaveBeenCalledWith({
      model: "opus",
      name: expectedName,
      prompt: expectedPrompt,
      cwd: "/tmp/agent-work",
    });
    expect(json.run).toMatchObject({
      model: "opus",
      name: expectedName,
      cwd: "/tmp/agent-work",
      status: "launched",
      promptSha256: hashAgentPrompt(expectedPrompt),
    });
    expect(JSON.stringify(json.run)).not.toContain(expectedPrompt);
    expect(saved?.day.tasks[0].status).toBe("in_progress");
    expect(saved?.day.tasks[0].agentRuns).toHaveLength(1);
    expect(saved?.day.tasks[0].agentRuns?.[0]).toMatchObject({
      model: "opus",
      name: expectedName,
      cwd: "/tmp/agent-work",
      status: "launched",
      promptSha256: hashAgentPrompt(expectedPrompt),
    });
  });

  it("does not update the task when Claude launch fails", async () => {
    launchMock.mockRejectedValueOnce(
      new ClaudeAgentLaunchError("claude --bg exited with status 1", "launch failed"),
    );
    const { bundle } = await setupDay();

    const response = await deploy(bundle.day.date, "task-1", {
      model: "sonnet",
      baseUpdatedAt: bundle.day.updatedAt,
    });
    const saved = await readExistingDay(bundle.day.date);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: "launch failed" });
    expect(saved?.day.tasks[0].status).toBe("todo");
    expect(saved?.day.tasks[0].agentRuns).toBeUndefined();
  });

  it("rejects stale base updates before launching", async () => {
    const { bundle } = await setupDay();

    const response = await deploy(bundle.day.date, "task-1", {
      model: "haiku",
      baseUpdatedAt: "2026-06-26T00:00:00.000Z",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "A newer version of this day exists. Save or reload before deploying.",
    });
    expect(launchMock).not.toHaveBeenCalled();
  });
});

async function setupDay({
  task = readyTask(),
  enableDeploy = true,
}: {
  task?: TaskRecord;
  enableDeploy?: boolean;
} = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-deploy-"));
  vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
  if (enableDeploy) vi.stubEnv("WORKING_MEMORY_ENABLE_DIRECT_DEPLOY", "true");
  const date = "2026-06-26";
  const bundle = await saveDay(
    date,
    normalizeDayPlan({
      date,
      tasks: [task],
    }),
  );
  return { rootDir, bundle };
}

function readyTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "task-1",
    title: "Fix account balance rollup",
    agentName: "fix-account-balance",
    status: "todo",
    kind: "task",
    estimateMinutes: 45,
    workDepth: "deep",
    agentReadiness: "ready",
    readinessWarnings: [],
    project: "analytics",
    sourceRefs: [{ kind: "manual", label: "User-approved source" }],
    ticketFields: {
      objective: "Fix the account balance rollup calculation.",
      background: "The user identified the authoritative fixes branch as the target.",
      constraintsNonGoals: "Do not use the local notebook as the source of truth.",
      doneWhen: "The calculation uses the intended branch and the ticket can be reviewed.",
      verification: "Run the relevant test or query and report the result.",
    },
    createdAt: "2026-06-26T12:00:00Z",
    updatedAt: "2026-06-26T12:00:00Z",
    ...overrides,
  };
}

async function deploy(date: string, taskId: string, payload: Record<string, unknown>) {
  return POST(
    new Request(`http://localhost/api/studio/day/${date}/tasks/${taskId}/deploy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ date, taskId }) },
  );
}
