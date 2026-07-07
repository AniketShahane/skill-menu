# Source Query Templates

Query templates for the morning source scan. Source connectors are optional advanced setup: run only the connectors that are configured. In manual-only mode, skip this file's connector queries and ask the user for candidate tasks, source links, and busy windows.

## Slack

| Query | Tool | Parameters |
|-------|------|------------|
| @mentions + DMs (24h) | `mcp__claude_ai_Slack__slack_search_public_and_private` | `query: "to:<@{slackUserId}>"`, filter to messages from the last 24 hours |
| Key channel activity | `mcp__claude_ai_Slack__slack_read_channel` | Per channel below, `oldest` = yesterday's Unix timestamp, `limit: 20` |

### Key Channels

Populate channel IDs in local config on first use via `mcp__claude_ai_Slack__slack_search_channels`. Do not commit workspace-specific channel IDs into shared docs.

| Channel | ID | Why |
|---------|----|-----|
| #team-channel | *(discover on first use)* | Team channel where action items surface |
| #cross-team-requests | *(discover on first use)* | Cross-team requests |

### Slack Dedup Rules

- If multiple @mentions come from the same thread, collapse into one item referencing the thread.
- If a Slack message contains a Jira key (regex `[A-Z]+-\d+`), merge with the matching Jira item rather than showing both.
- Prefer the Slack context (who asked, what channel) with the Jira key as a link.

---

## Gmail

| Query | Tool | Parameters |
|-------|------|------------|
| Unread (24h) | `mcp__claude_ai_Gmail__search_threads` | `query: "is:unread newer_than:1d"`, `maxResults: 10` |
| Starred + unactioned (7d) | `mcp__claude_ai_Gmail__search_threads` | `query: "is:starred newer_than:7d"`, `maxResults: 10` |
| Zoom AI recaps (48h) | `mcp__claude_ai_Gmail__search_threads` | `query: "from:no-reply@zoom.us newer_than:2d"`, `maxResults: 10` |

### Gmail Processing Rules

- `search_threads` returns snippets, not full bodies. For threads that seem actionable, use `mcp__claude_ai_Gmail__get_thread` to read the full content.
- Flag starred threads older than 3 days with ⚠️ aging marker.
- If more than 10 results, note the overflow: *"10+ unread threads — showing the most recent 10."*
- **Zoom AI recaps** — read as a complementary Gmail signal; the Zoom MCP connector (see **Meetings (Zoom)** below) is the authoritative meeting-context source:
  - Email bodies are usually just links; the snippet is the best connector preview. For the actual summary + action items, prefer the Zoom MCP connector, or ask the user to paste the recap content (or open the link and paraphrase).
  - Cross-check each recap against the Zoom MCP connector's meeting data for the same date. If the connector already surfaced the meeting, merge rather than double-count; surface any items it missed.
  - Surface recap-derived action items as candidate tasks with `sourceRefs` pointing to Gmail/Calendar/meeting context. Write them only after the user qualifies and approves them through the normal task-readiness pass.

---

## Jira

All queries use configured `jiraCloudId`, `jiraAccountId`, and `jiraProjects`.

| Query | Tool | JQL | maxResults |
|-------|------|-----|------------|
| Assigned + active | `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql` | `assignee = "{jiraAccountId}" AND status NOT IN (Done, Closed) AND project IN ({jiraProjects}) ORDER BY priority DESC, updated DESC` | 15 |
| Recently transitioned | `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql` | `assignee = "{jiraAccountId}" AND status changed DURING (startOfDay(-1), now()) ORDER BY updated DESC` | 10 |
| Mentioned (watcher) | `mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql` | `watcher = "{jiraAccountId}" AND updated >= -1d AND status NOT IN (Done, Closed) ORDER BY updated DESC` | 10 |

### Jira Processing Rules

- Dedup across the three queries — a ticket may appear in multiple results.
- **Always include the ticket summary** when surfacing a Jira key in the briefing or day archive. Format: `KEY (summary)` in prose or `**KEY** (summary)` in task titles. Example: `PROJ-946 (Gather requirements for weekly metrics)`. Never surface a bare key — the user should never have to look up a ticket to know what it's about.
- The Atlassian connector usually returns full issue bodies, so `summary` should be available in the extraction — no query change needed.
- Also surface: status, priority, issuetype when relevant to classification.
- Tickets already in "In Progress" by this user get flagged as carry-forward candidates.
- Recently transitioned tickets (moved to Done/Closed since yesterday) are informational — include in the briefing as "completed since last check" but don't add to today's task list.

### Jira Overflow — Always Extract via jq

The Atlassian connector may ignore `fields` and return full issue bodies (~4KB each). The 15-result assigned+active query may dump to a file. Don't fight it — extract with `jq` from the path in the error message:

```bash
jq -r '.issues.nodes[] | "\(.key) [\(.fields.status.name)] [\(.fields.priority.name)] [\(.fields.issuetype.name)] — \(.fields.summary)"' <saved-path>
```

---

## Google Calendar

