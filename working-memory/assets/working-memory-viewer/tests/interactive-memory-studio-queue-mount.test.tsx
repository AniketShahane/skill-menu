import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { InteractiveMemoryStudio } from "@/components/interactive-memory/interactive-memory-studio";
import type { CalendarFile, DayBundle, DayPlan, QueueFile } from "@/lib/interactive-memory/types";

// framer-motion's useReducedMotion reads window.matchMedia, which jsdom lacks.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

const WORK_DATE = "2026-07-13";

function makeDay(): DayPlan {
  return {
    schemaVersion: 6,
    date: WORK_DATE,
    timezone: "UTC",
    title: "Test day",
    status: "active",
    settings: { startHour: 9, endHour: 17, slotMinutes: 30, completionTargetPercent: 80 },
    tasks: [],
    trackers: [],
    breaks: [],
    dayNotes: "",
    ideas: { text: "" },
    lifecycle: {},
    generatedAt: "2026-07-13T08:00:00.000Z",
    updatedAt: "2026-07-13T08:00:00.000Z",
  };
}

function makeCalendar(): CalendarFile {
  return {
    schemaVersion: 1,
    date: WORK_DATE,
    timezone: "UTC",
    source: "manual",
    generatedAt: "2026-07-13T08:00:00.000Z",
    meetings: [],
  };
}

// Empty and healthy: no queued items and every sweep source ok, so showQueueChip is false.
function makeEmptyHealthyQueue(): QueueFile {
  return {
    schemaVersion: 1,
    updatedAt: "2026-07-13T16:00:00.000Z",
    sweep: {
      lastSweepAt: "2026-07-13T16:00:00.000Z",
      lastSweepKind: "scheduled",
      sources: [
        { source: "slack", status: "ok" },
        { source: "gmail", status: "ok" },
      ],
    },
    items: [],
  };
}

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

function mockStudioFetch(queue: QueueFile) {
  const bundle: DayBundle = {
    day: makeDay(),
    calendar: makeCalendar(),
    paths: { dayDir: "", dayJson: "", calendarJson: "" },
  };
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/studio/health")) {
      return jsonResponse({ config: { directDeployEnabled: true, grillEnabled: false } });
    }
    if (url.includes("/api/studio/settings")) {
      return jsonResponse({
        settings: {
          schemaVersion: 1,
          promptTemplate: "{{TASK_TITLE}}",
          updatedAt: "2026-07-13T00:00:00.000Z",
        },
      });
    }
    if (url.includes("/api/studio/queue")) {
      return jsonResponse(queue);
    }
    if (url.includes("/api/studio/day/")) {
      return jsonResponse(bundle);
    }
    return jsonResponse({}, false);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InteractiveMemoryStudio queue panel mount", () => {
  it("mounts the QueuePanel on the plan tab even when the queue is empty and healthy", async () => {
    // Regression guard for the v1.1 change: the panel is a permanent sibling of the trackers
    // panel, decoupled from the header chip. An empty healthy queue keeps showQueueChip false,
    // so if the panel were re-gated on that flag it would unmount and this test would fail.
    vi.stubGlobal("fetch", mockStudioFetch(makeEmptyHealthyQueue()));

    render(<InteractiveMemoryStudio initialDate={WORK_DATE} />);

    // The panel renders its empty state, proving the mount does not depend on the chip.
    expect(await screen.findByText("No captured candidates awaiting triage.")).toBeTruthy();

    // The header chip stays hidden in this scenario, so the panel's presence above is the
    // decoupled behavior and not an artifact of a queued item or a failed source.
    await waitFor(() => {
      expect(document.querySelector(".studio-queue-chip")).toBeNull();
    });
  });
});
