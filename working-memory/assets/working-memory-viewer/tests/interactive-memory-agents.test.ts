import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveTaskAgentName,
  sanitizeAgentName,
  suggestAgentName,
} from "@/lib/interactive-memory/agent-names";
import {
  buildAgentRun,
  buildClaudeAgentArgs,
  createAgentName,
  hashAgentPrompt,
  launchClaudeAgent,
  parseAgentModel,
} from "@/lib/interactive-memory/agents";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("interactive memory Claude agent helpers", () => {
  it("accepts only supported agent models", () => {
    expect(parseAgentModel("haiku")).toBe("haiku");
    expect(parseAgentModel("sonnet")).toBe("sonnet");
    expect(parseAgentModel("opus")).toBe("opus");
    expect(parseAgentModel("gpt-5")).toBeUndefined();
    expect(parseAgentModel(undefined)).toBeUndefined();
  });

  it("builds a safe Claude argument vector with the prompt as one argument", () => {
    expect(
      buildClaudeAgentArgs({
        model: "sonnet",
        name: "wm-task",
        prompt: "Actual prompt with spaces && shell-looking text",
      }),
    ).toEqual([
      "--bg",
      "--model",
      "sonnet",
      "--name",
      "wm-task",
      "Actual prompt with spaces && shell-looking text",
    ]);
  });

  it("creates concise, bounded, slugged agent names", () => {
    const name = createAgentName({
      id: "wm-20260626-Fix Thing",
      title: "Fix account balance rollup on the fixes branch!!!",
    });

    expect(name).toBe("fix-account-balance");
    expect(name).not.toMatch(/[^a-z0-9-]/);
    expect(name.length).toBeLessThanOrEqual(48);
  });

  it("sanitizes stored agent names", () => {
    expect(sanitizeAgentName(" Fix: Account Balance && rm -rf / ")).toBe("fix-account-balance-rm-rf");
    expect(sanitizeAgentName("----")).toBe("");
    expect(sanitizeAgentName("a".repeat(80))).toHaveLength(48);
  });

  it("suggests readable names from task context", () => {
    expect(
      suggestAgentName({
        title: "Fix account balance rollup",
        sourceRefs: [],
        ticketFields: {
          objective: "Fix the account balance rollup calculation.",
          background: "",
          constraintsNonGoals: "",
          doneWhen: "The balance is fixed.",
          verification: "",
        },
      }),
    ).toBe("fix-account-balance");

    expect(
      suggestAgentName({
        title: "Launch 1yr ETL for 5 tables + push schema changes",
        project: "data pipeline",
        sourceRefs: [],
        ticketFields: {
          objective: "Backfill the ETL staging tables.",
          background: "",
          constraintsNonGoals: "",
          doneWhen: "Backfill is running.",
          verification: "",
        },
      }),
    ).toContain("etl");

    expect(
      suggestAgentName({
        title: "Fix account balance rollup",
        sourceRefs: [{ kind: "jira", label: "Jira: PROJ-1047" }],
        ticketFields: {
          objective: "Fix account balance rollup.",
          background: "",
          constraintsNonGoals: "",
          doneWhen: "The balance is fixed.",
          verification: "",
        },
      }),
    ).toBe("proj-1047-fix-account");
  });

  it("resolves stored names before generated fallback names", () => {
    expect(
      resolveTaskAgentName({
        id: "task-1",
        title: "Long noisy title",
        agentName: "Clean Name",
        sourceRefs: [],
        ticketFields: {
          objective: "Do the work.",
          background: "",
          constraintsNonGoals: "",
          doneWhen: "Done.",
          verification: "",
        },
      }),
    ).toBe("clean-name");
  });

  it("stores only hashed prompt metadata in agent run records", () => {
    vi.stubEnv("WORKING_MEMORY_AGENT_CWD", "/tmp/agent-work");
    const prompt = "Full prompt should not be stored.";
    const run = buildAgentRun({
      model: "opus",
      name: "wm-task",
      prompt,
      launchedAt: "2026-06-26T12:00:00Z",
    });

    expect(run).toMatchObject({
      model: "opus",
      name: "wm-task",
      cwd: "/tmp/agent-work",
      launchedAt: "2026-06-26T12:00:00Z",
      status: "launched",
      promptSha256: createHash("sha256").update(prompt).digest("hex"),
    });
    expect(JSON.stringify(run)).not.toContain(prompt);
    expect(hashAgentPrompt(prompt)).toBe(run.promptSha256);
  });

  it("launches Claude without a shell from the configured cwd", async () => {
    vi.stubEnv("WORKING_MEMORY_AGENT_CWD", "/tmp/agent-work");
    type SpawnImpl = NonNullable<Parameters<typeof launchClaudeAgent>[1]>;
    let captured:
      | {
          command: string;
          args: string[];
          options: Record<string, unknown>;
        }
      | undefined;
    const spawnImpl = ((command: string, args: string[], options: Record<string, unknown>) => {
      captured = { command, args, options };
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.stdout.emit("data", "launched");
        child.emit("close", 0);
      });
      return child;
    }) as SpawnImpl;

    await expect(
      launchClaudeAgent(
        {
          model: "haiku",
          name: "wm-task",
          prompt: "Do the task.",
        },
        spawnImpl,
      ),
    ).resolves.toEqual({ stdout: "launched", stderr: "" });

    expect(captured).toEqual({
      command: "claude",
      args: ["--bg", "--model", "haiku", "--name", "wm-task", "Do the task."],
      options: {
        cwd: "/tmp/agent-work",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    });
  });

  it("launches the configured WORKING_MEMORY_CLAUDE_BIN override instead of the bare command", async () => {
    vi.stubEnv("WORKING_MEMORY_CLAUDE_BIN", "/usr/local/share/npm-global/bin/claude");
    type SpawnImpl = NonNullable<Parameters<typeof launchClaudeAgent>[1]>;
    let capturedCommand: string | undefined;
    const spawnImpl = ((command: string) => {
      capturedCommand = command;
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.emit("close", 0);
      });
      return child;
    }) as SpawnImpl;

    await launchClaudeAgent({ model: "haiku", name: "wm-task", prompt: "Do the task." }, spawnImpl);

    expect(capturedCommand).toBe("/usr/local/share/npm-global/bin/claude");
  });

  it("surfaces a clear, actionable error when the claude binary cannot be found", async () => {
    type SpawnImpl = NonNullable<Parameters<typeof launchClaudeAgent>[1]>;
    const spawnImpl = ((_command: string, _args: string[], _options: Record<string, unknown>) => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        const error = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        child.emit("error", error);
      });
      return child;
    }) as SpawnImpl;

    await expect(
      launchClaudeAgent({ model: "haiku", name: "wm-task", prompt: "Do the task." }, spawnImpl),
    ).rejects.toThrow(/WORKING_MEMORY_CLAUDE_BIN/);
  });
});
