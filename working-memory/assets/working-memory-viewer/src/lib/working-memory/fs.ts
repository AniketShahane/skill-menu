import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { attachCommunicationStats, buildCommunicationItems, parseDailyNote } from "./parser";
import { dailyNotePath, dateFromFileName, getWorkingMemoryDir, isDailyNoteFile } from "./paths";
import type { DailyNote, WorkingMemoryDataset } from "./types";

export async function readDailyNotes(workingMemoryDir = getWorkingMemoryDir()) {
  const entries = await fs.readdir(workingMemoryDir);
  const noteFiles = entries.filter(isDailyNoteFile).sort();
  const notes: DailyNote[] = [];

  for (const fileName of noteFiles) {
    const filePath = path.join(workingMemoryDir, fileName);
    const markdown = await fs.readFile(filePath, "utf8");
    notes.push(parseDailyNote(markdown, filePath));
  }

  return notes.sort((a, b) => b.date.localeCompare(a.date));
}

export async function readDailyNote(date: string, workingMemoryDir = getWorkingMemoryDir()) {
  const filePath = dailyNotePath(workingMemoryDir, date);
  const markdown = await fs.readFile(filePath, "utf8");
  return parseDailyNote(markdown, filePath);
}

export async function getWorkingMemoryDataset(
  workingMemoryDir = getWorkingMemoryDir(),
): Promise<WorkingMemoryDataset> {
  const parsedNotes = await readDailyNotes(workingMemoryDir);
  const comms = buildCommunicationItems(parsedNotes);
  const notes = attachCommunicationStats(parsedNotes, comms);
  const latestDate = notes[0]?.date;

  return {
    generatedAt: new Date().toISOString(),
    notes,
    latestDate,
    comms,
    health: {
      ok: true,
      workingMemoryDir,
      noteCount: notes.length,
      latestDate,
      parseWarningCount: notes.reduce((sum, note) => sum + note.parseWarnings.length, 0),
    },
  };
}

export async function listDailyNoteDates(workingMemoryDir = getWorkingMemoryDir()) {
  const entries = await fs.readdir(workingMemoryDir);
  return entries
    .map(dateFromFileName)
    .filter((date): date is string => Boolean(date))
    .sort()
    .reverse();
}
