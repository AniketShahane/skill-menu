import path from "node:path";
import { getDefaultWorkingMemoryDir } from "@/lib/runtime-config";

export const DEFAULT_WORKING_MEMORY_DIR = getDefaultWorkingMemoryDir();
export const DAILY_NOTE_RE = /^\d{4}-\d{2}-\d{2}\.md$/;
export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getWorkingMemoryDir() {
  return process.env.WORKING_MEMORY_DIR || getDefaultWorkingMemoryDir();
}

export function isDailyNoteFile(fileName: string) {
  return DAILY_NOTE_RE.test(fileName);
}

export function assertDateKey(date: string) {
  if (!DATE_KEY_RE.test(date)) {
    throw new Error(`Invalid daily note date key: ${date}`);
  }
  return date;
}

export function dailyNotePath(workingMemoryDir: string, date: string) {
  const safeDate = assertDateKey(date);
  const resolvedDir = path.resolve(workingMemoryDir);
  const resolvedFile = path.resolve(resolvedDir, `${safeDate}.md`);

  if (!resolvedFile.startsWith(`${resolvedDir}${path.sep}`)) {
    throw new Error(`Daily note path escaped working memory directory: ${date}`);
  }

  return resolvedFile;
}

export function dateFromFileName(fileName: string) {
  if (!isDailyNoteFile(fileName)) return undefined;
  return fileName.slice(0, 10);
}
