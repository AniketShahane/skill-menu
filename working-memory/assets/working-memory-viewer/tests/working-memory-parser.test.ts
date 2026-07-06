import { describe, expect, it } from "vitest";
import {
  attachCommunicationStats,
  buildCommunicationItems,
  parseDailyNote,
} from "@/lib/working-memory/parser";

const canonicalNote = `---
date: 2026-05-05
tags:
  - working-memory
type: daily-plan
status: active
deep_work: "Ship one output to Slack DM"
completed: 0
total: 3
---

# 2026-05-05: Working Memory

## Focus

- [ ] **PROJ-1036** Ship one newsletter output to Riley's Slack DM today. *(day 3 \\u26A0)*
  - Today's goal: one output landed.
  - Source: Carry-forward from 2026-05-04.

## Tasks

- [x] Create dedicated Slack channel and send initial back-test message.
  - Source: Slack channel.

## Quick

- [ ] Reply to Sam's metrics DM.

## Trackers (active, watch)

- Waiting on Jordan comment review for V1 direction.

## Source gap

*(Pre-flight clean: Slack, Gmail, Calendar, Jira all reachable.)*
`;

describe("parseDailyNote", () => {
  it("parses frontmatter, sections, checkboxes, details, links, and Jira keys", () => {
    const note = parseDailyNote(
      canonicalNote,
      "/home/user/notes/Working Memory/2026-05-05.md",
    );

    expect(note.date).toBe("2026-05-05");
    expect(note.frontmatter.deepWork).toBe("Ship one output to Slack DM");
    expect(note.sections.map((section) => section.kind)).toContain("trackers");
    expect(note.tasks).toHaveLength(3);
    expect(note.tasks[0].jiraKeys).toEqual(["PROJ-1036"]);
    expect(note.tasks[0].details["Today's goal"]).toEqual(["one output landed."]);
    expect(note.tasks[1].status).toBe("done");
    expect(note.stats.coreTotal).toBe(3);
    expect(note.sourceGaps[0].clean).toBe(true);
  });

  it("preserves frontmatter mismatch warnings instead of trusting counts", () => {
    const note = parseDailyNote(
      canonicalNote.replace("total: 3", "total: 9"),
      "/home/user/notes/Working Memory/2026-05-05.md",
    );

    expect(note.stats.coreTotal).toBe(3);
    expect(note.parseWarnings.join("\n")).toContain("Frontmatter total 9 differs");
  });

  it("keeps unknown sections without crashing", () => {
    const note = parseDailyNote(
      `${canonicalNote}\n## Strategy Note (rollout logistics)\n\nSome text.`,
      "/home/user/notes/Working Memory/2026-05-05.md",
    );

    expect(note.sections.some((section) => section.kind === "strategy_note")).toBe(true);
  });
});

describe("buildCommunicationItems", () => {
  it("classifies owed, waiting, closed, and source-gap communication items", () => {
    const note = parseDailyNote(
      canonicalNote,
      "/home/user/notes/Working Memory/2026-05-05.md",
    );
    const comms = buildCommunicationItems([note]);

    expect(comms.some((comm) => comm.state === "owed_by_me" && comm.risk === "warning")).toBe(true);
    expect(comms.some((comm) => comm.state === "waiting_on_others")).toBe(true);
    expect(comms.some((comm) => comm.state === "closed")).toBe(true);
    expect(comms.some((comm) => comm.state === "source_gap" && comm.risk === "none")).toBe(true);
  });

  it("suppresses active risk for parked communication threads", () => {
    const parkedNote = `---
date: 2026-05-06
tags: [working-memory]
---

# 2026-05-06

## Parked

- Alex Explorer DM thread - Casey is providing context separately; out of carry-forward.
`;

    const note = parseDailyNote(parkedNote, "/home/user/notes/Working Memory/2026-05-06.md");
    const comm = buildCommunicationItems([note]).find((item) => item.title.includes("Alex"));

    expect(comm?.state).toBe("monitor");
    expect(comm?.risk).toBe("none");
  });

  it("attaches risk counts back to note stats", () => {
    const note = parseDailyNote(
      canonicalNote,
      "/home/user/notes/Working Memory/2026-05-05.md",
    );
    const comms = buildCommunicationItems([note]);
    const [withStats] = attachCommunicationStats([note], comms);

    expect(withStats.stats.commRiskCount).toBeGreaterThan(0);
  });
});
