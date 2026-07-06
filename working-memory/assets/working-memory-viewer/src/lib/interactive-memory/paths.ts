import path from "node:path";
import { getDefaultInteractiveMemoryDir } from "@/lib/runtime-config";

export const DEFAULT_INTERACTIVE_MEMORY_DIR = getDefaultInteractiveMemoryDir();
export const INTERACTIVE_MEMORY_INDEX_FILE = "_index.json";
export const INTERACTIVE_MEMORY_SETTINGS_FILE = "_settings.json";
export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getInteractiveMemoryDir() {
  return process.env.INTERACTIVE_MEMORY_DIR || getDefaultInteractiveMemoryDir();
}

export function assertDateKey(date: string) {
  if (!DATE_KEY_RE.test(date)) {
    throw new Error(`Invalid day key: ${date}`);
  }
  return date;
}

export function dayDirPath(rootDir: string, date: string) {
  const safeDate = assertDateKey(date);
  const resolvedRoot = path.resolve(rootDir);
  const resolvedDay = path.resolve(resolvedRoot, safeDate);

  if (!resolvedDay.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Interactive day path escaped root directory: ${date}`);
  }

  return resolvedDay;
}

export function dayFilePaths(rootDir: string, date: string) {
  const dayDir = dayDirPath(rootDir, date);
  return {
    dayDir,
    dayJson: path.join(dayDir, "day.json"),
    calendarJson: path.join(dayDir, "calendar.json"),
  };
}

export function interactiveMemoryIndexPath(rootDir: string) {
  return path.join(path.resolve(rootDir), INTERACTIVE_MEMORY_INDEX_FILE);
}

export function interactiveMemorySettingsPath(rootDir: string) {
  return path.join(path.resolve(rootDir), INTERACTIVE_MEMORY_SETTINGS_FILE);
}
