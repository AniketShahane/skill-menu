import "server-only";

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { getAgentCwd, getClaudeBin } from "@/lib/runtime-config";
import { resolveTaskAgentName } from "./agent-names";
import type { AgentModel, AgentRun, TaskRecord } from "./types";

export const AGENT_MODELS: AgentModel[] = ["haiku", "sonnet", "opus"];

type SpawnLike = typeof spawn;

export type ClaudeLaunchRequest = {
  model: AgentModel;
  name: string;
  prompt: string;
  cwd?: AgentRun["cwd"];
};

export type ClaudeLaunchResult = {
  stdout: string;
  stderr: string;
};

export class ClaudeAgentLaunchError extends Error {
  stderr: string;

  constructor(message: string, stderr = "") {
    super(message);
    this.name = "ClaudeAgentLaunchError";
    this.stderr = stderr;
  }
}

export function parseAgentModel(value: unknown): AgentModel | undefined {
  return typeof value === "string" && AGENT_MODELS.includes(value as AgentModel)
    ? (value as AgentModel)
    : undefined;
}

export function agentModelLabel(model: AgentModel) {
  return model.charAt(0).toUpperCase() + model.slice(1);
}

export function createAgentName(task: Pick<TaskRecord, "id" | "title">) {
  return resolveTaskAgentName({
    id: task.id,
    title: task.title,
    sourceRefs: [],
    ticketFields: undefined,
  });
}

export function hashAgentPrompt(prompt: string) {
  return createHash("sha256").update(prompt).digest("hex");
}

export function buildClaudeAgentArgs(request: ClaudeLaunchRequest) {
  return ["--bg", "--model", request.model, "--name", request.name, request.prompt];
}

export function buildAgentRun({
  model,
  name,
  prompt,
  cwd = getAgentCwd(),
  launchedAt = new Date().toISOString(),
}: {
  model: AgentModel;
  name: string;
  prompt: string;
  cwd?: AgentRun["cwd"];
  launchedAt?: string;
}): AgentRun {
  return {
    id: `agent-run-${randomUUID()}`,
    model,
    name,
    cwd,
    launchedAt,
    status: "launched",
    promptSha256: hashAgentPrompt(prompt),
  };
}

export function launchClaudeAgent(
  request: ClaudeLaunchRequest,
  spawnImpl: SpawnLike = spawn,
): Promise<ClaudeLaunchResult> {
  return new Promise((resolve, reject) => {
    const claudeBin = getClaudeBin();
    const child = spawnImpl(claudeBin, buildClaudeAgentArgs(request), {
      cwd: request.cwd || getAgentCwd(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new ClaudeAgentLaunchError(
            `Could not find the "${claudeBin}" executable (spawn ENOENT). It is not on PATH for the Studio server process. Set WORKING_MEMORY_CLAUDE_BIN to its absolute path and restart the Studio.`,
          ),
        );
        return;
      }
      reject(new ClaudeAgentLaunchError(error.message));
    });
    child.on("close", (code) => {
      const stdoutText = Buffer.concat(stdout).toString("utf8");
      const stderrText = Buffer.concat(stderr).toString("utf8");
      if (code === 0) {
        resolve({ stdout: stdoutText, stderr: stderrText });
        return;
      }
      reject(
        new ClaudeAgentLaunchError(
          `claude --bg exited with status ${code ?? "unknown"}`,
          stderrText,
        ),
      );
    });
  });
}
