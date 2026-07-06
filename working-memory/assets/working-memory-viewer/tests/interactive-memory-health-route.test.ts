import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/studio/health/route";
import {
  INTERACTIVE_MEMORY_INDEX_FILE,
  INTERACTIVE_MEMORY_SETTINGS_FILE,
} from "@/lib/interactive-memory/paths";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("interactive memory studio health route", () => {
  it("reports JSON archive health and deploy config", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-health-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
    vi.stubEnv("WORKING_MEMORY_TIMEZONE", "UTC");
    vi.stubEnv("WORKING_MEMORY_AGENT_CWD", "/tmp/agent-work");
    vi.stubEnv("WORKING_MEMORY_ENABLE_DIRECT_DEPLOY", "true");
    await fs.writeFile(
      path.join(rootDir, INTERACTIVE_MEMORY_INDEX_FILE),
      JSON.stringify({ schemaVersion: 1, days: [] }),
      "utf8",
    );
    await fs.writeFile(
      path.join(rootDir, INTERACTIVE_MEMORY_SETTINGS_FILE),
      JSON.stringify({ schemaVersion: 1, promptTemplate: "{{ticketBody}}" }),
      "utf8",
    );

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      config: {
        interactiveMemoryDir: rootDir,
        timezone: "UTC",
        timezoneValid: true,
        agentCwd: "/tmp/agent-work",
        directDeployEnabled: true,
      },
      files: {
        archive: { path: rootDir, exists: true, isDirectory: true },
        index: { exists: true, validJson: true },
        settings: { exists: true, validJson: true },
      },
      errors: [],
    });
  });

  it("flags invalid JSON without throwing", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-health-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
    await fs.writeFile(path.join(rootDir, INTERACTIVE_MEMORY_INDEX_FILE), "{", "utf8");

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(json.files.index).toMatchObject({ exists: true, validJson: false });
    expect(json.errors.length).toBeGreaterThan(0);
  });
});
