import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeDayPlan,
  readExistingDay,
  saveCalendar,
  saveDay,
} from "@/lib/interactive-memory/fs";
import { dayFilePaths } from "@/lib/interactive-memory/paths";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("interactive memory calendar normalization", () => {
  it("normalizes meeting aliases when reading an existing calendar file", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-calendar-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
    await saveDay(
      "2026-05-25",
      normalizeDayPlan({
        date: "2026-05-25",
        timezone: "America/New_York",
        tasks: [],
      }),
    );
    const paths = dayFilePaths(rootDir, "2026-05-25");
    await fs.writeFile(
      paths.calendarJson,
      JSON.stringify(
        {
          schemaVersion: 3,
          date: "2026-05-25",
          timezone: "America/New_York",
          source: "google-calendar",
          generatedAt: "2026-05-25T12:00:00.000Z",
          meetings: [
            {
              id: "event-summary",
              summary: "Connector sync",
              selfResponse: "accepted",
              start: "2026-05-25T14:00:00.000Z",
              end: "2026-05-25T14:30:00.000Z",
              status: "confirmed",
              location: "Room 4A",
              htmlLink: "https://calendar.google.com/event?eid=summary",
              meetingUrl: "https://meet.google.com/summary",
              attendeeCount: 4,
              organizer: "team@example.com",
              transparency: "opaque",
              eventType: "default",
              description: "Preserve connector metadata.",
            },
            {
              id: "event-name",
              name: "Name fallback",
              responseStatus: "needsAction",
              selfResponse: "declined",
              start: "2026-05-25",
              end: "2026-05-26",
              allDay: "true",
            },
            {
              id: "event-subject",
              subject: "Subject fallback",
              start: "2026-05-25T16:00:00.000Z",
              end: "2026-05-25T16:30:00.000Z",
              allDay: "false",
            },
            {
              id: "event-untitled",
              start: "2026-05-25T17:00:00.000Z",
              end: "2026-05-25T17:30:00.000Z",
            },
          ],
        },
        null,
        2,
      ),
    );

    const bundle = await readExistingDay("2026-05-25");

    expect(bundle?.calendar.meetings).toMatchObject([
      {
        id: "event-summary",
        title: "Connector sync",
        responseStatus: "accepted",
        allDay: false,
        status: "confirmed",
        location: "Room 4A",
        htmlLink: "https://calendar.google.com/event?eid=summary",
        meetingUrl: "https://meet.google.com/summary",
        attendeeCount: 4,
        organizer: "team@example.com",
        transparency: "opaque",
        eventType: "default",
      },
      {
        id: "event-name",
        title: "Name fallback",
        responseStatus: "needsAction",
        allDay: true,
      },
      {
        id: "event-subject",
        title: "Subject fallback",
        allDay: false,
      },
      {
        id: "event-untitled",
        title: "Untitled event",
        allDay: false,
      },
    ]);
    const firstMeeting = bundle?.calendar.meetings[0] as Record<string, unknown> | undefined;
    expect(firstMeeting?.description).toBe("Preserve connector metadata.");
    expect(firstMeeting?.summary).toBe("Connector sync");
    expect(firstMeeting?.selfResponse).toBe("accepted");
  });

  it("normalizes meeting aliases when saving a calendar file", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-calendar-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
    const paths = dayFilePaths(rootDir, "2026-05-26");

    await saveCalendar("2026-05-26", {
      date: "1999-01-01",
      timezone: "America/Los_Angeles",
      source: "google-calendar",
      generatedAt: "2026-05-26T12:00:00.000Z",
      meetings: [
        {
          id: "event-save",
          summary: "Saved alias",
          selfResponse: "tentative",
          start: "2026-05-26T15:00:00.000Z",
          end: "2026-05-26T15:30:00.000Z",
          meetingUrl: "https://meet.google.com/saved",
        },
      ],
    });

    const persisted = JSON.parse(await fs.readFile(paths.calendarJson, "utf8"));

    expect(persisted).toMatchObject({
      schemaVersion: 3,
      date: "2026-05-26",
      timezone: "America/Los_Angeles",
      source: "google-calendar",
      meetings: [
        {
          id: "event-save",
          summary: "Saved alias",
          selfResponse: "tentative",
          title: "Saved alias",
          responseStatus: "tentative",
          allDay: false,
          meetingUrl: "https://meet.google.com/saved",
        },
      ],
    });
  });
});
