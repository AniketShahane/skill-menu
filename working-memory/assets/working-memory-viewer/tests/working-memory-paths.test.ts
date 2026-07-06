import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getInteractiveMemoryDir } from "@/lib/interactive-memory/paths";
import {
  assertDateKey,
  dailyNotePath,
  dateFromFileName,
  getWorkingMemoryDir,
  isDailyNoteFile,
} from "@/lib/working-memory/paths";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("working memory path guards", () => {
  it("accepts only dated daily note files", () => {
    expect(isDailyNoteFile("2026-05-05.md")).toBe(true);
    expect(isDailyNoteFile("Dashboard.base")).toBe(false);
    expect(isDailyNoteFile("../2026-05-05.md")).toBe(false);
    expect(dateFromFileName("2026-05-05.md")).toBe("2026-05-05");
  });

  it("rejects non-date route params", () => {
    expect(() => assertDateKey("../secrets")).toThrow("Invalid daily note date key");
    expect(() => assertDateKey("2026-5-5")).toThrow("Invalid daily note date key");
  });

  it("builds daily note paths inside the working memory directory", () => {
    expect(dailyNotePath("/home/user/notes/Working Memory", "2026-05-05")).toBe(
      "/home/user/notes/Working Memory/2026-05-05.md",
    );
  });

  it("uses explicit archive directories when configured", () => {
    vi.stubEnv("WORKING_MEMORY_DIR", "/tmp/working-memory");
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", "/tmp/interactive-memory");

    expect(getWorkingMemoryDir()).toBe("/tmp/working-memory");
    expect(getInteractiveMemoryDir()).toBe("/tmp/interactive-memory");
  });

  it("derives portable archive defaults from XDG data home", () => {
    vi.stubEnv("XDG_DATA_HOME", "/tmp/user-data");

    expect(getWorkingMemoryDir()).toBe(
      path.join("/tmp/user-data", "working-memory", "Working Memory"),
    );
    expect(getInteractiveMemoryDir()).toBe(
      path.join("/tmp/user-data", "working-memory", "Interactive Working Memory"),
    );
  });
});
