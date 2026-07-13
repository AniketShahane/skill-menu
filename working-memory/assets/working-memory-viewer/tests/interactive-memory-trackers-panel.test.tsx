import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ExternalTrackersPanel,
  selectOpenTrackers,
} from "@/components/interactive-memory/interactive-memory-studio";
import type { TrackerRecord } from "@/lib/interactive-memory/types";

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

function makeTracker(overrides: Partial<TrackerRecord> = {}): TrackerRecord {
  return {
    id: "tracker-1",
    person: "Dana Lin",
    work: "Ship the payments API",
    status: "waiting",
    originalAskDate: "2026-07-11",
    sourceRefs: [],
    notes: "",
    createdAt: "2026-07-11T09:00:00.000Z",
    updatedAt: "2026-07-11T09:00:00.000Z",
    ...overrides,
  };
}

describe("selectOpenTrackers", () => {
  it("drops done and dropped trackers, keeps the rest", () => {
    const trackers: TrackerRecord[] = [
      makeTracker({ id: "t-active", status: "active" }),
      makeTracker({ id: "t-waiting", status: "waiting" }),
      makeTracker({ id: "t-blocked", status: "blocked" }),
      makeTracker({ id: "t-done", status: "done" }),
      makeTracker({ id: "t-dropped", status: "dropped" }),
    ];
    expect(
      selectOpenTrackers(trackers)
        .map((tracker) => tracker.id)
        .sort(),
    ).toEqual(["t-active", "t-blocked", "t-waiting"]);
  });
});

describe("ExternalTrackersPanel closed-tracker filtering", () => {
  it("does not render a done tracker and the count pill shows only open trackers", () => {
    const open = makeTracker({ id: "t-open", person: "Dana Lin", work: "Ship the payments API" });
    const done = makeTracker({
      id: "t-done",
      person: "Rae Okoro",
      work: "Close the release checklist",
      status: "done",
      completedAt: "2026-07-13T12:00:00.000Z",
    });

    const { container } = render(
      <ExternalTrackersPanel
        collapsed={false}
        onOpenCreateTracker={() => {}}
        onRequestClose={() => {}}
        onToggleCollapsed={() => {}}
        trackers={selectOpenTrackers([open, done])}
        workDate="2026-07-13"
      />,
    );

    expect(screen.getByText("Dana Lin")).toBeTruthy();
    expect(screen.queryByText("Rae Okoro")).toBeNull();
    expect(container.querySelector(".external-trackers-count")?.textContent).toBe("1");
  });
});
