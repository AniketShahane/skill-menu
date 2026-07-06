import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import {
  getInteractiveMemoryDir,
  interactiveMemoryIndexPath,
  interactiveMemorySettingsPath,
} from "@/lib/interactive-memory/paths";
import {
  getAgentCwd,
  getClaudeBin,
  getWorkingMemoryTimeZone,
  isDirectAgentDeployEnabled,
} from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonFileHealth = {
  path: string;
  exists: boolean;
  validJson?: boolean;
  error?: string;
};

export async function GET() {
  const archiveDir = getInteractiveMemoryDir();
  const indexPath = interactiveMemoryIndexPath(archiveDir);
  const settingsPath = interactiveMemorySettingsPath(archiveDir);
  const [archive, index, settings] = await Promise.all([
    dirHealth(archiveDir),
    jsonFileHealth(indexPath),
    jsonFileHealth(settingsPath),
  ]);
  const timezone = getWorkingMemoryTimeZone();
  const timezoneValid = isValidTimeZone(timezone);
  const errors = [archive.error, index.error, settings.error].filter(Boolean);
  if (!timezoneValid) errors.push(`Invalid timezone: ${timezone}`);

  return NextResponse.json({
    ok: errors.length === 0,
    generatedAt: new Date().toISOString(),
    config: {
      interactiveMemoryDir: archiveDir,
      timezone,
      timezoneValid,
      agentCwd: getAgentCwd(),
      claudeBin: getClaudeBin(),
      directDeployEnabled: isDirectAgentDeployEnabled(),
    },
    files: {
      archive,
      index,
      settings,
    },
    errors,
  });
}

async function dirHealth(dirPath: string) {
  try {
    const stat = await fs.stat(dirPath);
    return {
      path: dirPath,
      exists: true,
      isDirectory: stat.isDirectory(),
      error: stat.isDirectory() ? undefined : "Archive path exists but is not a directory.",
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { path: dirPath, exists: false, isDirectory: false };
    }
    return {
      path: dirPath,
      exists: false,
      isDirectory: false,
      error: error instanceof Error ? error.message : "Could not inspect archive directory.",
    };
  }
}

async function jsonFileHealth(filePath: string): Promise<JsonFileHealth> {
  try {
    JSON.parse(await fs.readFile(filePath, "utf8"));
    return { path: filePath, exists: true, validJson: true };
  } catch (error) {
    if (isNotFoundError(error)) return { path: filePath, exists: false };
    if (error instanceof SyntaxError) {
      return { path: filePath, exists: true, validJson: false, error: error.message };
    }
    return {
      path: filePath,
      exists: true,
      validJson: false,
      error: error instanceof Error ? error.message : "Could not inspect JSON file.",
    };
  }
}

function isValidTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function isNotFoundError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