| Query | Tool | Parameters |
|-------|------|------------|
| Today's events | `mcp__claude_ai_Google_Calendar__list_events` | `calendarId: "{calendarId}"`, `timeMin` = start of today (RFC3339, resolved `timezone`), `timeMax` = end of today, `timeZone: "{timezone}"` |

### Calendar Processing Rules

- Present meetings as a time-boxed overview at the top of the briefing: *"📅 Calendar: 3 meetings (standup 10am, review 2pm, 1:1 4pm)"*
- Meetings consume time — factor them into whether the plan is realistic. A day with 5+ hours of meetings likely supports only Quick tasks between meetings.
- If a meeting has a clear action-item description (agenda, pre-work), surface it as a potential Tasks item.
- For the interactive workspace, normalize the connector result into `${archiveDir}/{YYYY-MM-DD}/calendar.json`. The morning flow writes it alongside today's `day.json`, sets `day.json.lifecycle.morningRunAt`, and refreshes root `_index.json`. Do not use local Google OAuth. Capture start/end/title/status/self response/link/location/direct meeting join URL/organizer/attendee count when present, but do not store full event descriptions by default.
- Store direct join links in `meetingUrl` and Google Calendar event links in `htmlLink`. If only one link is available, store the available link in the right field; do not invent a join URL from a calendar permalink.
- Write `start`/`end` as RFC3339 with an explicit offset (`Z` or `±hh:mm`), exactly as the connector returns them; do not hand-convert between timezones. The studio converts absolute timestamps into the file's `timezone` for display. All-day events are the exception: keep the local date (midnight-to-midnight) with `allDay: true` so the date never shifts.

### Interactive Calendar JSON Shape

```json
{
  "schemaVersion": 3,
  "date": "2026-05-22",
  "timezone": "{timezone}",
  "source": "google-calendar",
  "generatedAt": "2026-05-22T09:00:00Z",
  "meetings": [
    {
      "id": "event-id",
      "calendarId": "primary",
      "title": "Team Daily Standup",
      "start": "2026-05-22T13:00:00Z",
      "end": "2026-05-22T13:15:00Z",
      "allDay": false,
      "status": "confirmed",
      "responseStatus": "accepted",
      "location": "",
      "htmlLink": "https://www.google.com/calendar/event?...",
      "meetingUrl": "https://...",
      "attendeeCount": 8,
      "organizer": "person@example.com",
      "transparency": "opaque",
      "eventType": "default"
    }
  ]
}
```

---

## Meetings (Zoom)

Meeting context comes from the Zoom MCP connector (`mcp__claude_ai_Zoom_for_Claude__*`). It is an optional connector: if it is unconfigured or unauthenticated, skip meeting-context scans silently, exactly like other optional sources.

### Runtime tool discovery + auth

The connector's data tools load only after authentication, so do not hardcode or guess tool names. Before scanning:

1. Discover the connector's tools with `ToolSearch` (query `zoom`). If only `mcp__claude_ai_Zoom_for_Claude__authenticate` / `complete_authentication` are exposed, the connector is not yet authenticated.
2. On first use, run `mcp__claude_ai_Zoom_for_Claude__authenticate`, share the returned authorization URL with the user, and finish with `complete_authentication`. If the user does not authenticate, skip this source silently.
3. Once authenticated, load the actual meeting/recording/summary tool schemas via `ToolSearch select:<name>` before calling them.

### Query

| Query | Method | Details |
|-------|--------|---------|
| Today's + yesterday's meetings | Zoom MCP connector | List recent meetings (today and yesterday in resolved `timezone`, to catch evening meetings that inform today's plan) and pull each meeting's AI summary / recap / action items. |

### Extraction Rules

For each meeting recap/summary, extract:

1. **Action Items assigned to the configured user** → surface as actionable tasks in the inbox
   - Format: `[Meeting: {title}] {task description}`
   - These are strong Tasks candidates.
2. **Action Items assigned to others** → recommend as trackers when they represent deliverables or open threads the user may need to monitor
   - Ask before writing a tracker. If the user has an action today, create a linked task and tracker.
3. **Open Questions / Follow-ups** → surface as potential Tasks items if they need the user's input.
4. **Decisions** → do not surface as tasks. Include as context only if relevant to an action item.

Capture the meeting as a `sourceRefs` entry with `kind: "meeting"`, a human-readable `label` (`Meeting: Title`), and the shareable recap/recording `url` when available.

### Meetings Dedup Rules

- If an action item references a Jira key (regex `[A-Z]+-\d+`), merge with the matching Jira item rather than showing both. Keep the meeting context as source attribution.
- If an action item duplicates a Slack thread already in the inbox, merge them — prefer the meeting version (it's more structured).
- If the Gmail Zoom-recap query surfaced the same meeting, merge them and do not double-count.

### Edge Cases

- No meetings for today/yesterday: silently skip. Do not mention the source in the briefing.
- Connector unconfigured or unauthenticated: silently skip.
- Meeting with no action items: still surface Open Questions if relevant, otherwise skip.

---

## Partial Failure Handling

If any configured source fails (auth expired, rate limit, timeout):
1. Note which source failed: *"Gmail scan failed — add items manually if needed."*
2. Proceed with all available sources.
3. Never block the entire morning flow because one API is down.
