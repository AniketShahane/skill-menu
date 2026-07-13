import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildQueueGrillStartBody,
  distinctSourceKinds,
  formatSweepFooter,
  getQueuedItems,
  hasFailedSweepSource,
  QueuePanel,
  StudioQueueChip,
} from "@/components/interactive-memory/queue-panel";
import type {
  QueueFile,
  QueueItem,
  QueueSweepMeta,
  SourceRef,
} from "@/lib/interactive-memory/types";

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

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "queue-1",
    status: "queued",
    title: "Fix login timeout",
    summary: "The sign-in page hangs past thirty seconds on slow links.",
    harvestedContext: "raw excerpt",
    sourceRefs: [{ kind: "slack", label: "team channel" }],
    fingerprints: ["slack:C0:1.1"],
    seenCount: 1,
    firstSeenAt: "2026-07-13T09:00:00.000Z",
    lastSeenAt: "2026-07-13T09:00:00.000Z",
    ...overrides,
  };
}

function makeSweep(overrides: Partial<QueueSweepMeta> = {}): QueueSweepMeta {
  return {
    lastSweepAt: "2026-07-13T16:00:00.000Z",
    lastSweepKind: "scheduled",
    sources: [
      { source: "slack", status: "ok" },
      { source: "gmail", status: "ok" },
    ],
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof QueuePanel>[0]> = {}) {
  const onGrill = vi.fn();
  const onDismiss = vi.fn();
  const onToggleCollapsed = vi.fn();
  const props: Parameters<typeof QueuePanel>[0] = {
    collapsed: false,
    grillEnabled: true,
    items: [makeItem()],
    onDismiss,
    onGrill,
    onToggleCollapsed,
    sweep: makeSweep(),
    timeZone: "UTC",
    ...overrides,
  };
  const utils = render(<QueuePanel {...props} />);
  return { ...utils, onGrill, onDismiss, onToggleCollapsed };
}

describe("queue-panel pure helpers", () => {
  it("getQueuedItems keeps only queued items", () => {
    const queue: QueueFile = {
      schemaVersion: 1,
      updatedAt: "2026-07-13T16:00:00.000Z",
      sweep: makeSweep(),
      items: [
        makeItem({ id: "queue-1", status: "queued" }),
        makeItem({ id: "queue-2", status: "dismissed" }),
        makeItem({ id: "queue-3", status: "consumed" }),
        makeItem({ id: "queue-4", status: "queued" }),
      ],
    };
    expect(getQueuedItems(queue).map((item) => item.id)).toEqual(["queue-1", "queue-4"]);
    expect(getQueuedItems(undefined)).toEqual([]);
  });

  it("hasFailedSweepSource is true only when a source failed", () => {
    expect(hasFailedSweepSource(makeSweep())).toBe(false);
    expect(
      hasFailedSweepSource(makeSweep({ sources: [{ source: "jira", status: "failed" }] })),
    ).toBe(true);
    expect(hasFailedSweepSource(undefined)).toBe(false);
  });

  it("distinctSourceKinds dedupes while preserving first-seen order", () => {
    const refs: SourceRef[] = [
      { kind: "slack", label: "a" },
      { kind: "slack", label: "b" },
      { kind: "jira", label: "c" },
      { kind: "gmail", label: "d" },
      { kind: "jira", label: "e" },
    ];
    expect(distinctSourceKinds(refs)).toEqual(["slack", "jira", "gmail"]);
  });

  it("formatSweepFooter reads no sweeps yet, then time plus source health", () => {
    expect(formatSweepFooter({ sources: [] }, "UTC")).toBe("no sweeps yet");
    const footer = formatSweepFooter(makeSweep(), "UTC");
    expect(footer.startsWith("last sweep")).toBe(true);
    expect(footer).toContain("Slack ok");
    expect(footer).toContain("Gmail ok");
  });

  it("buildQueueGrillStartBody carries mode create plus the queue item id", () => {
    expect(buildQueueGrillStartBody("queue-9")).toEqual({ mode: "create", queueItemId: "queue-9" });
  });
});

describe("StudioQueueChip count rendering", () => {
  it("shows Queue plus the count and no warning dot when healthy", () => {
    const { container } = render(
      <StudioQueueChip count={3} hasFailedSource={false} onOpen={() => {}} />,
    );
    const chip = screen.getByRole("button");
    expect(chip.textContent).toContain("Queue · 3");
    expect(container.querySelector(".studio-queue-chip-dot")).toBeNull();
  });

  it("renders with a warning dot when a source failed even at zero count", () => {
    const { container } = render(
      <StudioQueueChip count={0} hasFailedSource={true} onOpen={() => {}} />,
    );
    expect(screen.getByRole("button").textContent).toContain("Queue · 0");
    expect(container.querySelector(".studio-queue-chip-dot")).not.toBeNull();
  });

  it("renders nothing when the count is zero and health is clean", () => {
    const { container } = render(
      <StudioQueueChip count={0} hasFailedSource={false} onOpen={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onOpen when clicked", () => {
    const onOpen = vi.fn();
    render(<StudioQueueChip count={2} hasFailedSource={false} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("QueuePanel rows and chips", () => {
  it("renders the title, one chip per distinct source kind, and the sweep footer", () => {
    renderPanel({
      items: [
        makeItem({
          sourceRefs: [
            { kind: "slack", label: "team channel" },
            { kind: "slack", label: "other channel" },
            { kind: "calendar", label: "sync block" },
          ],
        }),
      ],
    });
    expect(screen.getByText("Fix login timeout")).toBeTruthy();
    // Two distinct kinds -> two source chips, not three.
    expect(screen.getAllByText("Slack")).toHaveLength(1);
    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.getByText(/last sweep/)).toBeTruthy();
  });

  it("renders the possible-match and dismissed-before chips when present", () => {
    renderPanel({
      items: [
        makeItem({
          matchedTask: {
            taskId: "task-1",
            taskDate: "2026-07-13",
            title: "Refresh the release checklist",
          },
          dismissedBefore: { at: "2026-07-10T09:00:00.000Z" },
        }),
      ],
    });
    expect(screen.getByText(/possible match: Refresh the release checklist/)).toBeTruthy();
    expect(screen.getByText(/dismissed before Jul 10/)).toBeTruthy();
  });

  it("shows the empty state but stays mounted when a source failed with no items", () => {
    renderPanel({
      items: [],
      sweep: makeSweep({ sources: [{ source: "gmail", status: "failed", detail: "auth" }] }),
    });
    expect(screen.getByText(/No captured candidates/)).toBeTruthy();
    expect(screen.getByText(/Gmail failed/)).toBeTruthy();
  });
});

describe("QueuePanel actions", () => {
  it("calls onGrill with the item when Grill is clicked", () => {
    const item = makeItem({ id: "queue-42" });
    const { onGrill } = renderPanel({ items: [item] });
    fireEvent.click(screen.getByRole("button", { name: /grill/i }));
    expect(onGrill).toHaveBeenCalledTimes(1);
    expect(onGrill).toHaveBeenCalledWith(item);
  });

  it("calls onDismiss with the item when Dismiss is clicked", () => {
    const item = makeItem({ id: "queue-7" });
    const { onDismiss } = renderPanel({ items: [item] });
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(item);
  });

  it("disables the Grill button when grilling is off but keeps Dismiss usable", () => {
    const { onDismiss } = renderPanel({ grillEnabled: false });
    expect((screen.getByRole("button", { name: /grill/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    const dismiss = screen.getByRole("button", { name: /dismiss/i }) as HTMLButtonElement;
    expect(dismiss.disabled).toBe(false);
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("targets the right row's actions when several candidates are listed", () => {
    const first = makeItem({ id: "queue-1", title: "Fix login timeout" });
    const second = makeItem({ id: "queue-2", title: "Update the deploy script" });
    const { onGrill } = renderPanel({ items: [first, second] });
    const secondRow = screen.getByText("Update the deploy script").closest("li") as HTMLElement;
    fireEvent.click(within(secondRow).getByRole("button", { name: /grill/i }));
    expect(onGrill).toHaveBeenCalledWith(second);
  });

  it("calls onToggleCollapsed when the header toggle is clicked", () => {
    const { onToggleCollapsed } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /monitoring queue/i }));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });
});
