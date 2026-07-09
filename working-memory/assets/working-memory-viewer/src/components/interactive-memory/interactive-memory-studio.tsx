"use client";

import {
  type Collision,
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDndMonitor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import confetti from "canvas-confetti";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clipboard,
  ClipboardList,
  Clock,
  Expand,
  ExternalLink,
  Flame,
  Lightbulb,
  Loader2,
  Mail,
  MessageCircle,
  MessageCircleQuestion,
  MoreVertical,
  Palette,
  PencilLine,
  Plus,
  Rocket,
  Save,
  Shrink,
  Shuffle,
  Sparkles,
  Target,
  Ticket,
  Trash2,
  TriangleAlert,
  Trophy,
  User,
  Video,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  createContext,
  memo,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { sanitizeAgentName, suggestAgentName } from "@/lib/interactive-memory/agent-names";
import type { GrillTurn } from "@/lib/interactive-memory/grill";
import { MOTION } from "@/lib/interactive-memory/motion";
import {
  buildCaptureSummary,
  DEFAULT_PROMPT_TEMPLATE,
  getPromptWarnings,
  getTaskReadiness,
  renderAgentPrompt,
  renderPromptTemplate,
  sourceLines,
  validatePromptTemplate,
} from "@/lib/interactive-memory/prompt";
import { buildNewTask } from "@/lib/interactive-memory/task-factory";
import {
  type AgentModel,
  type AgentReadiness,
  type AgentRun,
  CALENDAR_SCHEMA_VERSION,
  type CalendarFile,
  type DayBundle,
  type CompletionFact as DayCompletionFact,
  type DayPlan,
  type PromptSettings,
  type SourceKind,
  type SourceRef,
  STATUS_LABELS,
  type TaskKind,
  type TaskRecord,
  type TaskStatus,
  type TicketFields,
  TRACKER_STATUS_LABELS,
  type TrackerRecord,
  type WorkDepth,
} from "@/lib/interactive-memory/types";
import { cn } from "@/lib/utils";
import {
  type GrillActiveTurn,
  GrillChatDrawer,
  type GrillChatPhase,
  type GrillTranscriptEntry,
} from "./grill-chat-drawer";

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "review", "done"];
const TASK_KIND_META: Record<
  TaskKind,
  {
    label: string;
    icon: typeof Target;
    className: string;
  }
> = {
  focus: { label: "Focus", icon: Target, className: "kind-focus" },
  task: { label: "Task", icon: ClipboardList, className: "kind-task" },
  quick: { label: "Quick", icon: Zap, className: "kind-quick" },
  comms: { label: "Comms", icon: MessageCircle, className: "kind-comms" },
  personal: { label: "Personal", icon: User, className: "kind-personal" },
  ad_hoc: { label: "Ad hoc", icon: Shuffle, className: "kind-ad-hoc" },
};
const AGENT_MODEL_OPTIONS: Array<{ model: AgentModel; label: string }> = [
  { model: "sonnet", label: "Sonnet" },
  { model: "opus", label: "Opus" },
  { model: "fable", label: "Fable" },
  { model: "haiku", label: "Haiku" },
];
type DisplaySourceKind = Extract<SourceKind, "slack" | "jira" | "gmail" | "manual">;
const SOURCE_KIND_OPTIONS: SourceKind[] = [
  "manual",
  "jira",
  "slack",
  "gmail",
  "calendar",
  "meeting",
  "doc",
];
const SOURCE_KIND_META: Record<
  DisplaySourceKind,
  {
    label: string;
    icon: typeof MessageCircle;
    className: string;
  }
> = {
  slack: { label: "Slack", icon: MessageCircle, className: "source-slack" },
  jira: { label: "Jira", icon: Ticket, className: "source-jira" },
  gmail: { label: "Gmail", icon: Mail, className: "source-gmail" },
  manual: { label: "Manual", icon: PencilLine, className: "source-manual" },
};
const KIND_OPTIONS = Object.keys(TASK_KIND_META) as TaskKind[];
const STUDIO_TAB_OPTIONS = [
  { value: "plan", label: "Plan", icon: CalendarDays },
  { value: "ideas", label: "Ideas", icon: Lightbulb },
] as const;
const DENSITY_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfort" },
  { value: "spacious", label: "Spacious" },
] as const;
const PALETTE_OPTIONS = [
  { value: "clear-day", label: "Clear Day" },
  { value: "neon-noir", label: "Neon Noir" },
  { value: "sunset-disco", label: "Sunset Disco" },
  { value: "tidepool", label: "Tidepool" },
  { value: "hologram", label: "Hologram" },
  { value: "brat", label: "Brat" },
  { value: "night-arcade", label: "Night Arcade" },
] as const;
const ROW_HEIGHT_BY_DENSITY: Record<DensityMode, number> = {
  compact: 36,
  comfortable: 44,
  spacious: 56,
};
const WORKDAY_SLOT_MINUTES = 60;
const CALENDAR_INTERACTION_MINUTES = 5;
const CALENDAR_BLOCK_VERTICAL_GAP = 5;
const CALENDAR_EVENT_MIN_RENDERED_HEIGHT = 12;
const CALENDAR_TASK_MIN_HEIGHT = 22;
const CALENDAR_MEETING_MIN_HEIGHT = 22;
const SCHEDULED_TASK_TINY_HEIGHT = 24;
const SCHEDULED_TASK_COMPACT_HEIGHT = 38;
const SCHEDULED_TASK_STACKED_MIN_HEIGHT = 58;
// In Fit Day mode, calendar items this short or shorter show no inline text (hover/tooltip only).
// In actual size, items this short still show their text, just vertically centered.
const CALENDAR_HOVER_ONLY_MAX_MINUTES = 20;
const TASK_CONTEXT_PLACEHOLDER = [
  "Source/problem: where this came from and what is currently wrong or needed.",
  "Relevant context: repo areas, files, Jira/Slack/Gmail links, data sources, or meeting notes.",
  "Hints: known approach, dependencies, edge cases, or examples worth checking.",
].join("\n");
const DONE_WHEN_PLACEHOLDER = [
  "Outcome: the visible behavior, artifact, or decision that should exist.",
  "Acceptance checks: concrete bullets the agent can verify.",
  "Validation: commands, screenshots, tests, review steps, or manual checks to run.",
  "Fallback: what is acceptable if the ideal result is blocked.",
].join("\n");
const PROGRESS_MILESTONES = [25, 50, 75, 100] as const;
const COMPLETION_BURST_DURATION_MS = 30_000;
const COMPLETION_FACTS = [
  {
    subject: "Art",
    text: "The blue in many Renaissance paintings came from ultramarine, once more expensive than gold.",
  },
  {
    subject: "Science",
    text: "Octopuses have neurons in their arms, so each arm can handle some sensing and movement locally.",
  },
  {
    subject: "Coffee",
    text: "A short bloom when brewing pour-over lets trapped carbon dioxide escape, which helps water extract more evenly.",
  },
  {
    subject: "Fitness",
    text: "Walking after a meal can blunt the post-meal glucose spike, even when the walk is only 10 minutes.",
  },
  {
    subject: "Health",
    text: "Morning sunlight helps anchor your circadian rhythm because bright light suppresses melatonin signaling.",
  },
  {
    subject: "Life hack",
    text: "A two-minute reset works because starting friction is often the task; do the smallest visible next move.",
  },
  {
    subject: "Design",
    text: "Great interfaces often feel calm because hierarchy does the shouting before color has to.",
  },
  {
    subject: "Food",
    text: "Salt can make fruit taste sweeter by suppressing bitterness and sharpening aroma perception.",
  },
] as const;
const calendarAwareCollisionDetection: CollisionDetection = (args) => {
  // Calendar time slots keep their layout rect even when scrolled out of view
  // inside ".calendar-body" (getBoundingClientRect ignores ancestor clipping),
  // so a scrolled calendar can report slot rects that geometrically overlap
  // the kanban board above it. Only trust slot collisions while the pointer
  // is actually within the calendar's visible (clipped) viewport, otherwise
  // a board-to-board drag can be hijacked by an invisible, scrolled-away slot.
  const pointerInCalendarViewport = isPointerWithinCalendarViewport(args.pointerCoordinates);
  const dropSlotCollision = (collision: Collision) =>
    isSlotCollision(collision) && pointerInCalendarViewport;

  const pointerCollisions = pointerWithin(args);
  const slotPointerCollisions = pointerCollisions.filter(dropSlotCollision);
  if (slotPointerCollisions.length > 0) return slotPointerCollisions;
  const nonSlotPointerCollisions = pointerCollisions.filter(
    (collision) => !isSlotCollision(collision),
  );
  if (nonSlotPointerCollisions.length > 0) return nonSlotPointerCollisions;

  const closestCollisions = closestCenter(args);
  const slotClosestCollisions = closestCollisions.filter(dropSlotCollision);
  if (slotClosestCollisions.length > 0) return slotClosestCollisions;
  return closestCollisions.filter((collision) => !isSlotCollision(collision));
};

function isPointerWithinCalendarViewport(pointerCoordinates: { x: number; y: number } | null) {
  if (!pointerCoordinates) return false;
  const calendarBody = document.querySelector(".calendar-body");
  if (!calendarBody) return false;
  const rect = calendarBody.getBoundingClientRect();
  return (
    pointerCoordinates.x >= rect.left &&
    pointerCoordinates.x <= rect.right &&
    pointerCoordinates.y >= rect.top &&
    pointerCoordinates.y <= rect.bottom
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";
type SettingsSaveState = SaveState;
type DeployState =
  | {
      status: "deploying";
      taskId: string;
      model: AgentModel;
    }
  | {
      status: "success";
      taskId: string;
      model: AgentModel;
      message: string;
      run: AgentRun;
    }
  | {
      status: "error";
      taskId: string;
      model: AgentModel;
      message: string;
    };
type BatchDeployResult = {
  succeeded: string[];
  failed: Array<{ title: string; message: string }>;
};
// Grill v2 chat-first session state (spec section 7). A single session drives either a create
// interview (born from a typed intent) or a revise interview (born from a task card). The
// transcript is accumulated client-side because each route returns only the latest turn.
type GrillErrorInfo = { message: string; canRetry: boolean };
type GrillAnswerPayload = { message: string } | { draftNow: true };
type GrillState = {
  mode: "create" | "revise";
  date: string;
  grillId?: string; // absent only during the create intent phase / initial start
  taskId?: string; // revise only
  taskSnapshot?: TaskRecord; // revise: task at start, diff baseline until a task-changed 409
  freshTask?: TaskRecord; // revise: fresh task returned by a task-changed 409
  intent?: string; // create: the intent text, kept for retry + the copy-prompt fallback
  entries: GrillTranscriptEntry[]; // client-accumulated history
  active?: GrillActiveTurn; // the current turn awaiting user action
  phase: GrillChatPhase;
  error?: GrillErrorInfo;
  lastAnswer?: GrillAnswerPayload; // last answer/correction payload, for Retry
  failedStage?: "start" | "answer" | "apply";
  acknowledgedTaskUpdatedAt?: string; // survives Retry so a re-confirmed apply stays acknowledged
};
type ProgressSummary = {
  done: number;
  total: number;
  percent: number;
  remaining: number;
  nextMilestonePercent?: number;
  tasksToNext?: number;
};
type CompletionBurstState = {
  title: string;
  variant: "task" | "milestone" | "complete";
  done: number;
  total: number;
  remaining: number;
  percent: number;
  fact: CompletionFact;
};
type CompletionFact = DayCompletionFact;
type StudioTab = (typeof STUDIO_TAB_OPTIONS)[number]["value"];
type DensityMode = (typeof DENSITY_OPTIONS)[number]["value"];
type PaletteMode = (typeof PALETTE_OPTIONS)[number]["value"];
type ActiveDrag = {
  id: string;
  kind: "board" | "scheduled";
  taskId: string;
  task: TaskRecord;
};
type CalendarDropTarget = {
  taskId: string;
  minute: number;
  durationMinutes: number;
};
type CalendarHoverTooltip = {
  id: string;
  label: string;
  title: string;
  timeRange: string;
  duration: string;
  variant: "task" | "meeting" | "break";
  kind?: TaskKind;
  x: number;
  y: number;
  placement: "top" | "bottom";
};
type CalendarRange = {
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
};
type TaskCreationDraft = {
  title: string;
  objective: string;
  background: string;
  sourcesOverride: string;
  constraintsNonGoals: string;
  doneWhen: string;
  verification: string;
  kind: TaskKind;
  workDepth: WorkDepth;
  estimateMinutes: string;
  sourceKind: SourceKind;
  sources: CaptureSourceEntry[];
};
type TrackerCreationDraft = {
  person: string;
  work: string;
  status: TrackerRecord["status"];
  originalAskDate: string;
  notes: string;
  sourceKind: SourceKind;
  sources: CaptureSourceEntry[];
};
type CaptureSourceEntry = {
  label: string;
  url: string;
};
type CaptureTab = "task" | "tracker";
type CalendarLayoutItem<T> = {
  id: string;
  item: T;
  startMinute: number;
  endMinute: number;
  visibleStartMinute: number;
  visibleEndMinute: number;
};
type PackedCalendarLayout<T> = CalendarLayoutItem<T> & {
  overlapColumn: number;
  overlapColumnCount: number;
};
type CalendarMeetingItem = {
  type: "meeting";
  meeting: CalendarFile["meetings"][number];
};
type CalendarTaskItem = {
  type: "task";
  task: TaskRecord;
};
type CalendarBreakItem = {
  type: "break";
  dayBreak: DayPlan["breaks"][number];
};
type CalendarEventItem = CalendarMeetingItem | CalendarTaskItem | CalendarBreakItem;
type StudioBundle = Pick<DayBundle, "day" | "calendar"> & {
  paths?: Partial<DayBundle["paths"]>;
};
type CurrentStudioResponse = {
  today: string;
  selectedDate: string | null;
  todayExists: boolean;
  morningRunComplete: boolean;
  isFallback: boolean;
  availableDays: string[];
  bundle: StudioBundle | null;
  settings: PromptSettings;
  settingsWarning?: string;
};
type StudioHealthResponse = {
  config?: {
    directDeployEnabled?: boolean;
    grillEnabled?: boolean;
  };
};
type CurrentResolution = Pick<
  CurrentStudioResponse,
  "today" | "selectedDate" | "todayExists" | "morningRunComplete" | "isFallback"
>;
type LoadTarget = { kind: "current" } | { kind: "date"; date: string };
type ChipTooltipPlacement = "top" | "bottom";
type ChipTooltipState = {
  id: string;
  placement: ChipTooltipPlacement;
  text: string;
  x: number;
  y: number;
};
type ChipTooltipContextValue = {
  hide: (id: string) => void;
  show: (id: string, text: string, element: HTMLElement) => void;
};
const ChipTooltipContext = createContext<ChipTooltipContextValue | undefined>(undefined);

export function InteractiveMemoryStudio({ initialDate }: { initialDate?: string }) {
  const [loadTarget, setLoadTarget] = useState<LoadTarget>(() =>
    initialDate ? { kind: "date", date: initialDate } : { kind: "current" },
  );
  const [date, setDate] = useState(initialDate ?? "");
  const [day, setDay] = useState<DayPlan | undefined>();
  const [pendingDate, setPendingDate] = useState(initialDate ?? "");
  const [calendar, setCalendar] = useState<CalendarFile | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [settingsSaveState, setSettingsSaveState] = useState<SettingsSaveState>("idle");
  const [dirty, setDirty] = useState(false);
  const [currentResolution, setCurrentResolution] = useState<CurrentResolution | undefined>();
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [promptSettings, setPromptSettings] = useState<PromptSettings>(() =>
    defaultPromptSettings(),
  );
  const [settingsWarning, setSettingsWarning] = useState<string | undefined>();
  const [directDeployWarning, setDirectDeployWarning] = useState<string | undefined>(
    "Checking direct deploy configuration.",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | undefined>();
  const [isOverCalendarSlot, setIsOverCalendarSlot] = useState(false);
  const [completionBurst, setCompletionBurst] = useState<CompletionBurstState | undefined>();
  const [activeTab, setActiveTab] = useState<StudioTab>("plan");
  const [taskDraft, setTaskDraft] = useState<TaskCreationDraft>(() => createEmptyTaskDraft());
  const [trackerDraft, setTrackerDraft] = useState<TrackerCreationDraft>(() =>
    createEmptyTrackerDraft(
      initialDate || todayInTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    ),
  );
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTab, setCaptureTab] = useState<CaptureTab>("task");
  const [captureTouched, setCaptureTouched] = useState(false);
  const [trackersCollapsed, setTrackersCollapsed] = useState(() =>
    readBooleanPreference("interactive-memory-trackers-collapsed", false),
  );
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | undefined>();
  const [exitingTaskId, setExitingTaskId] = useState<string | undefined>();
  const [deleteMeetingCandidateId, setDeleteMeetingCandidateId] = useState<string | undefined>();
  const [closeTrackerCandidateId, setCloseTrackerCandidateId] = useState<string | undefined>();
  const [calendarReloading, setCalendarReloading] = useState(false);
  const [deployState, setDeployState] = useState<DeployState | undefined>();
  const [grillEnabled, setGrillEnabled] = useState(false);
  const [grillState, setGrillState] = useState<GrillState | undefined>();
  const [batchDeployOpen, setBatchDeployOpen] = useState(false);
  const [batchDeploySnapshot, setBatchDeploySnapshot] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [batchDeployModels, setBatchDeployModels] = useState<Record<string, AgentModel>>({});
  const [batchDeployBusy, setBatchDeployBusy] = useState(false);
  const [batchDeployResult, setBatchDeployResult] = useState<BatchDeployResult | undefined>();
  const [batchDeployExcluded, setBatchDeployExcluded] = useState<Set<string>>(new Set());
  const [densityMode, setDensityMode] = useState<DensityMode>(() =>
    readPreference("interactive-memory-density", "compact", DENSITY_OPTIONS),
  );
  const [paletteMode, setPaletteMode] = useState<PaletteMode>(() =>
    readPreference("interactive-memory-palette", "clear-day", PALETTE_OPTIONS),
  );
  const [fitDayEnabled, setFitDayEnabled] = useState(() =>
    readBooleanPreference("interactive-memory-fit-day", false),
  );
  const saveRequestRef = useRef(0);
  const baseUpdatedAtRef = useRef<string | undefined>(undefined);
  const latestUpdatedAtRef = useRef<string | undefined>(undefined);
  const latestPayloadRef = useRef<string | undefined>(undefined);
  const grillRunRef = useRef(0);
  const modalTitleId = selectedTaskId ? `task-modal-title-${selectedTaskId}` : undefined;
  const prefersReducedMotion = useReducedMotion();
  const rowHeight = Math.max(ROW_HEIGHT_BY_DENSITY[densityMode], ROW_HEIGHT_BY_DENSITY.comfortable);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    let cancelled = false;
    setLoadError(undefined);
    setDay(undefined);
    setCalendar(undefined);
    const endpoint =
      loadTarget.kind === "current" ? "/api/studio/current" : `/api/studio/day/${loadTarget.date}`;

    fetch(endpoint)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${response.status}`);
        }
        return response.json() as Promise<CurrentStudioResponse | DayBundle>;
      })
      .then((payload) => {
        if (cancelled) return;
        if (loadTarget.kind === "current") {
          const currentPayload = payload as CurrentStudioResponse;
          const bundle = currentPayload.bundle;
          const selectedDate = currentPayload.selectedDate;
          setCurrentResolution({
            today: currentPayload.today,
            selectedDate: currentPayload.selectedDate,
            todayExists: currentPayload.todayExists,
            morningRunComplete: currentPayload.morningRunComplete,
            isFallback: currentPayload.isFallback,
          });
          setAvailableDays(currentPayload.availableDays);
          setPromptSettings(currentPayload.settings);
          setSettingsWarning(currentPayload.settingsWarning);
          setDate(selectedDate ?? "");
          setPendingDate(selectedDate ?? "");
          setDay(bundle?.day);
          setCalendar(bundle?.calendar);
          baseUpdatedAtRef.current = bundle?.day.updatedAt;
        } else {
          const bundle = payload as DayBundle;
          const selectedDate = bundle.day.date || loadTarget.date;
          setCurrentResolution(undefined);
          setDate(selectedDate);
          setPendingDate(selectedDate);
          setDay(bundle.day);
          setCalendar(bundle.calendar);
          baseUpdatedAtRef.current = bundle.day.updatedAt;
        }
        setDirty(false);
        setSaveState("saved");
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load day.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadTarget]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/studio/health")
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as StudioHealthResponse & {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        return body;
      })
      .then((payload) => {
        if (cancelled) return;
        setDirectDeployWarning(
          payload.config?.directDeployEnabled
            ? undefined
            : "Direct deploy is disabled. Set WORKING_MEMORY_ENABLE_DIRECT_DEPLOY=true to enable it.",
        );
        setGrillEnabled(Boolean(payload.config?.grillEnabled));
      })
      .catch((error) => {
        if (cancelled) return;
        setDirectDeployWarning(
          error instanceof Error
            ? `Could not verify direct deploy config: ${error.message}`
            : "Could not verify direct deploy config.",
        );
        setGrillEnabled(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/studio/settings")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        return body as { settings: PromptSettings; warning?: string };
      })
      .then((payload) => {
        if (cancelled) return;
        setPromptSettings(payload.settings);
        setSettingsWarning(payload.warning);
        setSettingsSaveState("saved");
      })
      .catch((error) => {
        if (cancelled) return;
        setSettingsWarning(
          error instanceof Error ? error.message : "Prompt settings could not be loaded.",
        );
        setSettingsSaveState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pendingDate) return;
    if (pendingDate === date) return;
    if (dirty || saveState === "saving") return;
    setLoadTarget({ kind: "date", date: pendingDate });
  }, [date, dirty, pendingDate, saveState]);

  useEffect(() => {
    if (!day || !date || !dirty || saveState === "saving" || saveState === "error") return;
    const handle = window.setTimeout(() => {
      const requestId = saveRequestRef.current + 1;
      const snapshotUpdatedAt = day.updatedAt;
      const payload = JSON.stringify({ day, baseUpdatedAt: baseUpdatedAtRef.current });
      saveRequestRef.current = requestId;
      setSaveState("saving");
      fetch(`/api/studio/day/${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
      })
        .then(async (response) => {
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${response.status}`);
          }
          const body = (await response.json()) as DayBundle;
          if (
            saveRequestRef.current === requestId &&
            latestUpdatedAtRef.current === snapshotUpdatedAt &&
            latestPayloadRef.current === payload
          ) {
            const bundle = body as DayBundle;
            baseUpdatedAtRef.current = bundle.day.updatedAt;
            setDay(bundle.day);
            setCalendar(bundle.calendar);
            setDirty(false);
            setSaveState("saved");
          } else {
            setDirty(true);
            setSaveState("idle");
          }
        })
        .catch(() => {
          if (
            saveRequestRef.current === requestId &&
            latestUpdatedAtRef.current === snapshotUpdatedAt &&
            latestPayloadRef.current === payload
          ) {
            setSaveState("error");
          } else if (saveRequestRef.current === requestId) {
            setSaveState("idle");
          }
        });
    }, 450);

    return () => window.clearTimeout(handle);
  }, [date, day, dirty, saveState]);

  useEffect(() => {
    latestUpdatedAtRef.current = day?.updatedAt;
    latestPayloadRef.current = day
      ? JSON.stringify({ day, baseUpdatedAt: baseUpdatedAtRef.current })
      : undefined;
  }, [day]);

  useEffect(() => {
    if (!completionBurst) return;

    const handle = window.setTimeout(() => {
      setCompletionBurst(undefined);
    }, COMPLETION_BURST_DURATION_MS);

    return () => window.clearTimeout(handle);
  }, [completionBurst]);

  useEffect(() => {
    writePreference("interactive-memory-density", densityMode);
  }, [densityMode]);

  useEffect(() => {
    writePreference("interactive-memory-palette", paletteMode);
  }, [paletteMode]);

  useEffect(() => {
    writeBooleanPreference("interactive-memory-trackers-collapsed", trackersCollapsed);
  }, [trackersCollapsed]);

  useEffect(() => {
    writeBooleanPreference("interactive-memory-fit-day", fitDayEnabled);
  }, [fitDayEnabled]);

  const selectedTask = useMemo(
    () => day?.tasks.find((task) => task.id === selectedTaskId),
    [day?.tasks, selectedTaskId],
  );
  const deleteCandidate = useMemo(
    () => day?.tasks.find((task) => task.id === deleteCandidateId),
    [day?.tasks, deleteCandidateId],
  );
  const deleteMeetingCandidate = useMemo(
    () => calendar?.meetings.find((meeting) => meeting.id === deleteMeetingCandidateId),
    [calendar?.meetings, deleteMeetingCandidateId],
  );
  const closeTrackerCandidate = useMemo(
    () => day?.trackers.find((tracker) => tracker.id === closeTrackerCandidateId),
    [closeTrackerCandidateId, day?.trackers],
  );

  const progress = useMemo(() => {
    return summarizeProgress(day?.tasks ?? []);
  }, [day?.tasks]);
  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, TaskRecord[]> = {
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };
    for (const task of day?.tasks ?? []) {
      grouped[task.status].push(task);
    }
    return grouped;
  }, [day?.tasks]);
  const agentReadyTodoTasks = useMemo(
    () =>
      (day?.tasks ?? []).filter(
        (task) => task.status === "todo" && getTaskReadiness(task) === "ready",
      ),
    [day?.tasks],
  );
  const templatePromptWarningsCount = useMemo(
    () => validatePromptTemplate(promptSettings.promptTemplate).length,
    [promptSettings.promptTemplate],
  );
  const batchDeployDisabled =
    agentReadyTodoTasks.length === 0 ||
    saveState === "saving" ||
    Boolean(directDeployWarning) ||
    templatePromptWarningsCount > 0;
  const externalTrackers = useMemo(() => sortTrackers(day?.trackers ?? []), [day?.trackers]);
  const todayDate = useMemo(
    () => currentResolution?.today ?? (day ? todayInTimeZone(day.timezone) : ""),
    [currentResolution?.today, day],
  );
  const currentWarning = useMemo(
    () =>
      currentResolutionWarning(currentResolution) ??
      selectedDayMorningWarning(day, date, todayDate),
    [currentResolution, date, day, todayDate],
  );

  function commit(nextDay: DayPlan) {
    setDay({ ...nextDay, updatedAt: new Date().toISOString() });
    setDirty(true);
    if (saveState !== "saving") {
      setSaveState("idle");
    }
  }

  async function saveDayNow(currentDay = day) {
    if (!currentDay || !date) throw new Error("No day is loaded.");
    const requestId = saveRequestRef.current + 1;
    const snapshotUpdatedAt = currentDay.updatedAt;
    const payload = JSON.stringify({ day: currentDay, baseUpdatedAt: baseUpdatedAtRef.current });
    saveRequestRef.current = requestId;
    latestUpdatedAtRef.current = snapshotUpdatedAt;
    latestPayloadRef.current = payload;
    setSaveState("saving");
    const response = await fetch(`/api/studio/day/${date}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setSaveState("error");
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    const bundle = (await response.json()) as DayBundle;
    baseUpdatedAtRef.current = bundle.day.updatedAt;
    setDay(bundle.day);
    setCalendar(bundle.calendar);
    setDirty(false);
    setSaveState("saved");
    return bundle;
  }

  async function performDeploy(
    taskId: string,
    model: AgentModel,
  ): Promise<{ ok: true; run: AgentRun; message: string } | { ok: false; message: string }> {
    if (!date) return { ok: false, message: "No day loaded." };
    try {
      const response = await fetch(`/api/studio/day/${date}/tasks/${taskId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, baseUpdatedAt: baseUpdatedAtRef.current }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      const payload = body as { bundle: DayBundle; run: AgentRun; message?: string };
      baseUpdatedAtRef.current = payload.bundle.day.updatedAt;
      setDay(payload.bundle.day);
      setCalendar(payload.bundle.calendar);
      setDirty(false);
      setSaveState("saved");
      return {
        ok: true,
        run: payload.run,
        message: payload.message || `Deployed ${agentModelUiLabel(model)}.`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Agent deploy failed.",
      };
    }
  }

  async function deployTask(taskId: string, model: AgentModel) {
    if (!day || !date || saveState === "saving") return;
    setDeployState({ status: "deploying", taskId, model });
    try {
      if (dirty) await saveDayNow(day);
      const result = await performDeploy(taskId, model);
      setDeployState(
        result.ok
          ? { status: "success", taskId, model, message: result.message, run: result.run }
          : { status: "error", taskId, model, message: result.message },
      );
    } catch (error) {
      setDeployState({
        status: "error",
        taskId,
        model,
        message: error instanceof Error ? error.message : "Agent deploy failed.",
      });
    }
  }

  async function deployTasksBatch(
    taskIds: Array<{ id: string; title: string }>,
    models: Record<string, AgentModel>,
  ) {
    if (!day || !date || saveState === "saving" || taskIds.length === 0) return;
    setBatchDeployBusy(true);
    setBatchDeployResult(undefined);
    try {
      if (dirty) await saveDayNow(day);
      const succeeded: string[] = [];
      const failed: Array<{ title: string; message: string }> = [];
      for (const { id, title } of taskIds) {
        const result = await performDeploy(id, models[id] ?? "sonnet");
        if (result.ok) {
          succeeded.push(title);
        } else {
          failed.push({ title, message: result.message });
        }
      }
      setBatchDeployResult({ succeeded, failed });
    } catch (error) {
      setBatchDeployResult({
        succeeded: [],
        failed: taskIds.map(({ title }) => ({
          title,
          message: error instanceof Error ? error.message : "Save failed before deploy.",
        })),
      });
    } finally {
      setBatchDeployBusy(false);
    }
  }

  // --- Grill v2: chat-first ticket creation and revision (spec section 7) ---
  // The parent owns the session state machine and every fetch; GrillChatDrawer renders it. Each
  // route returns only the latest turn, so the transcript is accumulated here client-side.

  async function grillRequest(
    url: string,
    init: RequestInit,
  ): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
    const response = await fetch(url, init);
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, body };
  }

  function grillTurnToActive(turn: GrillTurn, computedWarnings?: string[]): GrillActiveTurn {
    if (turn.kind === "proposal") {
      return { kind: "proposal", proposal: turn, warnings: computedWarnings ?? [] };
    }
    return { kind: "questions", note: turn.note, questions: turn.questions };
  }

  // Map an HTTP failure to a phase (spec 7.2): 410 loses the conversation; 503 (CLI missing) has
  // no retry and only the copy-prompt fallback; 502/504/500/network offer Retry.
  function applyGrillFailure(status: number, message: string, stage: "start" | "answer" | "apply") {
    setGrillState((current) => {
      if (!current) return current;
      if (status === 410)
        return { ...current, phase: "lost", error: undefined, failedStage: stage };
      return {
        ...current,
        phase: "error",
        error: { message, canRetry: status !== 503 },
        failedStage: stage,
      };
    });
  }

  function discardGrill() {
    grillRunRef.current += 1;
    const current = grillState;
    if (current?.grillId) {
      void fetch(`/api/studio/day/${current.date}/grill/${current.grillId}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    setGrillState(undefined);
  }

  function grillNewTicket() {
    if (!date) return;
    discardGrill();
    setGrillState({ mode: "create", date, entries: [], phase: "intent" });
  }

  async function runGrillCreateStart(grillDate: string, intent: string) {
    const runId = ++grillRunRef.current;
    setGrillState((prev) =>
      prev ? { ...prev, intent, phase: "waiting", error: undefined } : prev,
    );
    try {
      const { ok, status, body } = await grillRequest(`/api/studio/day/${grillDate}/grill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "create", intent }),
      });
      if (grillRunRef.current !== runId) return;
      if (!ok) {
        applyGrillFailure(status, (body.error as string) || `HTTP ${status}`, "start");
        return;
      }
      const active = grillTurnToActive(body.turn as GrillTurn, body.computedWarnings as string[]);
      setGrillState((prev) =>
        prev
          ? {
              ...prev,
              grillId: body.grillId as string,
              active,
              phase: active.kind === "proposal" ? "proposal" : "chatting",
              error: undefined,
            }
          : prev,
      );
    } catch (error) {
      if (grillRunRef.current !== runId) return;
      applyGrillFailure(
        0,
        error instanceof Error ? error.message : "Could not start the grill interview.",
        "start",
      );
    }
  }

  function sendGrillIntent(intent: string) {
    const current = grillState;
    if (!current || current.mode !== "create") return;
    setGrillState((prev) =>
      prev
        ? {
            ...prev,
            entries: [...prev.entries, { id: crypto.randomUUID(), role: "user", text: intent }],
          }
        : prev,
    );
    void runGrillCreateStart(current.date, intent);
  }

  async function runGrillReviseStart(
    grillDate: string,
    taskId: string,
    task: TaskRecord,
    restart: boolean,
  ) {
    const runId = ++grillRunRef.current;
    setGrillState((prev) => (prev ? { ...prev, phase: "waiting", error: undefined } : prev));
    try {
      const { ok, status, body } = await grillRequest(`/api/studio/day/${grillDate}/grill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "revise", taskId, ...(restart ? { restart: true } : {}) }),
      });
      if (grillRunRef.current !== runId) return;
      if (!ok) {
        applyGrillFailure(status, (body.error as string) || `HTTP ${status}`, "start");
        return;
      }
      const active = grillTurnToActive(body.turn as GrillTurn, body.computedWarnings as string[]);
      setGrillState((prev) =>
        prev
          ? {
              ...prev,
              grillId: body.grillId as string,
              taskSnapshot: task,
              active,
              phase: active.kind === "proposal" ? "proposal" : "chatting",
              error: undefined,
            }
          : prev,
      );
    } catch (error) {
      if (grillRunRef.current !== runId) return;
      applyGrillFailure(
        0,
        error instanceof Error ? error.message : "Could not start the grill interview.",
        "start",
      );
    }
  }

  function grillReviseTask(task: TaskRecord, options?: { restart?: boolean }) {
    if (!date) return;
    const existing = grillState;
    if (
      existing?.mode === "revise" &&
      existing.taskId === task.id &&
      existing.phase !== "error" &&
      existing.phase !== "lost" &&
      !options?.restart
    ) {
      return;
    }
    const sameTaskExisting = existing?.mode === "revise" && existing.taskId === task.id;
    discardGrill();
    setGrillState({
      mode: "revise",
      date,
      taskId: task.id,
      taskSnapshot: task,
      entries: [],
      phase: "waiting",
    });
    void runGrillReviseStart(date, task.id, task, Boolean(options?.restart) || sameTaskExisting);
  }

  async function runGrillAnswer(grillDate: string, grillId: string, payload: GrillAnswerPayload) {
    const runId = ++grillRunRef.current;
    setGrillState((prev) =>
      prev ? { ...prev, phase: "waiting", error: undefined, lastAnswer: payload } : prev,
    );
    try {
      const { ok, status, body } = await grillRequest(
        `/api/studio/day/${grillDate}/grill/${grillId}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (grillRunRef.current !== runId) return;
      if (!ok) {
        applyGrillFailure(status, (body.error as string) || `HTTP ${status}`, "answer");
        return;
      }
      const active = grillTurnToActive(body.turn as GrillTurn, body.computedWarnings as string[]);
      setGrillState((prev) =>
        prev
          ? {
              ...prev,
              active,
              phase: active.kind === "proposal" ? "proposal" : "chatting",
              error: undefined,
            }
          : prev,
      );
    } catch (error) {
      if (grillRunRef.current !== runId) return;
      applyGrillFailure(
        0,
        error instanceof Error ? error.message : "The grill interview hit an error.",
        "answer",
      );
    }
  }

  function sendGrillMessage(payload: GrillAnswerPayload) {
    const current = grillState;
    if (!current?.grillId) return;
    if (current.phase !== "chatting" && current.phase !== "proposal") return;
    // Collapse the turn being answered + the user's message into history, then clear active.
    setGrillState((prev) => {
      if (!prev) return prev;
      const additions: GrillTranscriptEntry[] = [];
      if (prev.active?.kind === "questions") {
        additions.push({
          id: crypto.randomUUID(),
          role: "questions",
          note: prev.active.note,
          questions: prev.active.questions,
        });
      } else if (prev.active?.kind === "proposal") {
        additions.push({
          id: crypto.randomUUID(),
          role: "proposal",
          proposal: prev.active.proposal,
          warnings: prev.active.warnings,
        });
      }
      additions.push({
        id: crypto.randomUUID(),
        role: "user",
        text: "draftNow" in payload ? "Good enough, draft it." : payload.message,
      });
      return { ...prev, entries: [...prev.entries, ...additions], active: undefined };
    });
    void runGrillAnswer(current.date, current.grillId, payload);
  }

  async function applyGrillProposal(attempt = 0, acknowledge = false) {
    const current = grillState;
    if (!current?.grillId || current.active?.kind !== "proposal") return;
    const { date: grillDate, grillId } = current;
    const proposal = current.active.proposal;
    const acknowledgeTaskUpdatedAt =
      acknowledge && current.freshTask
        ? current.freshTask.updatedAt
        : current.acknowledgedTaskUpdatedAt;
    const runId = ++grillRunRef.current;
    setGrillState((prev) =>
      prev
        ? {
            ...prev,
            phase: "applying",
            error: undefined,
            acknowledgedTaskUpdatedAt: acknowledgeTaskUpdatedAt,
          }
        : prev,
    );
    // Dirty-flush before apply (spec 7.2): persist unsaved board edits first, else mid-chat edits
    // are clobbered or the debounced autosave 409s after apply. Only on the first attempt: the
    // day-conflict retry (attempt > 0) already flushed, and re-flushing a now-stale baseUpdatedAt
    // would surface a bogus save error instead of a clean apply retry.
    try {
      if (attempt === 0 && dirty) await saveDayNow(day);
    } catch (error) {
      if (grillRunRef.current !== runId) return;
      applyGrillFailure(
        0,
        error instanceof Error ? error.message : "Could not save local edits before applying.",
        "apply",
      );
      return;
    }
    if (grillRunRef.current !== runId) return;
    try {
      const { ok, status, body } = await grillRequest(
        `/api/studio/day/${grillDate}/grill/${grillId}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposal,
            ...(acknowledgeTaskUpdatedAt ? { acknowledgeTaskUpdatedAt } : {}),
          }),
        },
      );
      if (grillRunRef.current !== runId) return;
      if (!ok) {
        const code = body.code as string | undefined;
        if (status === 409 && code === "task-changed" && body.freshTask) {
          setGrillState((prev) =>
            prev
              ? {
                  ...prev,
                  phase: "task-changed",
                  freshTask: body.freshTask as TaskRecord,
                  error: undefined,
                  // a new conflict invalidates any prior acknowledgement
                  acknowledgedTaskUpdatedAt: undefined,
                }
              : prev,
          );
          return;
        }
        if (status === 409 && code === "proposal-stale") {
          await resyncGrillProposal(grillDate, grillId, runId);
          return;
        }
        if (status === 409 && code === "day-conflict" && attempt === 0) {
          // Auto-retry apply exactly once; the apply route re-reads the day on each call.
          await applyGrillProposal(1, acknowledge);
          return;
        }
        applyGrillFailure(status, (body.error as string) || `HTTP ${status}`, "apply");
        return;
      }
      const nextDay = body.day as DayPlan | undefined;
      if (nextDay) {
        baseUpdatedAtRef.current = nextDay.updatedAt;
        setDay(nextDay);
        setDirty(false);
        setSaveState("saved");
      }
      // done (spec 7.2): drawer closes, board refreshes from the returned day.
      setGrillState(undefined);
    } catch (error) {
      if (grillRunRef.current !== runId) return;
      applyGrillFailure(
        0,
        error instanceof Error ? error.message : "Applying the proposal failed.",
        "apply",
      );
    }
  }

  // proposal-stale 409: the echoed proposal is not the session's current one. Re-sync via GET and
  // REPLACE the active proposal card (never append) so the user reviews the live proposal.
  async function resyncGrillProposal(grillDate: string, grillId: string, runId: number) {
    try {
      const { ok, status, body } = await grillRequest(
        `/api/studio/day/${grillDate}/grill/${grillId}`,
        { method: "GET" },
      );
      if (grillRunRef.current !== runId) return;
      if (!ok) {
        applyGrillFailure(status, (body.error as string) || `HTTP ${status}`, "apply");
        return;
      }
      const turn = body.turn as GrillTurn | undefined;
      if (!turn) {
        applyGrillFailure(0, "The grill session is no longer on a proposal.", "apply");
        return;
      }
      const active = grillTurnToActive(turn, body.computedWarnings as string[]);
      setGrillState((prev) =>
        prev
          ? {
              ...prev,
              active,
              phase: active.kind === "proposal" ? "proposal" : "chatting",
              error: undefined,
            }
          : prev,
      );
    } catch (error) {
      if (grillRunRef.current !== runId) return;
      applyGrillFailure(
        0,
        error instanceof Error ? error.message : "Could not re-sync the grill session.",
        "apply",
      );
    }
  }

  function retryGrill() {
    const current = grillState;
    if (!current) return;
    if (current.failedStage === "start") {
      if (current.mode === "create" && current.intent) {
        void runGrillCreateStart(current.date, current.intent);
      } else if (current.mode === "revise" && current.taskId && current.taskSnapshot) {
        void runGrillReviseStart(current.date, current.taskId, current.taskSnapshot, true);
      }
      return;
    }
    if (current.failedStage === "answer" && current.lastAnswer && current.grillId) {
      void runGrillAnswer(current.date, current.grillId, current.lastAnswer);
      return;
    }
    if (current.failedStage === "apply") {
      void applyGrillProposal(0);
    }
  }

  function startOverGrill() {
    const current = grillState;
    if (!current) return;
    if (current.mode === "create") {
      setGrillState({ mode: "create", date: current.date, entries: [], phase: "intent" });
    } else if (current.taskId && current.taskSnapshot) {
      grillReviseTask(current.taskSnapshot, { restart: true });
    }
  }

  async function copyActiveGrillPrompt() {
    const current = grillState;
    if (!current) return;
    if (current.mode === "revise" && current.taskSnapshot) {
      await copyGrillPrompt(current.taskSnapshot);
    } else if (current.mode === "create") {
      await navigator.clipboard.writeText(buildCreateGrillPromptText(current.intent ?? ""));
    }
  }

  function savePromptSettings(nextTemplate: string) {
    const templateWarnings = validatePromptTemplate(nextTemplate);
    if (
      templateWarnings.some((warning) => warning.includes("{{ticketBody}}")) &&
      !window.confirm(
        "This template does not include {{ticketBody}}, so copied prompts may omit the qualified work order.\n\nSave anyway?",
      )
    ) {
      return;
    }
    const nextSettings: PromptSettings = {
      ...promptSettings,
      promptTemplate: nextTemplate,
    };
    setSettingsSaveState("saving");
    fetch("/api/studio/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextSettings),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        const payload = body as { settings: PromptSettings; warnings?: string[] };
        setPromptSettings(payload.settings);
        setSettingsWarning(
          payload.warnings?.length
            ? `Prompt template warning: ${payload.warnings.join(" ")}`
            : undefined,
        );
        setSettingsSaveState("saved");
      })
      .catch((error) => {
        setSettingsWarning(
          error instanceof Error ? error.message : "Prompt settings could not be saved.",
        );
        setSettingsSaveState("error");
      });
  }

  function updateTask(taskId: string, update: (task: TaskRecord) => TaskRecord) {
    if (!day) return;
    const before = day.tasks.find((task) => task.id === taskId);
    const nextTasks = day.tasks.map((task) =>
      task.id === taskId ? { ...update(task), updatedAt: new Date().toISOString() } : task,
    );
    const after = nextTasks.find((task) => task.id === taskId);

    if (before?.status !== "done" && after?.status === "done") {
      celebrate(after.title, summarizeProgress(day.tasks), summarizeProgress(nextTasks));
    }

    commit({ ...day, tasks: nextTasks });
  }

  // updateTask closes over `day`/`commit` and is recreated every render; forward
  // through a ref so the memoized ScheduledTaskBlock gets a stable onResizeTask.
  const updateTaskRef = useRef(updateTask);
  updateTaskRef.current = updateTask;
  const handleResizeTask = useCallback(
    (taskId: string, nextEndMinute: number) => {
      updateTaskRef.current(taskId, (task) =>
        applyScheduledEnd(task, nextEndMinute, day?.date ?? "", CALENDAR_INTERACTION_MINUTES),
      );
    },
    [day?.date],
  );

  const removeTaskFromDay = useCallback((taskId: string) => {
    setDay((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.filter((task) => task.id !== taskId),
            updatedAt: new Date().toISOString(),
          }
        : current,
    );
    setDirty(true);
    setSaveState((current) => (current === "saving" ? current : "idle"));
  }, []);

  function deleteTask(taskId: string) {
    if (!day) return;
    if (selectedTaskId === taskId) setSelectedTaskId(undefined);
    if (deleteCandidateId === taskId) setDeleteCandidateId(undefined);
    if (prefersReducedMotion) {
      removeTaskFromDay(taskId);
      return;
    }
    // Defer the actual removal so the card's exit animation can play in the
    // lane before it disappears from `day.tasks` (see finalizeExitingTask effect).
    setExitingTaskId(taskId);
  }

  useEffect(() => {
    if (!exitingTaskId) return;
    const handle = window.setTimeout(() => {
      removeTaskFromDay(exitingTaskId);
      setExitingTaskId(undefined);
    }, MOTION.duration.card * 1000);

    return () => window.clearTimeout(handle);
  }, [exitingTaskId, removeTaskFromDay]);

  function deleteMeeting(meetingId: string) {
    if (!calendar || !date) return;
    const nextCalendar: CalendarFile = {
      ...calendar,
      generatedAt: new Date().toISOString(),
      meetings: calendar.meetings.filter((meeting) => meeting.id !== meetingId),
    };
    setCalendar(nextCalendar);
    if (deleteMeetingCandidateId === meetingId) setDeleteMeetingCandidateId(undefined);

    fetch(`/api/studio/day/${date}/calendar`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextCalendar),
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${response.status}`);
        }
      })
      .catch(() => {
        setCalendar(calendar);
      });
  }

  function closeTracker(trackerId: string) {
    if (!day) return;
    const now = new Date().toISOString();
    commit({
      ...day,
      trackers: day.trackers.map((tracker) =>
        tracker.id === trackerId
          ? {
              ...tracker,
              status: "done",
              updatedAt: now,
              completedAt: now,
            }
          : tracker,
      ),
    });
    if (closeTrackerCandidateId === trackerId) setCloseTrackerCandidateId(undefined);
  }

  function openCapture(tab: CaptureTab) {
    if (tab === "tracker") {
      setTrackerDraft((current) => ({
        ...current,
        originalAskDate:
          !current.person.trim() && !current.work.trim() && !current.notes.trim()
            ? day?.date || date || todayDate
            : current.originalAskDate || day?.date || date || todayDate,
      }));
    }
    setCaptureTab(tab);
    setCaptureTouched(false);
    setCaptureOpen(true);
  }

  function closeCapture() {
    setCaptureOpen(false);
    setCaptureTouched(false);
  }

  function addTask(options?: { select?: boolean }): { taskId: string; day: DayPlan } | undefined {
    const missingFields = validateTaskDraft(taskDraft);
    setCaptureTouched(true);
    if (!day || missingFields.length > 0) {
      return undefined;
    }
    const now = new Date().toISOString();
    const sourceRefs = sourceRefsFromDraft(taskDraft, "Manual capture");
    const ticketFields = taskTicketFieldsFromDraft(taskDraft);
    // Single constructor (spec 6.2): buildNewTask owns the structural defaults (status, timestamps,
    // empty collections, unscheduled) shared with the grill create-apply path. Capture-specific
    // values (the readable slug id, suggested agent, source refs) are layered on top so the task
    // matches the previous manual-capture output, then readiness is computed LAST on the final task.
    const baseTask: TaskRecord = {
      ...buildNewTask({
        title: taskDraft.title,
        kind: taskDraft.kind,
        estimateMinutes: parseEstimateDraft(taskDraft.estimateMinutes, 30),
        workDepth: taskDraft.workDepth,
        ticketFields,
      }),
      id: createUniqueTaskId(day.date, taskDraft.title, day.tasks),
      agentName:
        suggestAgentName({
          title: taskDraft.title.trim(),
          ticketFields,
          sourceRefs,
        }) || undefined,
      sourceRefs,
      createdAt: now,
      updatedAt: now,
    };
    const task: TaskRecord = {
      ...baseTask,
      agentReadiness: getTaskReadiness(baseTask),
      readinessWarnings: getPromptWarnings(baseTask),
    };
    const nextDay: DayPlan = { ...day, tasks: [task, ...day.tasks], updatedAt: now };
    commit(nextDay);
    setTaskDraft(createEmptyTaskDraft());
    closeCapture();
    if (options?.select ?? true) setSelectedTaskId(task.id);
    return { taskId: task.id, day: nextDay };
  }

  function addTracker() {
    const missingFields = validateTrackerDraft(trackerDraft);
    setCaptureTouched(true);
    if (!day || missingFields.length > 0) return;

    const now = new Date().toISOString();
    const tracker: TrackerRecord = {
      id: createUniqueTrackerId(day.date, trackerDraft.person, trackerDraft.work, day.trackers),
      person: trackerDraft.person.trim(),
      work: trackerDraft.work.trim(),
      status: trackerDraft.status,
      originalAskDate: trackerDraft.originalAskDate,
      sourceRefs: sourceRefsFromDraft(trackerDraft, "Manual tracker capture"),
      notes: trackerDraft.notes.trim(),
      createdAt: now,
      updatedAt: now,
    };
    commit({ ...day, trackers: [tracker, ...day.trackers] });
    setTrackerDraft(createEmptyTrackerDraft(day.date));
    setTrackersCollapsed(false);
    closeCapture();
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    const taskId = taskIdFromDragId(id);
    const task = day?.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    setIsOverCalendarSlot(false);
    setActiveDrag({
      id,
      kind: id.startsWith("scheduled:") ? "scheduled" : "board",
      taskId,
      task,
    });
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id ? String(event.over.id) : "";
    const next = overId.startsWith("slot:");
    setIsOverCalendarSlot((current) => (current === next ? current : next));
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const taskId = taskIdFromDragId(activeId);
    const overId = event.over?.id ? String(event.over.id) : "";
    setActiveDrag(undefined);
    setIsOverCalendarSlot(false);
    if (!day || !overId) return;

    if (overId.startsWith("status:")) {
      const status = overId.replace("status:", "");
      if (!isTaskStatus(status)) return;
      updateTask(taskId, (task) => ({
        ...task,
        status,
        completedAt: status === "done" ? new Date().toISOString() : undefined,
      }));
      return;
    }

    if (overId === "unscheduled") {
      updateTask(taskId, (task) => ({
        ...task,
        scheduledStart: undefined,
        scheduledEnd: undefined,
      }));
      return;
    }

    if (overId.startsWith("slot:")) {
      const minute = Number(overId.replace("slot:", ""));
      updateTask(taskId, (task) => ({
        ...task,
        scheduledStart: dateTimeFromMinutes(day.date, minute),
        scheduledEnd: dateTimeFromMinutes(
          day.date,
          minute +
            (activeId.startsWith("scheduled:")
              ? scheduledTaskMinutes(task)
              : normalizeEstimateMinutes(task.estimateMinutes)),
        ),
      }));
    }
  }

  function celebrate(
    title: string,
    beforeProgress: ProgressSummary,
    afterProgress: ProgressSummary,
  ) {
    const crossedMilestone = PROGRESS_MILESTONES.find(
      (milestone) => beforeProgress.percent < milestone && afterProgress.percent >= milestone,
    );
    const variant =
      afterProgress.percent === 100 ? "complete" : crossedMilestone ? "milestone" : "task";
    const dailyFacts = day?.completionFacts;
    const factPool =
      Array.isArray(dailyFacts) && dailyFacts.length > 0 ? dailyFacts : COMPLETION_FACTS;
    setCompletionBurst({
      title,
      variant,
      done: afterProgress.done,
      total: afterProgress.total,
      remaining: afterProgress.remaining,
      percent: afterProgress.percent,
      fact: completionFactForTask(title, afterProgress, factPool),
    });
    if (!prefersReducedMotion) {
      if (variant === "task") {
        void confetti({
          particleCount: 56,
          spread: 46,
          origin: { y: 0.76 },
          scalar: 0.86,
          colors: ["#3df2b4", "#ffe066", "#5ee7ff"],
        });
      } else {
        void confetti({
          particleCount: variant === "complete" ? 220 : 130,
          spread: variant === "complete" ? 84 : 64,
          origin: { y: 0.72 },
          colors: ["#3df2b4", "#ff6b8a", "#ffe066", "#5ee7ff", "#ff8f3d"],
        });
        window.setTimeout(() => {
          void confetti({
            particleCount: variant === "complete" ? 130 : 70,
            angle: 60,
            spread: 58,
            origin: { x: 0, y: 0.84 },
            colors: ["#3df2b4", "#ffe066", "#ff6b8a"],
          });
          void confetti({
            particleCount: variant === "complete" ? 130 : 70,
            angle: 120,
            spread: 58,
            origin: { x: 1, y: 0.84 },
            colors: ["#5ee7ff", "#ff8f3d", "#d4ff5f"],
          });
        }, 220);
      }
    }
  }

  function reloadCalendar() {
    if (!day || !date) return;
    setCalendarReloading(true);
    fetch(`/api/studio/day/${date}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
        setCalendar((body as DayBundle).calendar);
      })
      .catch((error) => {
        setCalendar({
          schemaVersion: CALENDAR_SCHEMA_VERSION,
          date: day.date,
          timezone: day.timezone,
          source: "unavailable",
          generatedAt: new Date().toISOString(),
          meetings: [],
          error: error instanceof Error ? error.message : "Calendar reload failed.",
        });
      })
      .finally(() => setCalendarReloading(false));
  }

  if (loadError) {
    return (
      <main className="studio-shell studio-error">
        <motion.div
          className="studio-empty-panel"
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: MOTION.duration.modal, ease: MOTION.ease.out }}
        >
          <Flame className="h-8 w-8" />
          <h1>Interactive Working Memory</h1>
          <p>{loadError}</p>
        </motion.div>
      </main>
    );
  }

  if (!day || !calendar) {
    const emptyArchiveWarning = currentResolutionWarning(currentResolution);
    if (currentResolution && !currentResolution.selectedDate) {
      return (
        <main className={cn("studio-shell", `theme-${paletteMode}`, `density-${densityMode}`)}>
          {emptyArchiveWarning ? <StudioCurrentWarning message={emptyArchiveWarning} /> : null}
          <motion.div
            className="studio-empty-panel"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: MOTION.duration.modal, ease: MOTION.ease.out }}
          >
            <Flame className="h-8 w-8" />
            <h1>Interactive Working Memory</h1>
            <p>
              No interactive day archives exist yet. Run the Good Morning routine to create today.
            </p>
          </motion.div>
        </main>
      );
    }
    return (
      <main className="studio-shell studio-loading">
        <motion.div
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: MOTION.duration.modal, ease: MOTION.ease.out }}
        >
          <Loader2 className="h-8 w-8 animate-spin" />
        </motion.div>
      </main>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <ChipTooltipProvider>
        <DndContext
          collisionDetection={calendarAwareCollisionDetection}
          onDragCancel={() => {
            setActiveDrag(undefined);
            setIsOverCalendarSlot(false);
          }}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragStart={handleDragStart}
          sensors={sensors}
        >
          <main
            className={cn("studio-shell", `theme-${paletteMode}`, `density-${densityMode}`)}
            data-layout="split"
          >
            <StudioHeader
              activeTab={activeTab}
              availableDays={availableDays}
              batchDeployCount={agentReadyTodoTasks.length}
              batchDeployDisabled={batchDeployDisabled}
              densityMode={densityMode}
              date={date}
              day={day}
              onOpenBatchDeploy={() => {
                setBatchDeploySnapshot(
                  agentReadyTodoTasks.map((task) => ({ id: task.id, title: task.title })),
                );
                setBatchDeployModels(
                  Object.fromEntries(
                    agentReadyTodoTasks.map((task) => [task.id, "sonnet" as AgentModel]),
                  ),
                );
                setBatchDeployResult(undefined);
                setBatchDeployExcluded(new Set());
                setBatchDeployOpen(true);
              }}
              grillEnabled={grillEnabled}
              onGrillNew={grillNewTicket}
              paletteMode={paletteMode}
              saveState={saveState}
              setActiveTab={setActiveTab}
              setCaptureOpen={() => openCapture("task")}
              setSettingsOpen={setSettingsOpen}
              setPendingDate={setPendingDate}
              setDensityMode={setDensityMode}
              setPaletteMode={setPaletteMode}
            />

            <AnimatePresence>
              {currentWarning ? (
                <StudioCurrentWarning key="current-warning" message={currentWarning} />
              ) : null}
            </AnimatePresence>
            <AnimatePresence>
              {settingsWarning ? (
                <StudioCurrentWarning key="settings-warning" message={settingsWarning} />
              ) : null}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {activeTab === "plan" ? (
                <motion.section
                  key="plan"
                  className={cn("studio-main", "layout-split", currentWarning && "has-warning")}
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
                  transition={{
                    duration: prefersReducedMotion ? 0.1 : MOTION.duration.micro,
                    ease: MOTION.ease.out,
                  }}
                >
                  <section className="studio-left">
                    <div className="board-progress">
                      <CompletionTracker progress={progress} />
                    </div>
                    <ExternalTrackersPanel
                      collapsed={trackersCollapsed}
                      onOpenCreateTracker={() => openCapture("tracker")}
                      onRequestClose={setCloseTrackerCandidateId}
                      onToggleCollapsed={() => setTrackersCollapsed((current) => !current)}
                      trackers={externalTrackers}
                      workDate={day.date}
                    />

                    <div className="lane-grid">
                      {STATUS_ORDER.map((status) => (
                        <TaskLane
                          exitingTaskId={exitingTaskId}
                          grillEnabled={grillEnabled}
                          grillingTaskId={
                            grillState?.mode === "revise" ? grillState.taskId : undefined
                          }
                          key={status}
                          onCopyGrillPrompt={copyGrillPrompt}
                          onGrillTask={grillReviseTask}
                          onRequestDelete={setDeleteCandidateId}
                          onSelect={setSelectedTaskId}
                          status={status}
                          tasks={tasksByStatus[status]}
                          workDate={day.date}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="studio-right">
                    <CompletionTracker progress={progress} />
                    <DayCalendar
                      calendar={calendar}
                      fitDayEnabled={fitDayEnabled}
                      isReloading={calendarReloading}
                      day={day}
                      onRequestDelete={setDeleteCandidateId}
                      onRequestDeleteMeeting={setDeleteMeetingCandidateId}
                      onSelectTask={setSelectedTaskId}
                      onResizeTask={handleResizeTask}
                      onReloadCalendar={reloadCalendar}
                      onToggleFitDay={() => setFitDayEnabled(!fitDayEnabled)}
                      rowHeight={rowHeight}
                    />
                  </section>
                </motion.section>
              ) : (
                <IdeasPanel
                  key="notes"
                  day={day}
                  onChange={(text) =>
                    commit({
                      ...day,
                      ideas: {
                        text,
                        updatedAt: new Date().toISOString(),
                      },
                    })
                  }
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {selectedTask ? (
                <TaskModal
                  key={selectedTask.id}
                  onClose={() => setSelectedTaskId(undefined)}
                  promptSettings={promptSettings}
                  deployState={deployState?.taskId === selectedTask.id ? deployState : undefined}
                  deployDisabled={saveState === "saving" || Boolean(directDeployWarning)}
                  deployDisabledReason={
                    saveState === "saving" ? "Save is in progress." : directDeployWarning
                  }
                  onDeploy={(model) => deployTask(selectedTask.id, model)}
                  grillEnabled={grillEnabled}
                  grillInProgress={
                    grillState?.mode === "revise" && grillState.taskId === selectedTask.id
                  }
                  onGrill={(task) => {
                    setSelectedTaskId(undefined);
                    grillReviseTask(task);
                  }}
                  titleId={modalTitleId}
                  task={selectedTask}
                  updateTask={(update) => updateTask(selectedTask.id, update)}
                  workDate={day.date}
                />
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {grillState ? (
                <GrillChatDrawer
                  active={grillState.active}
                  busy={grillState.phase === "waiting" || grillState.phase === "applying"}
                  diffBaseline={
                    grillState.mode === "revise"
                      ? (grillState.freshTask ?? grillState.taskSnapshot)
                      : undefined
                  }
                  entries={grillState.entries}
                  error={grillState.error}
                  freshTask={grillState.freshTask}
                  headerTitle={
                    grillState.mode === "revise"
                      ? (grillState.taskSnapshot?.title ?? "Revise ticket")
                      : "New ticket"
                  }
                  key={`${grillState.mode}:${grillState.taskId ?? "new"}`}
                  mode={grillState.mode}
                  onApply={() => void applyGrillProposal(0, false)}
                  onCopyPrompt={copyActiveGrillPrompt}
                  onDiscard={discardGrill}
                  onDraftNow={() => sendGrillMessage({ draftNow: true })}
                  onReconfirmTaskChanged={() => void applyGrillProposal(0, true)}
                  onRetry={retryGrill}
                  onSendIntent={sendGrillIntent}
                  onSendMessage={(text) => sendGrillMessage({ message: text })}
                  onStartOver={startOverGrill}
                  phase={grillState.phase}
                />
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {batchDeployOpen ? (
                <BatchDeployConfirm
                  key="batch-deploy"
                  busy={batchDeployBusy}
                  excluded={batchDeployExcluded}
                  models={batchDeployModels}
                  onCancel={() => setBatchDeployOpen(false)}
                  onClose={() => setBatchDeployOpen(false)}
                  onToggleExclude={(taskId) =>
                    setBatchDeployExcluded((prev) => {
                      const next = new Set(prev);
                      if (next.has(taskId)) next.delete(taskId);
                      else next.add(taskId);
                      return next;
                    })
                  }
                  onConfirm={() =>
                    deployTasksBatch(
                      batchDeploySnapshot.filter((t) => !batchDeployExcluded.has(t.id)),
                      batchDeployModels,
                    )
                  }
                  result={batchDeployResult}
                  setModel={(taskId, model) =>
                    setBatchDeployModels((current) => ({ ...current, [taskId]: model }))
                  }
                  tasks={batchDeploySnapshot}
                />
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {captureOpen ? (
                <CaptureModal
                  key="capture-modal"
                  missingFields={
                    captureTouched
                      ? captureTab === "task"
                        ? validateTaskDraft(taskDraft)
                        : validateTrackerDraft(trackerDraft)
                      : []
                  }
                  onAddTask={addTask}
                  onAddTracker={addTracker}
                  onClose={closeCapture}
                  onResetTask={() => setTaskDraft(createEmptyTaskDraft())}
                  onResetTracker={() => setTrackerDraft(createEmptyTrackerDraft(day.date))}
                  onTaskChange={(nextDraft) => {
                    setTaskDraft(nextDraft);
                    if (captureTouched) setCaptureTouched(false);
                  }}
                  onTrackerChange={(nextDraft) => {
                    setTrackerDraft(nextDraft);
                    if (captureTouched) setCaptureTouched(false);
                  }}
                  setTab={(tab) => {
                    setCaptureTab(tab);
                    setCaptureTouched(false);
                  }}
                  tab={captureTab}
                  taskDraft={taskDraft}
                  trackerDraft={trackerDraft}
                />
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {settingsOpen ? (
                <PromptSettingsModal
                  key="prompt-settings"
                  onClose={() => setSettingsOpen(false)}
                  onSave={savePromptSettings}
                  settings={promptSettings}
                  warning={settingsWarning}
                  saveState={settingsSaveState}
                />
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {deleteCandidate ? (
                <DeleteTaskConfirm
                  key={deleteCandidate.id}
                  onCancel={() => setDeleteCandidateId(undefined)}
                  onConfirm={() => deleteTask(deleteCandidate.id)}
                  task={deleteCandidate}
                />
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {deleteMeetingCandidate ? (
                <DeleteMeetingConfirm
                  key={deleteMeetingCandidate.id}
                  meeting={deleteMeetingCandidate}
                  onCancel={() => setDeleteMeetingCandidateId(undefined)}
                  onConfirm={() => deleteMeeting(deleteMeetingCandidate.id)}
                />
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {closeTrackerCandidate ? (
                <CloseTrackerConfirm
                  key={closeTrackerCandidate.id}
                  onCancel={() => setCloseTrackerCandidateId(undefined)}
                  onConfirm={() => closeTracker(closeTrackerCandidate.id)}
                  tracker={closeTrackerCandidate}
                />
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {completionBurst ? (
                <CompletionBurst
                  burst={completionBurst}
                  key="burst"
                  onDismiss={() => setCompletionBurst(undefined)}
                />
              ) : null}
            </AnimatePresence>
          </main>

          <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }} zIndex={80}>
            {activeDrag && !isOverCalendarSlot ? (
              <div className={cn("studio-drag-overlay", `theme-${paletteMode}`)}>
                {activeDrag.kind === "board" ? (
                  <div className="task-card task-card-overlay drag-ghost">
                    <TaskCardContent task={activeDrag.task} workDate={day.date} />
                  </div>
                ) : (
                  <CalendarDragGhost
                    durationMinutes={scheduledTaskMinutes(activeDrag.task)}
                    task={activeDrag.task}
                  />
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </ChipTooltipProvider>
    </MotionConfig>
  );
}

// New-ticket affordance (spec 7.1): a two-option chooser. "Grill it" opens the chat drawer in
// create mode; "Fill in manually" opens the existing capture modal. Only rendered when grilling
// is enabled; otherwise the header shows the plain Capture button.
function NewTicketChooser({
  onGrillNew,
  onManualNew,
}: {
  onGrillNew: () => void;
  onManualNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<CSSProperties | undefined>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const portalTarget =
    typeof document === "undefined"
      ? null
      : (document.querySelector<HTMLElement>(".studio-shell") ?? document.body);

  useEffect(() => {
    if (!open) return;
    function updatePosition() {
      setMenuPosition(deployMenuStyle(buttonRef.current));
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useMenuDismiss(open, () => setOpen(false), [buttonRef, menuRef]);

  return (
    <>
      <button
        aria-expanded={open}
        className="appearance-trigger appearance-trigger-capture"
        onClick={() =>
          setOpen((current) => {
            if (current) return false;
            setMenuPosition(deployMenuStyle(buttonRef.current));
            return true;
          })
        }
        ref={buttonRef}
        type="button"
      >
        <Plus className="h-4 w-4" />
        Capture
      </button>
      {open && portalTarget
        ? createPortal(
            <div className="deploy-agent-menu" ref={menuRef} style={menuPosition}>
              <button
                onClick={() => {
                  setOpen(false);
                  onGrillNew();
                }}
                type="button"
              >
                <MessageCircleQuestion className="h-3.5 w-3.5" />
                Grill it
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onManualNew();
                }}
                type="button"
              >
                <PencilLine className="h-3.5 w-3.5" />
                Fill in manually
              </button>
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
}

function StudioHeader({
  activeTab,
  availableDays,
  batchDeployCount,
  batchDeployDisabled,
  densityMode,
  date,
  day,
  grillEnabled,
  onGrillNew,
  onOpenBatchDeploy,
  paletteMode,
  saveState,
  setActiveTab,
  setCaptureOpen,
  setSettingsOpen,
  setPendingDate,
  setDensityMode,
  setPaletteMode,
}: {
  activeTab: StudioTab;
  availableDays: string[];
  batchDeployCount: number;
  batchDeployDisabled: boolean;
  densityMode: DensityMode;
  date: string;
  day: DayPlan;
  grillEnabled: boolean;
  onGrillNew: () => void;
  onOpenBatchDeploy: () => void;
  paletteMode: PaletteMode;
  saveState: SaveState;
  setActiveTab: (tab: StudioTab) => void;
  setCaptureOpen: () => void;
  setSettingsOpen: (open: boolean) => void;
  setPendingDate: (date: string) => void;
  setDensityMode: (density: DensityMode) => void;
  setPaletteMode: (palette: PaletteMode) => void;
}) {
  const dateListId = useId();

  return (
    <header className="studio-header">
      <div className="studio-title-lockup">
        <div className="studio-mark">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <div className="studio-kicker">Interactive Working Memory</div>
          <h1>{day.title}</h1>
        </div>
      </div>

      <div className="studio-header-actions">
        <StudioTabControl onChange={setActiveTab} value={activeTab} />
        {grillEnabled ? (
          <NewTicketChooser onGrillNew={onGrillNew} onManualNew={setCaptureOpen} />
        ) : (
          <button
            className="appearance-trigger appearance-trigger-capture"
            onClick={setCaptureOpen}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Capture
          </button>
        )}
        <button
          className="appearance-trigger appearance-trigger-prompt"
          onClick={() => setSettingsOpen(true)}
          type="button"
        >
          <Clipboard className="h-4 w-4" />
          Prompt
        </button>
        <button
          className="appearance-trigger appearance-trigger-deploy"
          disabled={batchDeployDisabled}
          onClick={onOpenBatchDeploy}
          title={
            batchDeployCount === 0
              ? "No agent-ready tasks in To do"
              : `Deploy ${batchDeployCount} agent-ready task${batchDeployCount === 1 ? "" : "s"}`
          }
          type="button"
        >
          <Rocket className="h-4 w-4" />
          Deploy All Agent-Ready
        </button>
        <div className={cn("studio-pill", saveState === "error" && "studio-pill-danger")}>
          {saveState === "saving" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saveState}
        </div>
        <AppearanceMenu
          densityMode={densityMode}
          paletteMode={paletteMode}
          setDensityMode={setDensityMode}
          setPaletteMode={setPaletteMode}
        />
        <label className="studio-date-control">
          <CalendarDays className="h-4 w-4" />
          <input
            list={availableDays.length > 0 ? dateListId : undefined}
            onChange={(event) => setPendingDate(event.target.value)}
            type="date"
            value={date}
          />
          {availableDays.length > 0 ? (
            <datalist id={dateListId}>
              {availableDays.map((availableDay) => (
                <option key={availableDay} value={availableDay} />
              ))}
            </datalist>
          ) : null}
        </label>
      </div>
    </header>
  );
}

function StudioCurrentWarning({ message }: { message: string }) {
  const prefersReducedMotion = useReducedMotion();
  const collapsed = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, height: 0, marginTop: 0, y: -8 };
  const expanded = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 1, height: "auto", marginTop: 12, y: 0 };
  return (
    <motion.section
      animate={expanded}
      className="studio-current-warning"
      exit={collapsed}
      initial={collapsed}
      role="status"
      style={{ overflow: "hidden" }}
      transition={{ duration: MOTION.duration.micro, ease: MOTION.ease.out }}
    >
      <TriangleAlert className="h-5 w-5" />
      <span>{message}</span>
    </motion.section>
  );
}

function CompletionTracker({ progress }: { progress: ProgressSummary }) {
  const prefersReducedMotion = useReducedMotion();
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress.percent / 100) * circumference;
  const remainingText = completionRemainingText(progress);
  const celebrationText = completionCelebrationText(progress);
  const progressStyle = progressThemeStyle(progress);
  const ringLabel =
    progress.total === 0
      ? "empty"
      : progress.remaining === 0
        ? "done"
        : `${progress.remaining} left`;
  const milestoneText =
    progress.tasksToNext && progress.nextMilestonePercent
      ? `${progress.tasksToNext} to ${progress.nextMilestonePercent}%`
      : "";
  return (
    <section
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={progress.percent}
      aria-valuetext={`${progress.percent}% complete. ${remainingText}`}
      className={cn(
        "progress-panel",
        progress.done > 0 && "progress-advanced",
        progress.percent >= 70 && "progress-warm",
        progress.percent === 100 && "progress-complete",
      )}
      role="progressbar"
      style={progressStyle}
    >
      <div aria-hidden="true" className="progress-aura" />
      <div className="progress-copy">
        <span className="progress-kicker">
          <Trophy className="h-4 w-4" />
          Today's momentum
        </span>
        <strong>
          {progress.done}
          <span>/{progress.total || 0}</span>
        </strong>
        <p>{celebrationText}</p>
        {milestoneText ? <em>{milestoneText}</em> : null}
      </div>
      <div className="progress-ring-wrap">
        <svg aria-hidden="true" className="progress-ring" viewBox="0 0 100 100">
          <circle className="progress-track" cx="50" cy="50" r={radius} />
          <motion.circle
            animate={{ strokeDashoffset: offset }}
            className="progress-meter"
            cx="50"
            cy="50"
            initial={false}
            r={radius}
            strokeDasharray={circumference}
            transition={{ duration: prefersReducedMotion ? 0 : 0.45, ease: "easeOut" }}
          />
        </svg>
        <div className="progress-ring-center">
          <strong>{progress.percent}%</strong>
          <span>{ringLabel}</span>
        </div>
      </div>
      <div aria-hidden="true" className="progress-milestones">
        {PROGRESS_MILESTONES.map((milestone) => (
          <span
            className={cn(
              "progress-milestone",
              progress.percent >= milestone && "progress-milestone-earned",
            )}
            key={milestone}
          >
            {milestone}
          </span>
        ))}
      </div>
    </section>
  );
}

function ExternalTrackersPanel({
  collapsed,
  onOpenCreateTracker,
  onRequestClose,
  onToggleCollapsed,
  trackers,
  workDate,
}: {
  collapsed: boolean;
  onOpenCreateTracker: () => void;
  onRequestClose: (id: string) => void;
  onToggleCollapsed: () => void;
  trackers: TrackerRecord[];
  workDate: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const bodyCollapsed = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 };
  const bodyExpanded = prefersReducedMotion ? { opacity: 1 } : { opacity: 1, height: "auto" };
  const bodyTransition = {
    duration: prefersReducedMotion ? 0.1 : MOTION.duration.card,
    ease: MOTION.ease.out,
  };
  const bodyKey = collapsed ? "collapsed" : trackers.length > 0 ? "list" : "empty";

  return (
    <section
      className={cn("external-trackers", collapsed && "external-trackers-collapsed")}
      aria-label="External work trackers"
    >
      <div className="external-trackers-head">
        <button
          aria-expanded={!collapsed}
          className="external-trackers-toggle"
          onClick={onToggleCollapsed}
          type="button"
        >
          <ChevronDown className="h-4 w-4" />
          <span>
            <span className="studio-kicker">Waiting on others</span>
            <strong>Trackers</strong>
          </span>
        </button>
        <div className="external-trackers-actions">
          <span className="external-trackers-count">{trackers.length}</span>
          <button
            aria-label="Create tracker"
            className="external-trackers-add"
            onClick={onOpenCreateTracker}
            title="Create tracker"
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false} mode="wait">
        {bodyKey === "list" ? (
          <motion.div
            animate={bodyExpanded}
            exit={bodyCollapsed}
            initial={bodyCollapsed}
            key="list"
            style={{ overflow: "hidden" }}
            transition={bodyTransition}
          >
            <ul className="external-tracker-list">
              <AnimatePresence initial={false}>
                {trackers.map((tracker) => {
                  const closed = isTrackerClosed(tracker.status);
                  const sourceLabel = trackerSourceLabel(tracker);
                  return (
                    <motion.li
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "external-tracker-item",
                        `tracker-status-${tracker.status}`,
                        closed && "external-tracker-item-closed",
                      )}
                      exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -6 }}
                      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
                      key={tracker.id}
                      transition={bodyTransition}
                    >
                      <div className="external-tracker-topline">
                        <div className="external-tracker-person">
                          <strong>{tracker.person}</strong>
                        </div>
                        <span className="external-tracker-status">
                          {TRACKER_STATUS_LABELS[tracker.status]}
                        </span>
                        {closed ? null : (
                          <TrackerCloseButton onRequestClose={onRequestClose} tracker={tracker} />
                        )}
                      </div>
                      <p className="external-tracker-work">{tracker.work}</p>
                      {tracker.notes.trim() ? (
                        <p className="external-tracker-notes">{tracker.notes.trim()}</p>
                      ) : null}
                      <div className="external-tracker-meta">
                        <span>{formatTrackerAge(trackerAgeDays(tracker, workDate))}</span>
                        <span>Asked {formatTrackerDate(tracker.originalAskDate)}</span>
                        {sourceLabel ? <span>{sourceLabel}</span> : null}
                        {closed && tracker.completedAt ? (
                          <span>Closed {formatTrackerDate(tracker.completedAt)}</span>
                        ) : null}
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </motion.div>
        ) : bodyKey === "empty" ? (
          <motion.p
            animate={bodyExpanded}
            className="external-trackers-empty"
            exit={bodyCollapsed}
            initial={bodyCollapsed}
            key="empty"
            style={{ overflow: "hidden" }}
            transition={bodyTransition}
          >
            No outside-work trackers in today&apos;s plan.
          </motion.p>
        ) : (
          <motion.p
            animate={bodyExpanded}
            className="external-trackers-empty"
            exit={bodyCollapsed}
            initial={bodyCollapsed}
            key="collapsed-summary"
            style={{ overflow: "hidden" }}
            transition={bodyTransition}
          >
            {trackers.length === 1
              ? "1 tracker collapsed."
              : `${trackers.length} trackers collapsed.`}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}

function TrackerCloseButton({
  onRequestClose,
  tracker,
}: {
  onRequestClose: (id: string) => void;
  tracker: TrackerRecord;
}) {
  return (
    <button
      aria-label={`Close tracker for ${tracker.person}: ${tracker.work}`}
      className="tracker-close-button"
      onClick={() => onRequestClose(tracker.id)}
      title="Close tracker"
      type="button"
    >
      <Check className="h-3.5 w-3.5" />
      <span>Close</span>
    </button>
  );
}

function StudioTabControl({
  onChange,
  value,
}: {
  onChange: (tab: StudioTab) => void;
  value: StudioTab;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="segmented-control studio-tab-control" title="Workspace">
      {STUDIO_TAB_OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            aria-label={option.label}
            aria-pressed={active}
            className={cn(
              active && (prefersReducedMotion ? "segment-active" : "segment-active-text"),
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            title={option.label}
            type="button"
          >
            {active && !prefersReducedMotion ? (
              <motion.div
                className="segment-indicator"
                layoutId="studio-tab-indicator"
                transition={MOTION.spring.pop}
              />
            ) : null}
            <Icon className="relative z-10 h-4 w-4" />
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AppearanceMenu({
  densityMode,
  paletteMode,
  setDensityMode,
  setPaletteMode,
}: {
  densityMode: DensityMode;
  paletteMode: PaletteMode;
  setDensityMode: (density: DensityMode) => void;
  setPaletteMode: (palette: PaletteMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useMenuDismiss(open, () => setOpen(false), [menuRef]);

  return (
    <div className="appearance-menu" ref={menuRef}>
      <button
        aria-expanded={open}
        className="appearance-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Palette className="h-4 w-4" />
        Look
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="appearance-panel"
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            <div className="appearance-group">
              <span>Density</span>
              <div className="density-options">
                {DENSITY_OPTIONS.map((option) => (
                  <button
                    aria-pressed={option.value === densityMode}
                    className={cn(option.value === densityMode && "option-active")}
                    key={option.value}
                    onClick={() => setDensityMode(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="appearance-group">
              <span>Theme</span>
              <div className="palette-options">
                {PALETTE_OPTIONS.map((option) => (
                  <button
                    aria-label={option.label}
                    aria-pressed={option.value === paletteMode}
                    className={cn("palette-swatch", `swatch-${option.value}`)}
                    key={option.value}
                    onClick={() => setPaletteMode(option.value)}
                    title={option.label}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CaptureModal({
  missingFields,
  onAddTask,
  onAddTracker,
  onClose,
  onResetTask,
  onResetTracker,
  onTaskChange,
  onTrackerChange,
  setTab,
  tab,
  taskDraft,
  trackerDraft,
}: {
  missingFields: string[];
  onAddTask: () => void;
  onAddTracker: () => void;
  onClose: () => void;
  onResetTask: () => void;
  onResetTracker: () => void;
  onTaskChange: (draft: TaskCreationDraft) => void;
  onTrackerChange: (draft: TrackerCreationDraft) => void;
  setTab: (tab: CaptureTab) => void;
  tab: CaptureTab;
  taskDraft: TaskCreationDraft;
  trackerDraft: TrackerCreationDraft;
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="delete-confirm-backdrop capture-modal-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        aria-labelledby={titleId}
        aria-modal="true"
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="capture-modal"
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        initial={{ opacity: 0, scale: 0.98, y: 16 }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="capture-modal-header">
          <div>
            <div className="studio-kicker">Capture</div>
            <h2 id={titleId}>{tab === "task" ? "New task" : "New tracker"}</h2>
          </div>
          <button aria-label="Close capture" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="capture-tabs" role="tablist">
          <button
            aria-selected={tab === "task"}
            className={cn(tab === "task" && "capture-tab-active")}
            onClick={() => setTab("task")}
            role="tab"
            type="button"
          >
            <ClipboardList className="h-4 w-4" />
            Task
          </button>
          <button
            aria-selected={tab === "tracker"}
            className={cn(tab === "tracker" && "capture-tab-active")}
            onClick={() => setTab("tracker")}
            role="tab"
            type="button"
          >
            <User className="h-4 w-4" />
            Tracker
          </button>
        </div>

        {tab === "task" ? (
          <TaskCaptureForm
            draft={taskDraft}
            missingFields={missingFields}
            onAdd={onAddTask}
            onChange={onTaskChange}
            onReset={onResetTask}
          />
        ) : (
          <TrackerCaptureForm
            draft={trackerDraft}
            missingFields={missingFields}
            onAdd={onAddTracker}
            onChange={onTrackerChange}
            onReset={onResetTracker}
          />
        )}
      </motion.section>
    </motion.div>
  );
}

export function CaptureSourceList({
  onChange,
  sources,
}: {
  onChange: (sources: CaptureSourceEntry[]) => void;
  sources: CaptureSourceEntry[];
}) {
  function patchAt(index: number, partial: Partial<CaptureSourceEntry>) {
    onChange(sources.map((entry, i) => (i === index ? { ...entry, ...partial } : entry)));
  }
  function addSource() {
    onChange([...sources, { label: "", url: "" }]);
  }
  function removeAt(index: number) {
    const next = sources.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [{ label: "", url: "" }]);
  }

  return (
    <div className="capture-field-wide capture-sources">
      <div className="capture-sources-head">
        <span>Source links</span>
        <button className="capture-source-add" onClick={addSource} type="button">
          <Plus aria-hidden className="h-4 w-4" />
          Add source
        </button>
      </div>
      {sources.map((entry, index) => (
        <div className="capture-source-row" key={index}>
          <input
            aria-label={`Source ${index + 1} label`}
            onChange={(event) => patchAt(index, { label: event.target.value })}
            placeholder="Source label"
            value={entry.label}
          />
          <input
            aria-label={`Source ${index + 1} URL`}
            onChange={(event) => patchAt(index, { url: event.target.value })}
            placeholder="https:// (optional)"
            value={entry.url}
          />
          <button
            aria-label={`Remove source ${index + 1}`}
            className="capture-source-remove"
            disabled={sources.length === 1}
            onClick={() => removeAt(index)}
            type="button"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function TaskCaptureForm({
  draft,
  missingFields,
  onAdd,
  onChange,
  onReset,
}: {
  draft: TaskCreationDraft;
  missingFields: string[];
  onAdd: () => void;
  onChange: (draft: TaskCreationDraft) => void;
  onReset: () => void;
}) {
  function patch(partial: Partial<TaskCreationDraft>) {
    onChange({ ...draft, ...partial });
  }

  return (
    <div className="capture-form" role="tabpanel">
      <label className="capture-field capture-field-wide">
        Title
        <input
          onChange={(event) => {
            const title = event.target.value;
            patch({
              title,
              objective:
                !draft.objective.trim() || draft.objective === draft.title
                  ? title
                  : draft.objective,
            });
          }}
          placeholder="Short task name"
          value={draft.title}
        />
      </label>
      <label className="capture-field">
        Kind
        <select
          onChange={(event) => {
            const kind = event.target.value as TaskKind;
            patch({ kind, workDepth: defaultWorkDepthForKind(kind) });
          }}
          value={draft.kind}
        >
          {KIND_OPTIONS.map((kind) => (
            <option key={kind} value={kind}>
              {TASK_KIND_META[kind].label}
            </option>
          ))}
        </select>
      </label>
      <label className="capture-field">
        Depth
        <select
          onChange={(event) => patch({ workDepth: event.target.value as WorkDepth })}
          value={draft.workDepth}
        >
          <option value="shallow">Shallow</option>
          <option value="deep">Deep</option>
        </select>
      </label>
      <label className="capture-field">
        Estimate
        <input
          min={5}
          onBlur={() =>
            patch({ estimateMinutes: String(parseEstimateDraft(draft.estimateMinutes, 30)) })
          }
          onChange={(event) => patch({ estimateMinutes: event.target.value })}
          step={5}
          type="number"
          value={draft.estimateMinutes}
        />
      </label>
      <label className="capture-field">
        Source
        <select
          onChange={(event) => patch({ sourceKind: event.target.value as SourceKind })}
          value={draft.sourceKind}
        >
          {SOURCE_KIND_OPTIONS.map((kind) => (
            <option key={kind} value={kind}>
              {sourceKindLabel(kind)}
            </option>
          ))}
        </select>
      </label>
      <label className="capture-field capture-field-wide field-tint-primary">
        Objective
        <textarea
          onChange={(event) => patch({ objective: event.target.value })}
          placeholder="Exact outcome to create."
          value={draft.objective}
        />
      </label>
      <label className="capture-field capture-field-wide field-tint-primary">
        Done when
        <textarea
          onChange={(event) => patch({ doneWhen: event.target.value })}
          placeholder={DONE_WHEN_PLACEHOLDER}
          value={draft.doneWhen}
        />
      </label>
      <label className="capture-field capture-field-wide field-tint-info">
        Background
        <textarea
          onChange={(event) => patch({ background: event.target.value })}
          placeholder={TASK_CONTEXT_PLACEHOLDER}
          value={draft.background}
        />
      </label>
      <label className="capture-field capture-field-wide field-tint-info">
        Sources override
        <textarea
          onChange={(event) => patch({ sourcesOverride: event.target.value })}
          placeholder="Optional source text when source refs are not enough."
          value={draft.sourcesOverride}
        />
      </label>
      <CaptureSourceList onChange={(sources) => patch({ sources })} sources={draft.sources} />
      <label className="capture-field capture-field-wide field-tint-warning">
        Constraints / non-goals
        <textarea
          onChange={(event) => patch({ constraintsNonGoals: event.target.value })}
          placeholder="Scope boundaries, non-goals, ask-before rules, or None."
          value={draft.constraintsNonGoals}
        />
      </label>
      <label className="capture-field capture-field-wide field-tint-success">
        Verification
        <textarea
          onChange={(event) => patch({ verification: event.target.value })}
          placeholder="Checks, commands, screenshots, or review steps."
          value={draft.verification}
        />
      </label>
      <CaptureModalFooter
        actionLabel="Create task"
        missingFields={missingFields}
        onAction={onAdd}
        onReset={onReset}
      >
        <TaskDurationWarning minutes={parseEstimateDraft(draft.estimateMinutes, 30)} />
      </CaptureModalFooter>
    </div>
  );
}

function TrackerCaptureForm({
  draft,
  missingFields,
  onAdd,
  onChange,
  onReset,
}: {
  draft: TrackerCreationDraft;
  missingFields: string[];
  onAdd: () => void;
  onChange: (draft: TrackerCreationDraft) => void;
  onReset: () => void;
}) {
  function patch(partial: Partial<TrackerCreationDraft>) {
    onChange({ ...draft, ...partial });
  }

  return (
    <div className="capture-form capture-form-tracker" role="tabpanel">
      <label className="capture-field">
        Person / team
        <input
          onChange={(event) => patch({ person: event.target.value })}
          placeholder="Who owns this?"
          value={draft.person}
        />
      </label>
      <label className="capture-field">
        Status
        <select
          onChange={(event) => patch({ status: event.target.value as TrackerRecord["status"] })}
          value={draft.status}
        >
          {Object.entries(TRACKER_STATUS_LABELS).map(([status, label]) => (
            <option key={status} value={status}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="capture-field">
        Original ask date
        <input
          onChange={(event) => patch({ originalAskDate: event.target.value })}
          type="date"
          value={draft.originalAskDate}
        />
      </label>
      <label className="capture-field">
        Source
        <select
          onChange={(event) => patch({ sourceKind: event.target.value as SourceKind })}
          value={draft.sourceKind}
        >
          {SOURCE_KIND_OPTIONS.map((kind) => (
            <option key={kind} value={kind}>
              {sourceKindLabel(kind)}
            </option>
          ))}
        </select>
      </label>
      <label className="capture-field capture-field-wide field-tint-primary">
        Work
        <textarea
          onChange={(event) => patch({ work: event.target.value })}
          placeholder="Deliverable or thread to monitor."
          value={draft.work}
        />
      </label>
      <label className="capture-field capture-field-wide field-tint-info">
        Notes
        <textarea
          onChange={(event) => patch({ notes: event.target.value })}
          placeholder="Latest known state, expected next check, or blocker."
          value={draft.notes}
        />
      </label>
      <CaptureSourceList onChange={(sources) => patch({ sources })} sources={draft.sources} />
      <CaptureModalFooter
        actionLabel="Create tracker"
        missingFields={missingFields}
        onAction={onAdd}
        onReset={onReset}
      />
    </div>
  );
}

function CaptureModalFooter({
  actionLabel,
  children,
  missingFields,
  onAction,
  onReset,
}: {
  actionLabel: string;
  children?: ReactNode;
  missingFields: string[];
  onAction: () => void;
  onReset: () => void;
}) {
  return (
    <div className="capture-form-footer">
      <div className="capture-form-status">
        {children}
        {missingFields.length > 0 ? (
          <div aria-live="polite" className="task-required-warning" role="alert">
            Required: {missingFields.join(", ")}
          </div>
        ) : null}
      </div>
      <div className="capture-form-actions">
        <button className="task-capture-cancel" onClick={onReset} type="button">
          <X className="h-4 w-4" />
          Reset
        </button>
        <button onClick={onAction} type="button">
          <Plus className="h-4 w-4" />
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

const TaskLane = memo(function TaskLane({
  exitingTaskId,
  grillEnabled,
  grillingTaskId,
  onCopyGrillPrompt,
  onGrillTask,
  onRequestDelete,
  status,
  tasks,
  onSelect,
  workDate,
}: {
  exitingTaskId?: string;
  grillEnabled?: boolean;
  grillingTaskId?: string;
  onCopyGrillPrompt?: (task: TaskRecord) => void;
  onGrillTask?: (task: TaskRecord) => void;
  onRequestDelete: (id: string) => void;
  status: TaskStatus;
  tasks: TaskRecord[];
  onSelect: (id: string) => void;
  workDate: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `status:${status}` });

  return (
    <section className={cn("task-lane", isOver && "drop-hot")} ref={setNodeRef}>
      <div className="lane-heading">
        <span>{STATUS_LABELS[status]}</span>
        <span>{tasks.length}</span>
      </div>
      <div className="lane-stack">
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => (
            <DraggableTaskCard
              grillEnabled={grillEnabled}
              grillingTaskId={grillingTaskId}
              isExiting={task.id === exitingTaskId}
              key={task.id}
              onCopyGrillPrompt={onCopyGrillPrompt}
              onGrillTask={onGrillTask}
              onRequestDelete={onRequestDelete}
              onSelect={onSelect}
              task={task}
              workDate={workDate}
            />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
});

const DraggableTaskCard = memo(function DraggableTaskCard({
  grillEnabled,
  grillingTaskId,
  isExiting,
  onCopyGrillPrompt,
  onGrillTask,
  onRequestDelete,
  task,
  onSelect,
  workDate,
}: {
  grillEnabled?: boolean;
  grillingTaskId?: string;
  isExiting?: boolean;
  onCopyGrillPrompt?: (task: TaskRecord) => void;
  onGrillTask?: (task: TaskRecord) => void;
  onRequestDelete: (id: string) => void;
  task: TaskRecord;
  onSelect: (id: string) => void;
  workDate: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task:${task.id}`,
  });

  return (
    <motion.article
      animate={{ opacity: isDragging ? 0.28 : 1, scale: 1, y: 0 }}
      className={cn(
        "task-card",
        `task-kind-${task.kind}`,
        `task-status-${task.status}`,
        isDragging && "task-card-dragging",
      )}
      exit={isExiting ? { opacity: 0, scale: 0.96, y: -6 } : undefined}
      initial={{ opacity: 0, scale: 0.97, y: 10 }}
      layout={!isDragging}
      onClick={() => onSelect(task.id)}
      ref={setNodeRef}
      transition={{ duration: 0.18 }}
      {...listeners}
      {...attributes}
    >
      <TaskCardContent
        grillEnabled={grillEnabled}
        grillInProgress={grillingTaskId === task.id}
        onCopyGrillPrompt={onCopyGrillPrompt}
        onGrillTask={onGrillTask}
        onRequestDelete={onRequestDelete}
        task={task}
        workDate={workDate}
      />
    </motion.article>
  );
});

function TaskCardContent({
  grillEnabled,
  grillInProgress,
  onCopyGrillPrompt,
  onGrillTask,
  onRequestDelete,
  task,
  workDate,
}: {
  grillEnabled?: boolean;
  grillInProgress?: boolean;
  onCopyGrillPrompt?: (task: TaskRecord) => void;
  onGrillTask?: (task: TaskRecord) => void;
  onRequestDelete?: (id: string) => void;
  task: TaskRecord;
  workDate: string;
}) {
  const carryOverDays = taskCarryOverDays(task, workDate);
  const readiness = getTaskReadiness(task);
  const promptWarnings = getPromptWarnings(task);
  return (
    <>
      <div className="task-card-top">
        <KindBadge kind={task.kind} />
        <WorkDepthBadge workDepth={task.workDepth} />
        <ReadinessBadge
          compact
          readiness={readiness}
          tooltip={readinessTooltip(readiness, promptWarnings)}
        />
        {task.status === "done" ? <span className="task-status-badge">Done</span> : null}
        <DurationScale minutes={task.estimateMinutes} />
      </div>
      <h3>{task.title}</h3>
      <div className="task-meta-row">{task.project ? <span>{task.project}</span> : null}</div>
      <div className="task-card-footer">
        <div className="task-card-chip-row">
          <TaskSourceChip task={task} />
          <TaskWarningChips compact carryOverDays={carryOverDays} minutes={task.estimateMinutes} />
          {onGrillTask && onCopyGrillPrompt ? (
            <TaskGrillMenu
              grillEnabled={Boolean(grillEnabled)}
              grillInProgress={Boolean(grillInProgress)}
              onCopyPrompt={onCopyGrillPrompt}
              onGrill={onGrillTask}
              task={task}
            />
          ) : null}
        </div>
        {onRequestDelete ? (
          <TaskDeleteButton
            className="task-card-delete-button"
            label={`Delete ${task.title}`}
            onRequestDelete={onRequestDelete}
            taskId={task.id}
          />
        ) : null}
      </div>
    </>
  );
}

function TaskSourceChip({ task, tooltip }: { task: TaskRecord; tooltip?: string }) {
  const sourceKind = taskSourceKind(task);
  const meta = SOURCE_KIND_META[sourceKind];
  const Icon = meta.icon;
  const resolvedTooltip = tooltip ?? sourceTooltip(task);
  const tooltipAttrs = useChipTooltipAttrs(resolvedTooltip);
  return (
    <span className={cn("source-chip", meta.className)} {...tooltipAttrs}>
      <Icon className="h-3.5 w-3.5" />
      <span>{meta.label}</span>
    </span>
  );
}

function KindBadge({
  compact = false,
  kind,
  tooltip,
}: {
  compact?: boolean;
  kind: TaskKind;
  tooltip?: string;
}) {
  const meta = TASK_KIND_META[kind];
  const Icon = meta.icon;
  const resolvedTooltip = tooltip ?? kindTooltip(kind);
  const tooltipAttrs = useChipTooltipAttrs(resolvedTooltip);
  return (
    <span
      className={cn("kind-badge", meta.className, compact && "kind-badge-compact")}
      {...tooltipAttrs}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{meta.label}</span>
    </span>
  );
}

function WorkDepthBadge({ tooltip, workDepth }: { tooltip?: string; workDepth: WorkDepth }) {
  const resolvedTooltip = tooltip ?? workDepthTooltip(workDepth);
  const tooltipAttrs = useChipTooltipAttrs(resolvedTooltip);
  return (
    <span className={cn("work-depth-badge", `work-depth-${workDepth}`)} {...tooltipAttrs}>
      <span>{workDepth}</span>
    </span>
  );
}

function ReadinessBadge({
  compact = false,
  readiness,
  tooltip,
}: {
  compact?: boolean;
  readiness: AgentReadiness;
  tooltip?: string;
}) {
  const label =
    readiness === "ready" ? "Agent-ready" : readiness === "warning" ? "Warning" : "Capture";
  const resolvedTooltip = tooltip ?? readinessTooltip(readiness, []);
  const tooltipAttrs = useChipTooltipAttrs(resolvedTooltip);
  return (
    <span
      className={cn("readiness-badge", `readiness-${readiness}`, compact && "badge-compact")}
      {...tooltipAttrs}
    >
      <span>{label}</span>
    </span>
  );
}

function ChipTooltipProvider({ children }: { children: ReactNode }) {
  const [tooltip, setTooltip] = useState<ChipTooltipState | undefined>();
  const value = useMemo<ChipTooltipContextValue>(
    () => ({
      hide: (id) => {
        setTooltip((current) => (current?.id === id ? undefined : current));
      },
      show: (id, text, element) => {
        setTooltip({ id, text, ...chipTooltipAnchor(element) });
      },
    }),
    [],
  );

  return (
    <ChipTooltipContext.Provider value={value}>
      {children}
      {tooltip && typeof document !== "undefined"
        ? createPortal(
            <ChipTooltipView tooltip={tooltip} />,
            document.querySelector<HTMLElement>(".studio-shell") ?? document.body,
          )
        : null}
    </ChipTooltipContext.Provider>
  );
}

function ChipTooltipView({ tooltip }: { tooltip: ChipTooltipState }) {
  return (
    <b
      aria-hidden="true"
      className={cn("chip-tooltip", `tooltip-${tooltip.placement}`)}
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      {tooltip.text}
    </b>
  );
}

function useChipTooltipAttrs(tooltip: string | undefined) {
  const context = useContext(ChipTooltipContext);
  const id = useId();
  if (!tooltip) return {};

  function showTooltip(event: { currentTarget: HTMLElement }) {
    context?.show(id, tooltip!, event.currentTarget);
  }

  function hideTooltip() {
    context?.hide(id);
  }

  return {
    "aria-label": tooltip,
    "data-chip-tooltip": tooltip,
    onBlur: hideTooltip,
    onFocus: showTooltip,
    onMouseEnter: showTooltip,
    onMouseLeave: hideTooltip,
    tabIndex: 0,
  } as const;
}

function chipTooltipAnchor(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const tooltipHalfWidth = Math.min(180, Math.max(120, viewportWidth / 2 - 24));
  const x = Math.max(
    tooltipHalfWidth,
    Math.min(viewportWidth - tooltipHalfWidth, rect.left + rect.width / 2),
  );
  const canPlaceAbove = rect.top > 96;
  return {
    placement: canPlaceAbove ? ("top" as const) : ("bottom" as const),
    x,
    y: canPlaceAbove ? rect.top - 10 : rect.bottom + 10,
  };
}

function readinessTooltip(readiness: AgentReadiness, warnings: string[]) {
  if (readiness === "ready") {
    return "Agent-ready: required task fields are complete and this can be deployed when the prompt template is clean.";
  }
  if (readiness === "warning") {
    return warnings.length > 0
      ? `Warning: ${formatTooltipList(warnings)}. Copy is allowed with a warning; deploy waits for a clean prompt.`
      : "Warning: this task needs one more check before it is safe to delegate.";
  }
  return "Capture: this needs an objective and done-when before it can become an agent-ready task.";
}

function kindTooltip(kind: TaskKind) {
  switch (kind) {
    case "focus":
      return "Focus: high-leverage work that should get protected time and usually needs deeper context.";
    case "task":
      return "Task: normal planned work, usually 45-60 minutes with a concrete outcome.";
    case "quick":
      return "Quick: small work, usually 15-30 minutes and safe to batch.";
    case "comms":
      return "Comms: reply, update, follow-up, or alignment work.";
    case "personal":
      return "Personal: non-work or private admin item on today's plan.";
    case "ad_hoc":
      return "Ad hoc: unplanned work captured during the day.";
  }
}

function workDepthTooltip(workDepth: WorkDepth) {
  return workDepth === "deep"
    ? "Deep work: cognitively demanding work that should be protected from context switching."
    : "Shallow work: lighter admin, coordination, review, or communication work.";
}

function sourceTooltip(task: TaskRecord) {
  if (task.sourceRefs.length === 0) {
    return "Source: manual capture with no source links attached.";
  }
  const sourceKind = taskSourceKind(task);
  const sourceLabel = SOURCE_KIND_META[sourceKind].label;
  const labels = task.sourceRefs.map((source) => source.label);
  return `${sourceLabel} source: ${formatTooltipList(labels)}.`;
}

function formatTooltipList(values: string[], max = 3) {
  const cleanValues = values.map((value) => value.trim()).filter(Boolean);
  const visible = cleanValues.slice(0, max).join(", ");
  const hiddenCount = Math.max(0, cleanValues.length - max);
  return hiddenCount > 0 ? `${visible}, +${hiddenCount} more` : visible;
}

function deployMenuStyle(anchor: HTMLElement | null): CSSProperties {
  if (!anchor || typeof window === "undefined") {
    return { left: 14, top: 14 };
  }

  const rect = anchor.getBoundingClientRect();
  const menuWidth = 150;
  const viewportPadding = 14;
  const left = Math.min(
    window.innerWidth - menuWidth - viewportPadding,
    Math.max(viewportPadding, rect.right - menuWidth),
  );

  return {
    left: Math.round(left),
    top: Math.round(rect.bottom + 8),
  };
}

// Shared outside-dismiss behavior for dropdown/menu components. Closes on any pointerdown
// outside the given refs (trigger + panel) and on Escape. Both listeners are registered on
// `document` with `capture: true` so they run ahead of triggers that stopPropagation() on
// pointer events (e.g. TaskGrillMenu's button) and ahead of bubble-phase Escape handlers
// owned by an ancestor modal (calling stopPropagation() lets the menu consume the keypress
// without also closing that modal).
function useMenuDismiss(
  open: boolean,
  close: () => void,
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
) {
  const closeRef = useRef(close);
  const refsRef = useRef(refs);

  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    refsRef.current = refs;
  });

  useEffect(() => {
    if (!open) return;

    function isInsideMenu(target: EventTarget | null) {
      return target instanceof Node && refsRef.current.some((ref) => ref.current?.contains(target));
    }

    function handlePointerDown(event: PointerEvent) {
      if (isInsideMenu(event.target)) return;
      closeRef.current();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeRef.current();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);
}

function TaskDeleteButton({
  className,
  label,
  onRequestDelete,
  taskId,
}: {
  className?: string;
  label: string;
  onRequestDelete: (id: string) => void;
  taskId: string;
}) {
  return (
    <button
      aria-label={label}
      className={cn("task-delete-button", className)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onRequestDelete(taskId);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      title="Delete ticket"
      type="button"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function TaskGrillMenu({
  grillEnabled,
  grillInProgress,
  onCopyPrompt,
  onGrill,
  task,
}: {
  grillEnabled: boolean;
  grillInProgress: boolean;
  onCopyPrompt: (task: TaskRecord) => void;
  onGrill: (task: TaskRecord) => void;
  task: TaskRecord;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuPosition, setMenuPosition] = useState<CSSProperties | undefined>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const portalTarget =
    typeof document === "undefined"
      ? null
      : (document.querySelector<HTMLElement>(".studio-shell") ?? document.body);

  useEffect(() => {
    if (!open) return;
    function updatePosition() {
      setMenuPosition(deployMenuStyle(buttonRef.current));
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useMenuDismiss(open, () => setOpen(false), [buttonRef, menuRef]);

  function handleCopy() {
    onCopyPrompt(task);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
      setOpen(false);
    }, 900);
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-label={`More actions for ${task.title}`}
        className="task-delete-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => {
            if (current) return false;
            setMenuPosition(deployMenuStyle(buttonRef.current));
            return true;
          });
        }}
        onPointerDown={(event) => event.stopPropagation()}
        ref={buttonRef}
        title="More actions"
        type="button"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {open && portalTarget
        ? createPortal(
            <div className="deploy-agent-menu" ref={menuRef} style={menuPosition}>
              {grillEnabled ? (
                <button
                  disabled={grillInProgress}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                    onGrill(task);
                  }}
                  type="button"
                >
                  <MessageCircleQuestion className="h-3.5 w-3.5" />
                  {grillInProgress ? "Re-grilling..." : "Re-grill"}
                </button>
              ) : null}
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  handleCopy();
                }}
                type="button"
              >
                <Clipboard className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy grill prompt"}
              </button>
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
}

function DurationScale({ compact = false, minutes }: { compact?: boolean; minutes: number }) {
  const safeMinutes = normalizeEstimateMinutes(minutes);
  const percent = Math.max(8, Math.min(100, (safeMinutes / 120) * 100));
  return (
    <span className={cn("duration-scale", compact && "duration-scale-compact")}>
      <span className="duration-scale-label">{safeMinutes}m</span>
      <span className="duration-scale-track">
        <span className="duration-scale-fill" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

function TaskDurationWarning({
  carryOverDays = 0,
  className,
  compact = false,
  id,
  minutes,
  withTooltips = true,
}: {
  carryOverDays?: number;
  className?: string;
  compact?: boolean;
  id?: string;
  minutes: number;
  withTooltips?: boolean;
}) {
  const splitCount = splitSubticketCount(minutes);
  const safeCarryOverDays = Math.max(0, Math.floor(carryOverDays));
  if (splitCount === 0 && safeCarryOverDays === 0) return null;
  return (
    <span
      aria-live={id ? "polite" : undefined}
      className={cn("task-warning-row", compact && "task-warning-row-compact", className)}
      id={id}
    >
      <TaskWarningChips
        compact={compact}
        carryOverDays={carryOverDays}
        minutes={minutes}
        withTooltips={withTooltips}
      />
    </span>
  );
}

function TaskWarningChips({
  carryOverDays = 0,
  compact = false,
  minutes,
  withTooltips = true,
}: {
  carryOverDays?: number;
  compact?: boolean;
  minutes: number;
  withTooltips?: boolean;
}) {
  const splitCount = splitSubticketCount(minutes);
  const safeCarryOverDays = Math.max(0, Math.floor(carryOverDays));
  const splitTooltip =
    withTooltips && splitCount > 0
      ? `Split recommendation: ${minutes} minutes is large enough that ${splitCount} smaller sub-tickets may be easier to finish or delegate.`
      : undefined;
  const carryTooltip =
    withTooltips && safeCarryOverDays > 0
      ? `Carry-over: this task has been on the board for ${formatDayCount(
          safeCarryOverDays,
        )}. Reconfirm scope or cut it if it is no longer important.`
      : undefined;
  const splitTooltipAttrs = useChipTooltipAttrs(splitTooltip);
  const carryTooltipAttrs = useChipTooltipAttrs(carryTooltip);
  return (
    <>
      {splitCount > 0 ? (
        <span className="duration-warning duration-warning-split" {...splitTooltipAttrs}>
          <TriangleAlert className="h-3.5 w-3.5" />
          <span>{compact ? `Split x${splitCount}` : `Split into ${splitCount} sub-tickets`}</span>
        </span>
      ) : null}
      {safeCarryOverDays > 0 ? (
        <span className="duration-warning duration-warning-carry" {...carryTooltipAttrs}>
          <TriangleAlert className="h-3.5 w-3.5" />
          <span>
            {compact ? `${safeCarryOverDays}d carry` : formatCarryOverDays(safeCarryOverDays)}
          </span>
        </span>
      ) : null}
    </>
  );
}

function EstimateInput({
  "aria-describedby": ariaDescribedBy,
  id,
  onCommit,
  value,
}: {
  "aria-describedby"?: string;
  id?: string;
  onCommit: (minutes: number) => void;
  value: number;
}) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  function commitDraft() {
    const nextValue = parseEstimateDraft(draftValue, value);
    setDraftValue(String(nextValue));
    if (nextValue !== value) onCommit(nextValue);
  }

  return (
    <input
      aria-describedby={ariaDescribedBy}
      id={id}
      min={5}
      onBlur={commitDraft}
      onChange={(event) => setDraftValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      step={5}
      type="number"
      value={draftValue}
    />
  );
}

function RequiredLabel({ children }: { children: string }) {
  return (
    <span className="required-field-label">
      {children}
      <span aria-hidden="true" className="required-asterisk">
        *
      </span>
      <span className="required-text">Required</span>
    </span>
  );
}

function DayCalendar({
  day,
  calendar,
  fitDayEnabled,
  isReloading,
  onRequestDelete,
  onRequestDeleteMeeting,
  onResizeTask,
  onReloadCalendar,
  onSelectTask,
  onToggleFitDay,
  rowHeight,
}: {
  day: DayPlan;
  calendar: CalendarFile;
  fitDayEnabled: boolean;
  isReloading: boolean;
  onRequestDelete: (id: string) => void;
  onRequestDeleteMeeting: (id: string) => void;
  onResizeTask: (taskId: string, nextEndMinute: number) => void;
  onReloadCalendar: () => void;
  onSelectTask: (id: string) => void;
  onToggleFitDay: () => void;
  rowHeight: number;
}) {
  const calendarBodyRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledCalendarRef = useRef(false);
  const calendarAutoScrollInFlightRef = useRef(false);
  const calendarManualScrollPauseUntilRef = useRef(0);
  const [calendarBodyHeight, setCalendarBodyHeight] = useState(0);
  const [hoverTooltip, setHoverTooltip] = useState<CalendarHoverTooltip | undefined>();
  const [localDropTarget, setLocalDropTarget] = useState<CalendarDropTarget | undefined>();
  useDndMonitor({
    onDragStart() {
      setLocalDropTarget(undefined);
    },
    onDragOver(event) {
      const activeId = String(event.active.id);
      const taskId = taskIdFromDragId(activeId);
      const overId = event.over?.id ? String(event.over.id) : "";
      if (!overId.startsWith("slot:")) {
        setLocalDropTarget(undefined);
        return;
      }
      const task = day.tasks.find((candidate) => candidate.id === taskId);
      const minute = Number(overId.replace("slot:", ""));
      if (!task || !Number.isFinite(minute)) {
        setLocalDropTarget(undefined);
        return;
      }
      const durationMinutes = activeId.startsWith("scheduled:")
        ? scheduledTaskMinutes(task)
        : normalizeEstimateMinutes(task.estimateMinutes);
      setLocalDropTarget((current) =>
        current?.taskId === taskId &&
        current.minute === minute &&
        current.durationMinutes === durationMinutes
          ? current
          : { taskId, minute, durationMinutes },
      );
    },
    onDragEnd() {
      setLocalDropTarget(undefined);
    },
    onDragCancel() {
      setLocalDropTarget(undefined);
    },
  });
  const currentMinute = useCurrentMinute(day.date, day.timezone);
  const range = useMemo(() => buildCalendarRange(day, calendar.meetings), [day, calendar.meetings]);
  const visualSlots = useMemo(
    () => buildSlots(range.startMinute, range.endMinute, range.slotMinutes),
    [range.startMinute, range.endMinute, range.slotMinutes],
  );
  const dropSlots = useMemo(
    () => buildSlots(range.startMinute, range.endMinute, CALENDAR_INTERACTION_MINUTES),
    [range.startMinute, range.endMinute],
  );
  const activeDropTask = useMemo(
    () => day.tasks.find((task) => task.id === localDropTarget?.taskId),
    [localDropTarget?.taskId, day.tasks],
  );
  const fallbackRowHeight = Math.max(44, rowHeight);
  const overlapSafeRowHeight =
    ((CALENDAR_EVENT_MIN_RENDERED_HEIGHT + CALENDAR_BLOCK_VERTICAL_GAP) /
      CALENDAR_INTERACTION_MINUTES) *
    range.slotMinutes;
  const fitDayRowHeight =
    calendarBodyHeight > 0
      ? Math.max(
          CALENDAR_EVENT_MIN_RENDERED_HEIGHT,
          calendarBodyHeight / Math.max(1, visualSlots.length),
        )
      : undefined;
  const measuredRowHeight =
    fitDayEnabled && fitDayRowHeight !== undefined
      ? fitDayRowHeight
      : calendarBodyHeight > 0
        ? Math.max(
            fallbackRowHeight,
            calendarBodyHeight / Math.max(1, visualSlots.length),
            overlapSafeRowHeight,
          )
        : Math.max(fallbackRowHeight, overlapSafeRowHeight);
  const calendarLayout = useMemo(() => {
    const meetingItems = calendar.meetings.flatMap((meeting) => {
      const item = meetingToLayoutItem(meeting, range);
      return item ? [item] : [];
    });
    const taskItems = day.tasks.flatMap((task) => {
      const item = taskToLayoutItem(task, range);
      return item ? [item] : [];
    });
    const breakItems = day.breaks.flatMap((dayBreak) => {
      const item = breakToLayoutItem(dayBreak, range);
      return item ? [item] : [];
    });
    const events: CalendarLayoutItem<CalendarEventItem>[] = [
      ...meetingItems,
      ...breakItems,
      ...taskItems,
    ];
    const eventLayouts = packCalendarOverlaps(events);

    // Columns are based on real time overlap only; visual min-height must not split back-to-back events.
    return {
      meetingLayouts: eventLayouts.filter(isMeetingLayout),
      breakLayouts: eventLayouts.filter(isBreakLayout),
      taskLayouts: eventLayouts.filter(isTaskLayout),
    };
  }, [calendar.meetings, day.breaks, day.tasks, range]);
  const totalHeight =
    ((range.endMinute - range.startMinute) / range.slotMinutes) * measuredRowHeight;

  useEffect(() => {
    const bodyElement = calendarBodyRef.current;
    if (!bodyElement) return;
    const body: HTMLDivElement = bodyElement;

    function updateBodyHeight() {
      setCalendarBodyHeight((currentHeight) => {
        const nextHeight = Math.round(body.clientHeight);
        return currentHeight === nextHeight ? currentHeight : nextHeight;
      });
    }

    updateBodyHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateBodyHeight);
      return () => window.removeEventListener("resize", updateBodyHeight);
    }

    const resizeObserver = new ResizeObserver(updateBodyHeight);
    resizeObserver.observe(body);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const body = calendarBodyRef.current;
    if (!body) return;

    function pauseAutoScroll() {
      if (calendarAutoScrollInFlightRef.current) return;
      calendarManualScrollPauseUntilRef.current = Date.now() + 120_000;
    }

    body.addEventListener("wheel", pauseAutoScroll, { passive: true });
    body.addEventListener("touchmove", pauseAutoScroll, { passive: true });
    body.addEventListener("scroll", pauseAutoScroll, { passive: true });

    return () => {
      body.removeEventListener("wheel", pauseAutoScroll);
      body.removeEventListener("touchmove", pauseAutoScroll);
      body.removeEventListener("scroll", pauseAutoScroll);
    };
  }, []);

  useEffect(() => {
    const body = calendarBodyRef.current;
    if (!body || currentMinute === undefined) return;
    if (currentMinute < range.startMinute || currentMinute > range.endMinute) return;
    if (localDropTarget) return;
    if (Date.now() < calendarManualScrollPauseUntilRef.current) return;

    const currentTop =
      ((currentMinute - range.startMinute) / range.slotMinutes) * measuredRowHeight;
    const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
    const targetTop = Math.max(0, Math.min(maxScrollTop, currentTop - body.clientHeight / 2));
    if (Math.abs(body.scrollTop - targetTop) < 1) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const frame = window.requestAnimationFrame(() => {
      calendarAutoScrollInFlightRef.current = true;
      body.scrollTo({
        top: targetTop,
        behavior: hasAutoScrolledCalendarRef.current && !reduceMotion ? "smooth" : "auto",
      });
      hasAutoScrolledCalendarRef.current = true;
      window.setTimeout(() => {
        calendarAutoScrollInFlightRef.current = false;
      }, 500);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    localDropTarget,
    currentMinute,
    measuredRowHeight,
    range.endMinute,
    range.slotMinutes,
    range.startMinute,
  ]);

  const showTaskTooltip = useCallback((task: TaskRecord, minutes: number, element: HTMLElement) => {
    const anchor = calendarTooltipAnchor(element);
    setHoverTooltip({
      id: task.id,
      label: TASK_KIND_META[task.kind].label,
      title: task.title,
      timeRange:
        task.scheduledStart && task.scheduledEnd
          ? formatRange(task.scheduledStart, task.scheduledEnd)
          : "Unscheduled",
      duration: formatDurationMinutes(minutes),
      variant: "task",
      kind: task.kind,
      ...anchor,
    });
  }, []);

  const showMeetingTooltip = useCallback(
    (meeting: CalendarFile["meetings"][number], element: HTMLElement) => {
      const anchor = calendarTooltipAnchor(element);
      const minutes = Math.max(15, minuteOfDay(meeting.end) - minuteOfDay(meeting.start));
      setHoverTooltip({
        id: meeting.id,
        label: "Meeting",
        title: meeting.title,
        timeRange: formatRange(meeting.start, meeting.end),
        duration: formatDurationMinutes(minutes),
        variant: "meeting",
        ...anchor,
      });
    },
    [],
  );

  const showBreakTooltip = useCallback(
    (dayBreak: DayPlan["breaks"][number], element: HTMLElement) => {
      const anchor = calendarTooltipAnchor(element);
      const minutes = Math.max(5, minuteOfDay(dayBreak.end) - minuteOfDay(dayBreak.start));
      setHoverTooltip({
        id: dayBreak.id,
        label: dayBreak.kind === "lunch" ? "Lunch" : "Break",
        title: dayBreak.label,
        timeRange: formatRange(dayBreak.start, dayBreak.end),
        duration: formatDurationMinutes(minutes),
        variant: "break",
        ...anchor,
      });
    },
    [],
  );

  const hideHoverTooltip = useCallback(() => {
    setHoverTooltip(undefined);
  }, []);

  return (
    <section className="day-calendar">
      <div className="calendar-head">
        <div>
          <div className="studio-kicker">Today</div>
          <h2>Schedule</h2>
        </div>
        <div className="calendar-head-actions">
          <button
            aria-pressed={fitDayEnabled}
            className="calendar-fit-day-button"
            onClick={onToggleFitDay}
            title="Squeeze the whole day into view without scrolling"
            type="button"
          >
            {fitDayEnabled ? <Expand className="h-4 w-4" /> : <Shrink className="h-4 w-4" />}
            {fitDayEnabled ? "Actual Size" : "Fit Day"}
          </button>
          <button className="calendar-sync-button" onClick={onReloadCalendar} type="button">
            {isReloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarDays className="h-4 w-4" />
            )}
            Reload
          </button>
        </div>
      </div>

      <div
        className={cn("calendar-body", isReloading && "calendar-body-reloading")}
        ref={calendarBodyRef}
      >
        <div className="calendar-track" style={{ height: totalHeight }}>
          {visualSlots.map((minute) => (
            <TimeSlot key={minute} minute={minute} range={range} rowHeight={measuredRowHeight} />
          ))}
          {dropSlots.map((minute) => (
            <DroppableTimeSlot
              intervalMinutes={CALENDAR_INTERACTION_MINUTES}
              key={minute}
              minute={minute}
              range={range}
              rowHeight={measuredRowHeight}
            />
          ))}

          <div className="calendar-layer calendar-event-layer calendar-meeting-layer">
            <AnimatePresence>
              {calendarLayout.meetingLayouts.map((layout) => (
                <MeetingBlock
                  fitDayEnabled={fitDayEnabled}
                  key={layout.id}
                  layout={layout}
                  onHideTooltip={hideHoverTooltip}
                  onRequestDelete={onRequestDeleteMeeting}
                  onShowTooltip={showMeetingTooltip}
                  range={range}
                  rowHeight={measuredRowHeight}
                />
              ))}
            </AnimatePresence>
          </div>

          <div className="calendar-layer calendar-event-layer calendar-break-layer">
            <AnimatePresence>
              {calendarLayout.breakLayouts.map((layout) => (
                <BreakBlock
                  fitDayEnabled={fitDayEnabled}
                  key={layout.id}
                  layout={layout}
                  onHideTooltip={hideHoverTooltip}
                  onShowTooltip={showBreakTooltip}
                  range={range}
                  rowHeight={measuredRowHeight}
                />
              ))}
            </AnimatePresence>
          </div>

          <div className="calendar-layer calendar-event-layer calendar-task-layer">
            {calendarLayout.taskLayouts.map((layout) => (
              <ScheduledTaskBlock
                fitDayEnabled={fitDayEnabled}
                key={layout.id}
                layout={layout}
                onHideTooltip={hideHoverTooltip}
                onRequestDelete={onRequestDelete}
                onSelectTask={onSelectTask}
                onShowTooltip={showTaskTooltip}
                onResizeTask={onResizeTask}
                range={range}
                rowHeight={measuredRowHeight}
              />
            ))}
          </div>

          {localDropTarget && activeDropTask ? (
            <CalendarDropPreview
              durationMinutes={localDropTarget.durationMinutes}
              minute={localDropTarget.minute}
              range={range}
              rowHeight={measuredRowHeight}
              task={activeDropTask}
            />
          ) : null}

          <div aria-hidden="true" className="calendar-layer calendar-current-time-layer">
            <CurrentTimeLine minute={currentMinute} range={range} rowHeight={measuredRowHeight} />
          </div>
        </div>
      </div>

      <CalendarKindLegend />
      {hoverTooltip ? <CalendarHoverTooltipView tooltip={hoverTooltip} /> : null}
    </section>
  );
}

function calendarTooltipAnchor(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const x = Math.max(150, Math.min(viewportWidth - 150, rect.left + rect.width / 2));
  const canPlaceAbove = rect.top > 96;
  return {
    x,
    y: canPlaceAbove ? rect.top - 8 : rect.bottom + 8,
    placement: canPlaceAbove ? ("top" as const) : ("bottom" as const),
  };
}

function CalendarHoverTooltipView({ tooltip }: { tooltip: CalendarHoverTooltip }) {
  const label =
    tooltip.variant === "task" && tooltip.kind ? TASK_KIND_META[tooltip.kind].label : tooltip.label;
  return (
    <div
      className={cn(
        "calendar-hover-tooltip",
        `tooltip-${tooltip.placement}`,
        `tooltip-${tooltip.variant}`,
      )}
      role="tooltip"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      <div className="calendar-hover-tooltip-kicker">
        <span
          className={cn(
            "calendar-tooltip-kind-dot",
            tooltip.variant === "meeting"
              ? "calendar-tooltip-meeting-dot"
              : tooltip.variant === "break"
                ? "calendar-tooltip-break-dot"
                : tooltip.kind
                  ? TASK_KIND_META[tooltip.kind].className
                  : undefined,
          )}
        />
        <span>{label}</span>
      </div>
      <strong className="calendar-hover-tooltip-title">{tooltip.title}</strong>
      <div className="calendar-hover-tooltip-time">
        <Clock className="h-4 w-4" />
        <strong>{tooltip.timeRange}</strong>
        <span>{tooltip.duration}</span>
      </div>
    </div>
  );
}

function CalendarKindLegend() {
  return (
    <ul aria-label="Calendar color legend" className="calendar-kind-legend">
      <li className="calendar-kind-legend-item" key="meeting">
        <span className="calendar-kind-swatch calendar-kind-meeting" />
        <span>Meeting</span>
      </li>
      <li className="calendar-kind-legend-item" key="break">
        <span className="calendar-kind-swatch calendar-kind-break" />
        <span>Break</span>
      </li>
      {KIND_OPTIONS.map((kind) => {
        const meta = TASK_KIND_META[kind];
        return (
          <li className="calendar-kind-legend-item" key={kind}>
            <span className={cn("calendar-kind-swatch", `task-kind-${kind}`)} />
            <span>{meta.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function IdeasPanel({ day, onChange }: { day: DayPlan; onChange: (text: string) => void }) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.section
      className="ideas-panel"
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
      transition={{
        duration: prefersReducedMotion ? 0.1 : MOTION.duration.micro,
        ease: MOTION.ease.out,
      }}
    >
      <div className="ideas-head">
        <div>
          <div className="studio-kicker">Ideas</div>
          <h2>Scratchpad</h2>
        </div>
        <Lightbulb className="h-5 w-5" />
      </div>
      <textarea
        aria-label="Ideas scratchpad"
        onChange={(event) => onChange(event.target.value)}
        value={day.ideas.text}
      />
    </motion.section>
  );
}

const TimeSlot = memo(function TimeSlot({
  minute,
  range,
  rowHeight,
}: {
  minute: number;
  range: CalendarRange;
  rowHeight: number;
}) {
  const top = ((minute - range.startMinute) / range.slotMinutes) * rowHeight;

  return (
    <div className="time-slot" style={{ height: rowHeight, top }}>
      {minute % 60 === 0 ? <span>{formatMinute(minute)}</span> : null}
    </div>
  );
});

const DroppableTimeSlot = memo(function DroppableTimeSlot({
  intervalMinutes,
  minute,
  range,
  rowHeight,
}: {
  intervalMinutes: number;
  minute: number;
  range: CalendarRange;
  rowHeight: number;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `slot:${minute}` });
  const top = ((minute - range.startMinute) / range.slotMinutes) * rowHeight;
  const height = (intervalMinutes / range.slotMinutes) * rowHeight;

  return (
    <div
      aria-label={`Drop at ${formatCompactMinute(minute)}`}
      className={cn("time-drop-slot", isOver && "drop-hot")}
      data-slot-label={formatDropSlotLabel(minute)}
      ref={setNodeRef}
      role="presentation"
      style={{ height, top }}
    >
      {isOver ? <span>{formatDropSlotLabel(minute)}</span> : null}
    </div>
  );
});

function CalendarDropPreview({
  durationMinutes,
  minute,
  range,
  rowHeight,
  task,
}: {
  durationMinutes: number;
  minute: number;
  range: CalendarRange;
  rowHeight: number;
  task: TaskRecord;
}) {
  const endMinute = Math.min(range.endMinute, minute + durationMinutes);
  const metrics = verticalBlockMetrics(
    minute,
    endMinute,
    range,
    rowHeight,
    CALENDAR_TASK_MIN_HEIGHT,
  );
  const style = {
    top: metrics.top,
    height: metrics.height,
    minHeight: metrics.minHeight,
  };
  const timeLabel = `${formatCompactMinute(minute)}-${formatCompactMinute(endMinute)}`;

  return (
    <div className="calendar-layer calendar-drop-preview-layer" aria-hidden="true">
      <article className={cn("calendar-drop-preview", `task-kind-${task.kind}`)} style={style}>
        <span className="calendar-drop-preview-time">{timeLabel}</span>
        <strong>{task.title}</strong>
        <span>{formatDurationMinutes(endMinute - minute)}</span>
      </article>
    </div>
  );
}

function CalendarDragGhost({
  durationMinutes,
  minute,
  task,
}: {
  durationMinutes: number;
  minute?: number;
  task: TaskRecord;
}) {
  const height = Math.max(32, Math.min(88, durationMinutes * 1.15));
  const meta = TASK_KIND_META[task.kind];
  const Icon = meta.icon;
  const timeLabel =
    minute === undefined
      ? formatDurationMinutes(durationMinutes)
      : `${formatCompactMinute(minute)}-${formatCompactMinute(minute + durationMinutes)}`;

  return (
    <div
      className={cn("calendar-drag-ghost drag-ghost", `task-kind-${task.kind}`)}
      style={{ "--calendar-drag-ghost-height": `${height}px` } as CSSProperties}
    >
      <span aria-hidden="true" className={cn("calendar-event-kind-icon", meta.className)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div>
        <strong>{task.title}</strong>
        <span>{timeLabel}</span>
      </div>
    </div>
  );
}

const MeetingBlock = memo(function MeetingBlock({
  fitDayEnabled,
  layout,
  onHideTooltip,
  onRequestDelete,
  onShowTooltip,
  range,
  rowHeight,
}: {
  fitDayEnabled: boolean;
  layout: PackedCalendarLayout<CalendarMeetingItem>;
  onHideTooltip: () => void;
  onRequestDelete: (id: string) => void;
  onShowTooltip: (meeting: CalendarFile["meetings"][number], element: HTMLElement) => void;
  range: CalendarRange;
  rowHeight: number;
}) {
  const meeting = layout.item.meeting;
  const renderedHeight = calendarEventRenderedHeight(layout, range, rowHeight);
  const style = calendarEventStyleWithIcon(
    calendarEventBlockStyle(layout, range, rowHeight),
    renderedHeight,
  );
  const durationMinutes = minuteOfDay(meeting.end) - minuteOfDay(meeting.start);
  const isShortDuration = durationMinutes <= CALENDAR_HOVER_ONLY_MAX_MINUTES;
  const isHoverOnly = fitDayEnabled && isShortDuration;
  const isCentered = !fitDayEnabled && isShortDuration;
  const isCompact = !isCentered && (renderedHeight < 46 || layout.overlapColumnCount > 1);
  const meetingLink = meeting.meetingUrl || meeting.htmlLink;
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.article
      animate={{ opacity: 1, scale: 1 }}
      className="calendar-block meeting-block"
      data-centered-event={isCentered || undefined}
      data-compact-event={isCompact || undefined}
      data-overlap-count={layout.overlapColumnCount}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onHideTooltip();
      }}
      onFocus={(event) => onShowTooltip(meeting, event.currentTarget)}
      onMouseEnter={(event) => onShowTooltip(meeting, event.currentTarget)}
      onMouseLeave={onHideTooltip}
      style={style}
      title={`${meeting.title} · ${formatRange(meeting.start, meeting.end)}`}
      transition={{
        duration: prefersReducedMotion ? 0.1 : MOTION.duration.card,
        ease: MOTION.ease.out,
      }}
    >
      <div className="calendar-block-header meeting-block-header">
        <span aria-hidden="true" className="calendar-event-kind-icon meeting-event-icon">
          <Video className="h-3.5 w-3.5" />
        </span>
        {isHoverOnly ? null : <strong className="calendar-event-title">{meeting.title}</strong>}
        {isHoverOnly ? null : (
          <span className="calendar-event-time">{formatRange(meeting.start, meeting.end)}</span>
        )}
      </div>
      {!isHoverOnly && meeting.location ? (
        <p className="calendar-event-detail">{meeting.location}</p>
      ) : null}
      {meetingLink ? (
        <a
          aria-label={`Open meeting link for ${meeting.title}`}
          className="meeting-link-button"
          href={meetingLink}
          rel="noreferrer"
          target="_blank"
          title="Open meeting link"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
      <button
        aria-label={`Delete calendar event ${meeting.title}`}
        className="calendar-event-delete-button"
        onClick={() => onRequestDelete(meeting.id)}
        title="Delete calendar event"
        type="button"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.article>
  );
});

const BreakBlock = memo(function BreakBlock({
  fitDayEnabled,
  layout,
  onHideTooltip,
  onShowTooltip,
  range,
  rowHeight,
}: {
  fitDayEnabled: boolean;
  layout: PackedCalendarLayout<CalendarBreakItem>;
  onHideTooltip: () => void;
  onShowTooltip: (dayBreak: DayPlan["breaks"][number], element: HTMLElement) => void;
  range: CalendarRange;
  rowHeight: number;
}) {
  const dayBreak = layout.item.dayBreak;
  const renderedHeight = calendarEventRenderedHeight(layout, range, rowHeight);
  const style = calendarEventStyleWithIcon(
    calendarEventBlockStyle(layout, range, rowHeight),
    renderedHeight,
  );
  const durationMinutes = minuteOfDay(dayBreak.end) - minuteOfDay(dayBreak.start);
  const isShortDuration = durationMinutes <= CALENDAR_HOVER_ONLY_MAX_MINUTES;
  const isHoverOnly = fitDayEnabled && isShortDuration;
  const isCentered = !fitDayEnabled && isShortDuration;
  const isCompact = !isCentered && (renderedHeight < 44 || layout.overlapColumnCount > 1);
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.button
      animate={{ opacity: 1, scale: 1 }}
      aria-label={`${dayBreak.label}, ${formatRange(dayBreak.start, dayBreak.end)}`}
      className={cn("calendar-block break-block", `break-kind-${dayBreak.kind}`)}
      data-centered-event={isCentered || undefined}
      data-compact-event={isCompact || undefined}
      data-overlap-count={layout.overlapColumnCount}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onHideTooltip();
      }}
      onFocus={(event) => onShowTooltip(dayBreak, event.currentTarget)}
      onMouseEnter={(event) => onShowTooltip(dayBreak, event.currentTarget)}
      onMouseLeave={onHideTooltip}
      style={style}
      title={`${dayBreak.label} · ${formatRange(dayBreak.start, dayBreak.end)}`}
      transition={{
        duration: prefersReducedMotion ? 0.1 : MOTION.duration.card,
        ease: MOTION.ease.out,
      }}
      type="button"
    >
      <div className="calendar-block-header break-block-header">
        <span aria-hidden="true" className="calendar-event-kind-icon break-event-icon">
          <Clock className="h-3.5 w-3.5" />
        </span>
        {isHoverOnly ? null : <strong className="calendar-event-title">{dayBreak.label}</strong>}
        {isHoverOnly ? null : (
          <span className="calendar-event-time">{formatRange(dayBreak.start, dayBreak.end)}</span>
        )}
      </div>
    </motion.button>
  );
});

const ScheduledTaskBlock = memo(function ScheduledTaskBlock({
  fitDayEnabled,
  layout,
  onHideTooltip,
  onRequestDelete,
  range,
  onSelectTask,
  onShowTooltip,
  onResizeTask,
  rowHeight,
}: {
  fitDayEnabled: boolean;
  layout: PackedCalendarLayout<CalendarTaskItem>;
  onHideTooltip: () => void;
  onRequestDelete: (id: string) => void;
  range: CalendarRange;
  onSelectTask: (id: string) => void;
  onShowTooltip: (task: TaskRecord, minutes: number, element: HTMLElement) => void;
  onResizeTask: (taskId: string, nextEndMinute: number) => void;
  rowHeight: number;
}) {
  const task = layout.item.task;
  const minutes = scheduledTaskMinutes(task);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `scheduled:${task.id}`,
  });
  const renderedHeight = calendarEventRenderedHeight(layout, range, rowHeight);
  const baseStyle = calendarEventStyleWithIcon(
    calendarEventBlockStyle(layout, range, rowHeight),
    renderedHeight,
  );
  const isOverlapped = layout.overlapColumnCount > 1;
  const isShortDuration = minutes <= CALENDAR_HOVER_ONLY_MAX_MINUTES;
  const isHoverOnly = fitDayEnabled && isShortDuration;
  const isCentered = !fitDayEnabled && isShortDuration;
  const isIconOnly = !isCentered && renderedHeight < 16;
  const style = isIconOnly ? calendarIconOnlyTaskStyle(baseStyle, renderedHeight) : baseStyle;
  const isTiny =
    isHoverOnly ||
    (!isCentered &&
      (isIconOnly ||
        renderedHeight <= SCHEDULED_TASK_TINY_HEIGHT ||
        (isOverlapped && renderedHeight < SCHEDULED_TASK_COMPACT_HEIGHT)));
  const isCompact =
    isHoverOnly ||
    (!isCentered &&
      (isTiny ||
        minutes < 40 ||
        isOverlapped ||
        renderedHeight < SCHEDULED_TASK_STACKED_MIN_HEIGHT));
  const hoverText = calendarTaskHoverText(task, minutes);

  function beginResize(event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startMinute = minuteOfDay(task.scheduledStart!);
    const originalEndMinute = minuteOfDay(task.scheduledEnd!);

    function handlePointerMove(moveEvent: PointerEvent) {
      const rawDelta = ((moveEvent.clientY - startY) / rowHeight) * range.slotMinutes;
      const snappedDelta =
        Math.round(rawDelta / CALENDAR_INTERACTION_MINUTES) * CALENDAR_INTERACTION_MINUTES;
      const nextEndMinute = Math.max(
        startMinute + CALENDAR_INTERACTION_MINUTES,
        Math.min(range.endMinute, originalEndMinute + snappedDelta),
      );
      onResizeTask(task.id, nextEndMinute);
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <article
      className={cn(
        "calendar-block scheduled-task-block",
        `task-kind-${task.kind}`,
        isDragging && "scheduled-task-dragging",
      )}
      data-overlap-count={layout.overlapColumnCount}
      data-centered-task={isCentered || undefined}
      data-compact-task={isCompact || undefined}
      data-icon-only-task={isIconOnly || undefined}
      data-tiny-task={isTiny || undefined}
      data-visual-height={Math.round(renderedHeight)}
      data-tooltip={hoverText}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onHideTooltip();
      }}
      onFocus={(event) => onShowTooltip(task, minutes, event.currentTarget)}
      onMouseEnter={(event) => onShowTooltip(task, minutes, event.currentTarget)}
      onMouseLeave={onHideTooltip}
      ref={setNodeRef}
      style={style}
      title={hoverText}
    >
      <button
        aria-label={`${task.title}, ${minutes} minutes`}
        className="scheduled-task-body"
        onClick={() => onSelectTask(task.id)}
        title={hoverText}
        type="button"
        {...listeners}
        {...attributes}
      >
        <ScheduledTaskContent
          isIconOnly={isIconOnly}
          isTiny={isTiny}
          minutes={minutes}
          task={task}
        />
      </button>
      <TaskDeleteButton
        className="calendar-task-delete-button"
        label={`Delete ${task.title}`}
        onRequestDelete={onRequestDelete}
        taskId={task.id}
      />
      <button
        aria-label="Resize scheduled task"
        className="resize-handle"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={beginResize}
        title="Resize scheduled task"
        type="button"
      >
        <span />
      </button>
    </article>
  );
});

function ScheduledTaskContent({
  isIconOnly = false,
  isTiny = false,
  minutes,
  task,
}: {
  isIconOnly?: boolean;
  isTiny?: boolean;
  minutes?: number;
  task: TaskRecord;
}) {
  const duration = minutes ?? scheduledTaskMinutes(task);
  const meta = TASK_KIND_META[task.kind];
  const Icon = meta.icon;
  const timeLabel =
    task.scheduledStart && task.scheduledEnd
      ? formatRange(task.scheduledStart, task.scheduledEnd)
      : `${duration}m`;
  return (
    <div className="scheduled-task-content" data-tiny-content={isTiny || undefined}>
      <span
        aria-hidden="true"
        className={cn("calendar-event-kind-icon scheduled-task-kind-icon", meta.className)}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      {isIconOnly || isTiny ? null : <strong className="scheduled-task-title">{task.title}</strong>}
      {isTiny || isIconOnly ? null : <span className="scheduled-task-duration">{timeLabel}</span>}
    </div>
  );
}

function CurrentTimeLine({
  minute,
  range,
  rowHeight,
}: {
  minute: number | undefined;
  range: CalendarRange;
  rowHeight: number;
}) {
  if (minute === undefined || minute < range.startMinute || minute > range.endMinute) {
    return null;
  }
  const top = ((minute - range.startMinute) / range.slotMinutes) * rowHeight;

  return <div className="current-time-line" style={{ top }} />;
}

function TaskModal({
  task,
  onClose,
  promptSettings,
  deployState,
  deployDisabled,
  deployDisabledReason,
  onDeploy,
  grillEnabled,
  grillInProgress,
  onGrill,
  titleId,
  updateTask,
  workDate,
}: {
  task: TaskRecord;
  onClose: () => void;
  promptSettings: PromptSettings;
  deployState?: DeployState;
  deployDisabled: boolean;
  deployDisabledReason?: string;
  onDeploy: (model: AgentModel) => void;
  grillEnabled?: boolean;
  grillInProgress?: boolean;
  onGrill?: (task: TaskRecord) => void;
  titleId: string | undefined;
  updateTask: (update: (task: TaskRecord) => TaskRecord) => void;
  workDate: string;
}) {
  const [copied, setCopied] = useState(false);
  const [deployMenuOpen, setDeployMenuOpen] = useState(false);
  const [deployMenuPosition, setDeployMenuPosition] = useState<CSSProperties | undefined>();
  const deployMenuButtonRef = useRef<HTMLButtonElement>(null);
  const deployMenuRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const idPrefix = useId();
  const statusId = `${idPrefix}-status`;
  const kindId = `${idPrefix}-kind`;
  const estimateId = `${idPrefix}-estimate`;
  const estimateWarningId = `${idPrefix}-estimate-warning`;
  const promptWarningId = `${idPrefix}-prompt-required-warning`;
  const agentNameId = `${idPrefix}-agent-name`;
  const objectiveId = `${idPrefix}-objective`;
  const backgroundId = `${idPrefix}-background`;
  const sourcesId = `${idPrefix}-sources`;
  const constraintsId = `${idPrefix}-constraints`;
  const doneWhenId = `${idPrefix}-done-when`;
  const verificationId = `${idPrefix}-verification`;
  const showEstimateWarning = normalizeEstimateMinutes(task.estimateMinutes) > 30;
  const carryOverDays = taskCarryOverDays(task, workDate);
  const readiness = getTaskReadiness(task);
  const ticketFields = taskTicketFields(task);
  const kindMeta = TASK_KIND_META[task.kind];
  const latestAgentRun = task.agentRuns?.at(-1);
  const deployInFlight = deployState?.status === "deploying";
  const sourcesFallback = task.sourceRefs.length > 0 ? sourceLines(task) : "None needed";
  const sourcesValue =
    ticketFields.sourcesOverride ?? (task.sourceRefs.length > 0 ? sourcesFallback : "");
  const livePromptWarnings = useMemo(() => getPromptWarnings(task), [task]);
  const templatePromptWarnings = useMemo(
    () => validatePromptTemplate(promptSettings.promptTemplate),
    [promptSettings.promptTemplate],
  );
  const displayedPromptWarnings = useMemo(
    () => Array.from(new Set([...livePromptWarnings, ...templatePromptWarnings])),
    [livePromptWarnings, templatePromptWarnings],
  );
  const promptWarningSet = useMemo(
    () => new Set(displayedPromptWarnings),
    [displayedPromptWarnings],
  );
  const canDeploy =
    readiness === "ready" &&
    displayedPromptWarnings.length === 0 &&
    !deployDisabled &&
    !deployInFlight;
  const deployTitle =
    deployDisabledReason ??
    (readiness === "ready"
      ? "Launch a Claude background agent"
      : "Task must be agent-ready before deploy");
  const deployMenuPortalTarget =
    typeof document === "undefined"
      ? null
      : (document.querySelector<HTMLElement>(".studio-shell") ?? document.body);

  function isMissing(field: string) {
    const normalizedField = field.toLowerCase().replace(/\s+/g, "");
    return Array.from(promptWarningSet).some((warning) =>
      warning.toLowerCase().replace(/\s+/g, "").includes(normalizedField),
    );
  }

  function warningAttrs(field: string) {
    const missing = isMissing(field);
    return {
      "aria-describedby": missing ? promptWarningId : undefined,
      "aria-invalid": missing || undefined,
    } as const;
  }

  function requiredAttrs(field: string) {
    return {
      ...warningAttrs(field),
      "aria-required": true,
      required: true,
    } as const;
  }

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  });

  useEffect(() => {
    modalRef.current?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    if (!deployMenuOpen) return;

    function updatePosition() {
      setDeployMenuPosition(deployMenuStyle(deployMenuButtonRef.current));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [deployMenuOpen]);

  useMenuDismiss(deployMenuOpen, () => setDeployMenuOpen(false), [
    deployMenuButtonRef,
    deployMenuRef,
  ]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key === "Tab") {
        const modal = modalRef.current;
        if (!modal) return;
        const focusable = getFocusableElements(modal);
        if (focusable.length === 0) {
          event.preventDefault();
          modal.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  function patch(partial: Partial<TaskRecord>) {
    updateTask((current) => ({ ...current, ...partial }));
  }

  function patchTicketField(field: keyof TaskRecord["ticketFields"], value: string) {
    updateTask((current) => ({
      ...current,
      ticketFields: {
        ...taskTicketFields(current),
        [field]: value,
      },
    }));
  }

  async function copyPrompt() {
    if (readiness === "incomplete") {
      await navigator.clipboard.writeText(buildCaptureSummary(task));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
      return;
    }
    const rendered = renderAgentPrompt(task, promptSettings);
    if (
      rendered.readiness === "warning" &&
      !window.confirm(
        `This prompt is not fully agent-ready.\n\nMissing or risky:\n- ${rendered.warnings.join(
          "\n- ",
        )}\n\nCopy anyway?`,
      )
    ) {
      return;
    }
    await navigator.clipboard.writeText(rendered.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function deploy(model: AgentModel) {
    if (!canDeploy) return;
    setDeployMenuOpen(false);
    onDeploy(model);
  }

  function toggleDeployMenu() {
    if (!canDeploy) return;
    setDeployMenuOpen((open) => {
      if (open) return false;
      setDeployMenuPosition(deployMenuStyle(deployMenuButtonRef.current));
      return true;
    });
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="modal-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        aria-labelledby={titleId}
        aria-modal="true"
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={cn("task-modal", kindMeta.className)}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        initial={{ opacity: 0, scale: 0.97, y: 20 }}
        ref={modalRef}
        role="dialog"
        tabIndex={-1}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title-group">
            <div className="studio-kicker">Task · Required</div>
            <textarea
              aria-describedby={isMissing("title") ? promptWarningId : undefined}
              aria-invalid={isMissing("title") || undefined}
              aria-label="Task title, required"
              aria-required="true"
              className="modal-title-input"
              id={titleId}
              onChange={(event) => {
                const title = event.target.value;
                updateTask((current) => {
                  const currentFields = taskTicketFields(current);
                  const shouldSyncObjective =
                    !currentFields.objective.trim() ||
                    currentFields.objective.trim() === current.title.trim();
                  return {
                    ...current,
                    title,
                    ticketFields: {
                      ...currentFields,
                      objective: shouldSyncObjective ? title : currentFields.objective,
                    },
                  };
                });
              }}
              ref={titleRef}
              required
              rows={1}
              value={task.title}
            />
            <div className="modal-chip-strip">
              <ReadinessBadge
                compact
                readiness={readiness}
                tooltip={readinessTooltip(readiness, displayedPromptWarnings)}
              />
              <KindBadge compact kind={task.kind} tooltip={kindTooltip(task.kind)} />
              <TaskSourceChip task={task} tooltip={sourceTooltip(task)} />
              <TaskDurationWarning
                carryOverDays={carryOverDays}
                compact
                id={estimateWarningId}
                minutes={task.estimateMinutes}
                withTooltips
              />
            </div>
          </div>
          <button aria-label="Close" className="icon-button" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="modal-toolbar">
          <label className="modal-field modal-field-status" htmlFor={statusId}>
            <span className="modal-field-label">Status</span>
            <span className="modal-select-control">
              <select
                id={statusId}
                onChange={(event) => {
                  const status = event.target.value as TaskStatus;
                  patch({
                    status,
                    completedAt: status === "done" ? new Date().toISOString() : undefined,
                  });
                }}
                value={task.status}
              >
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="modal-field modal-field-kind" htmlFor={kindId}>
            <span className="modal-field-label">Kind</span>
            <span className="modal-select-control">
              <select
                id={kindId}
                onChange={(event) => patch({ kind: event.target.value as TaskRecord["kind"] })}
                value={task.kind}
              >
                {KIND_OPTIONS.map((kind) => (
                  <option key={kind} value={kind}>
                    {TASK_KIND_META[kind].label}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="modal-field modal-field-depth" htmlFor={`${idPrefix}-work-depth`}>
            <span className="modal-field-label">Depth</span>
            <span className="modal-select-control">
              <select
                id={`${idPrefix}-work-depth`}
                onChange={(event) => patch({ workDepth: event.target.value as WorkDepth })}
                value={task.workDepth}
              >
                <option value="deep">Deep</option>
                <option value="shallow">Shallow</option>
              </select>
            </span>
          </label>
          <label className="modal-field modal-field-estimate" htmlFor={estimateId}>
            <span className="modal-field-label">Estimate</span>
            <EstimateInput
              aria-describedby={showEstimateWarning ? estimateWarningId : undefined}
              id={estimateId}
              onCommit={(minutes) =>
                updateTask((current) => applyEstimateMinutes(current, minutes, workDate))
              }
              value={task.estimateMinutes}
            />
          </label>
          <div className="modal-action-group">
            <button className="copy-prompt-button" onClick={copyPrompt} type="button">
              {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
              {copied ? "Copied" : readiness === "incomplete" ? "Copy capture" : "Copy prompt"}
            </button>
            {grillEnabled && onGrill ? (
              <button
                className="copy-prompt-button"
                disabled={grillInProgress}
                onClick={() => onGrill(task)}
                type="button"
              >
                <MessageCircleQuestion className="h-4 w-4" />
                {grillInProgress ? "Re-grilling..." : "Re-grill"}
              </button>
            ) : null}
            <div className="deploy-agent-control">
              <button
                className="deploy-agent-main"
                disabled={!canDeploy}
                onClick={() => deploy("sonnet")}
                title={deployTitle}
                type="button"
              >
                {deployInFlight ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                {deployInFlight ? "Deploying" : "Deploy Sonnet"}
              </button>
              <button
                aria-expanded={deployMenuOpen}
                aria-label="Choose deploy model"
                className="deploy-agent-menu-button"
                disabled={!canDeploy}
                onClick={toggleDeployMenu}
                ref={deployMenuButtonRef}
                type="button"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              {deployMenuOpen
                ? deployMenuPortalTarget
                  ? createPortal(
                      <div
                        className="deploy-agent-menu"
                        ref={deployMenuRef}
                        style={deployMenuPosition}
                      >
                        {AGENT_MODEL_OPTIONS.filter((option) => option.model !== "sonnet").map(
                          (option) => (
                            <button
                              key={option.model}
                              onClick={() => deploy(option.model)}
                              type="button"
                            >
                              Deploy {option.label}
                            </button>
                          ),
                        )}
                      </div>,
                      deployMenuPortalTarget,
                    )
                  : null
                : null}
            </div>
          </div>
        </div>
        <DeployAgentStatus deployState={deployState} latestAgentRun={latestAgentRun} />
        {displayedPromptWarnings.length > 0 ? (
          <div
            aria-live="polite"
            className="prompt-required-warning"
            id={promptWarningId}
            role="alert"
          >
            {readiness === "incomplete" ? "Capture is not agent-ready: " : "Prompt warning: "}
            {displayedPromptWarnings.join(", ")}
          </div>
        ) : null}

        <section className="agent-fields-panel">
          <div className="agent-fields-head">
            <div>
              <div className="studio-kicker">Agent handoff</div>
              <h3>Ticket fields</h3>
            </div>
            <WorkDepthBadge workDepth={task.workDepth} />
          </div>
          <label className="ticket-field agent-name-field" htmlFor={agentNameId}>
            Agent name
            <input
              id={agentNameId}
              onChange={(event) =>
                patch({ agentName: sanitizeAgentName(event.target.value) || undefined })
              }
              placeholder="fix-funded-supply"
              value={task.agentName || ""}
            />
            <span className="field-hint">
              Used as the Claude background agent name when you deploy this task.
            </span>
          </label>
          <div className="agent-fields-grid">
            <label
              className="ticket-field ticket-field-primary field-tint-primary"
              htmlFor={objectiveId}
            >
              <RequiredLabel>Objective</RequiredLabel>
              <textarea
                {...requiredAttrs("objective")}
                id={objectiveId}
                onChange={(event) => patchTicketField("objective", event.target.value)}
                placeholder="The exact outcome the agent should create."
                value={ticketFields.objective}
              />
            </label>
            <label
              className="ticket-field ticket-field-primary field-tint-primary"
              htmlFor={doneWhenId}
            >
              <RequiredLabel>Done when</RequiredLabel>
              <textarea
                {...requiredAttrs("done when")}
                id={doneWhenId}
                onChange={(event) => patchTicketField("doneWhen", event.target.value)}
                placeholder={DONE_WHEN_PLACEHOLDER}
                value={ticketFields.doneWhen}
              />
            </label>
            <label
              className="ticket-field ticket-field-wide field-tint-info"
              htmlFor={backgroundId}
            >
              Background
              <textarea
                {...warningAttrs("background")}
                id={backgroundId}
                onChange={(event) => patchTicketField("background", event.target.value)}
                placeholder={TASK_CONTEXT_PLACEHOLDER}
                value={ticketFields.background}
              />
            </label>
            <label className="ticket-field ticket-field-wide field-tint-info" htmlFor={sourcesId}>
              Sources
              <textarea
                {...warningAttrs("sources")}
                id={sourcesId}
                onChange={(event) =>
                  patchTicketField(
                    "sourcesOverride",
                    event.target.value.trim() ? event.target.value : "",
                  )
                }
                placeholder={sourcesFallback}
                value={sourcesValue}
              />
              <span className="field-hint">
                {ticketFields.sourcesOverride?.trim()
                  ? "Using custom sources."
                  : task.sourceRefs.length > 0
                    ? `Using default: ${sourcesFallback.replace(/\n/g, " ")}`
                    : "No source refs captured."}
              </span>
            </label>
            <label className="ticket-field field-tint-warning" htmlFor={constraintsId}>
              Constraints / Non-goals
              <textarea
                {...warningAttrs("constraints")}
                id={constraintsId}
                onChange={(event) => patchTicketField("constraintsNonGoals", event.target.value)}
                placeholder="Scope boundaries, non-goals, ask-before rules, or None."
                value={ticketFields.constraintsNonGoals}
              />
            </label>
            <label className="ticket-field field-tint-success" htmlFor={verificationId}>
              Verification
              <textarea
                {...warningAttrs("verification")}
                id={verificationId}
                onChange={(event) => patchTicketField("verification", event.target.value)}
                placeholder="Checks, commands, screenshots, reviews, or manual validation."
                value={ticketFields.verification}
              />
            </label>
          </div>
        </section>
      </motion.section>
    </motion.div>
  );
}

const PROMPT_PLACEHOLDER_LEGEND = [
  "objectiveBody",
  "backgroundBody",
  "sourcesBody",
  "constraintsBody",
  "doneWhenBody",
  "verificationBody",
  "estimateBody",
  "ticketBody",
  "sources",
  "kind",
  "workDepth",
  "estimateMinutes",
  "readinessWarnings",
  "project",
  "title",
];

const PROMPT_PLACEHOLDER_DESCRIPTIONS: Record<string, string> = {
  objectiveBody: "Objective: what the task is trying to accomplish.",
  backgroundBody: "Background: context worth knowing before starting.",
  sourcesBody: "Sources: notes on where to find relevant info.",
  constraintsBody: "Constraints: scope boundaries and things not to do.",
  doneWhenBody: "Done when: what finished looks like.",
  verificationBody: "Verification: how to check the work.",
  estimateBody: 'Estimate: the time estimate and work depth, e.g. "45 minutes, deep work."',
  ticketBody: "Ticket body: the full write-up, objective through estimate, as one block.",
  sources: "Source links: the task's captured links, as a list.",
  kind: "Kind: the task's category, e.g. focus, quick, or comms.",
  workDepth: "Work depth: how demanding the work is, deep or shallow.",
  estimateMinutes: "Estimate minutes: the time estimate as a number.",
  readinessWarnings: 'Readiness warnings: what\'s blocking full agent-readiness, or "None".',
  project: 'Project: the project or area this task belongs to, or "None".',
  title: "Title: the task's title.",
};

function PromptPlaceholderChip({ placeholder }: { placeholder: string }) {
  const tooltipAttrs = useChipTooltipAttrs(PROMPT_PLACEHOLDER_DESCRIPTIONS[placeholder]);
  return <code {...tooltipAttrs}>{`{{${placeholder}}}`}</code>;
}

function PromptSettingsModal({
  onClose,
  onSave,
  saveState,
  settings,
  warning,
}: {
  onClose: () => void;
  onSave: (template: string) => void;
  saveState: SettingsSaveState;
  settings: PromptSettings;
  warning?: string;
}) {
  const [draft, setDraft] = useState(settings.promptTemplate);
  const titleId = useId();
  const preview = renderPromptTemplate(draft, promptSettingsPreviewValues());
  const warnings = Array.from(new Set([...validatePromptTemplate(draft), ...preview.warnings]));

  useEffect(() => {
    setDraft(settings.promptTemplate);
  }, [settings.promptTemplate]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="modal-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.section
        aria-labelledby={titleId}
        aria-modal="true"
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="prompt-settings-modal"
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        initial={{ opacity: 0, scale: 0.97, y: 20 }}
        role="dialog"
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-title-group">
            <div className="studio-kicker">Copy prompt</div>
            <h2 id={titleId}>Prompt template</h2>
          </div>
          <button aria-label="Close" className="icon-button" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="field-hint prompt-copy-hint">
          This template is the exact structure the "Copy Prompt" button copies. Edit it here to
          change what gets copied.
        </p>
        <div className="prompt-settings-grid">
          <label className="prompt-template-field">
            <span>Template</span>
            <textarea onChange={(event) => setDraft(event.target.value)} value={draft} />
            <span className="field-hint">Available placeholders (hover each for details)</span>
            <div className="prompt-placeholder-legend">
              {PROMPT_PLACEHOLDER_LEGEND.map((placeholder) => (
                <PromptPlaceholderChip key={placeholder} placeholder={placeholder} />
              ))}
            </div>
          </label>
          <section className="prompt-preview">
            <div className="prompt-preview-head">
              <div className="studio-kicker">Preview</div>
              <Clipboard className="h-4 w-4" aria-hidden="true" />
            </div>
            <pre>{preview.text}</pre>
          </section>
        </div>
        {warnings.length > 0 ? (
          <div className="prompt-required-warning" role="alert">
            {warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
        {warning ? (
          <div className="prompt-required-warning" role="status">
            {warning}
          </div>
        ) : null}
        <div className="prompt-settings-actions">
          <button
            className="task-capture-cancel"
            onClick={() => setDraft(DEFAULT_PROMPT_TEMPLATE)}
            type="button"
          >
            <Shuffle className="h-4 w-4" />
            Reset
          </button>
          <button className="task-capture-cancel" onClick={onClose} type="button">
            <X className="h-4 w-4" />
            Cancel
          </button>
          <button onClick={() => onSave(draft)} type="button">
            <Save className="h-4 w-4" />
            {saveState === "saving" ? "Saving" : "Save template"}
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

function DeployAgentStatus({
  deployState,
  latestAgentRun,
}: {
  deployState?: DeployState;
  latestAgentRun?: AgentRun;
}) {
  const prefersReducedMotion = useReducedMotion();

  let statusKey: string;
  let content: ReactNode;

  if (deployState?.status === "deploying") {
    statusKey = "deploying";
    content = (
      <div className="deploy-agent-status" role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        Deploying {agentModelUiLabel(deployState.model)}...
      </div>
    );
  } else if (deployState?.status === "error") {
    statusKey = "error";
    content = (
      <div className="deploy-agent-status deploy-agent-status-error" role="alert">
        <TriangleAlert className="h-4 w-4" />
        {deployState.message}
      </div>
    );
  } else if (deployState?.status === "success") {
    statusKey = "success";
    content = (
      <div className="deploy-agent-status" role="status">
        <Rocket className="h-4 w-4" />
        {deployState.message}
      </div>
    );
  } else if (latestAgentRun) {
    statusKey = "last-run";
    content = (
      <div className="deploy-agent-status">
        <Rocket className="h-4 w-4" />
        Deployed {agentModelUiLabel(latestAgentRun.model)} {formatAgentRunTime(latestAgentRun)}
        <span>{latestAgentRun.name}</span>
      </div>
    );
  } else {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={statusKey}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -6 }}
        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
        transition={{ duration: prefersReducedMotion ? 0.1 : 0.16, ease: MOTION.ease.out }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}

const GRILL_PROMPT_CONTRACT_SUMMARY = [
  "You are helping me get a task ready for an autonomous coding agent.",
  "Ask only what is needed to resolve: the exact outcome, the authoritative source,",
  "scope and non-goals, what proves it is done, how to verify it, and a time estimate",
  "(15, 30, 60, 90, or 120 minutes).",
  "Ask 2 to 5 open ended questions as one numbered list. No suggested answers, no defaults.",
  "Ask at most one follow up round, then produce the draft.",
  "Resolve every field explicitly, including sources: write None when nothing applies.",
  "Never leave a field blank or write Unknown. Never invent specifics I did not state.",
].join(" ");

function buildGrillPromptText(task: TaskRecord): string {
  const fields = taskTicketFields(task);
  const taskJson = JSON.stringify(
    {
      title: task.title,
      kind: task.kind,
      workDepth: task.workDepth,
      estimateMinutes: task.estimateMinutes,
      ticketFields: fields,
      sourceRefs: task.sourceRefs,
    },
    null,
    2,
  );
  return [
    GRILL_PROMPT_CONTRACT_SUMMARY,
    "",
    "== TASK ==",
    taskJson,
    "",
    "Interview me with one concise numbered list of open questions, then output the draft fields as JSON.",
  ].join("\n");
}

async function copyGrillPrompt(task: TaskRecord) {
  await navigator.clipboard.writeText(buildGrillPromptText(task));
}

// Create-mode copy-prompt fallback (spec 7.2): mirrors buildGrillPromptText but seeds the interview
// from the typed intent, since a create session has no task yet.
function buildCreateGrillPromptText(intent: string): string {
  return [
    GRILL_PROMPT_CONTRACT_SUMMARY,
    "",
    "== INTENT ==",
    intent.trim() || "(no intent captured yet)",
    "",
    "Interview me with one concise numbered list of open questions, then output the draft fields as JSON.",
  ].join("\n");
}

function DeleteTaskConfirm({
  onCancel,
  onConfirm,
  task,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  task: TaskRecord;
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="delete-confirm-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <motion.section
        aria-labelledby={titleId}
        aria-modal="true"
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="delete-confirm"
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        role="alertdialog"
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="delete-confirm-icon">
          <Trash2 className="h-5 w-5" />
        </div>
        <div className="delete-confirm-copy">
          <h2 id={titleId}>Delete this ticket?</h2>
          <p>{task.title}</p>
        </div>
        <div className="delete-confirm-actions">
          <button className="delete-confirm-cancel" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="delete-confirm-delete" onClick={onConfirm} type="button">
            Delete ticket
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

function DeleteMeetingConfirm({
  meeting,
  onCancel,
  onConfirm,
}: {
  meeting: CalendarFile["meetings"][number];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="delete-confirm-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <motion.section
        aria-labelledby={titleId}
        aria-modal="true"
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="delete-confirm"
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        role="alertdialog"
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="delete-confirm-icon">
          <Trash2 className="h-5 w-5" />
        </div>
        <div className="delete-confirm-copy">
          <h2 id={titleId}>Delete this calendar event?</h2>
          <p>
            Remove <strong>{meeting.title}</strong> from this internal working-memory calendar. This
            does not delete the Google Calendar event.
          </p>
        </div>
        <div className="delete-confirm-actions">
          <button className="delete-confirm-cancel" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="delete-confirm-delete" onClick={onConfirm} type="button">
            Delete event
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

function CloseTrackerConfirm({
  onCancel,
  onConfirm,
  tracker,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  tracker: TrackerRecord;
}) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="delete-confirm-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <motion.section
        aria-labelledby={titleId}
        aria-modal="true"
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="delete-confirm close-tracker-confirm"
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        role="alertdialog"
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="delete-confirm-icon close-confirm-icon">
          <Check className="h-5 w-5" />
        </div>
        <div className="delete-confirm-copy">
          <h2 id={titleId}>Close this tracker?</h2>
          <p>
            Mark <strong>{tracker.person}</strong>&apos;s {tracker.work} as done. The tracker stays
            in the archive history.
          </p>
        </div>
        <div className="delete-confirm-actions">
          <button className="delete-confirm-cancel" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="delete-confirm-close" onClick={onConfirm} type="button">
            Close tracker
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

export function BatchDeployConfirm({
  busy,
  excluded,
  models,
  onCancel,
  onClose,
  onConfirm,
  onToggleExclude,
  result,
  setModel,
  tasks,
}: {
  busy: boolean;
  excluded: Set<string>;
  models: Record<string, AgentModel>;
  onCancel: () => void;
  onClose: () => void;
  onConfirm: () => void;
  onToggleExclude: (taskId: string) => void;
  result?: BatchDeployResult;
  setModel: (taskId: string, model: AgentModel) => void;
  tasks: Array<{ id: string; title: string }>;
}) {
  const titleId = useId();
  const done = Boolean(result);
  const includedCount = tasks.filter((t) => !excluded.has(t.id)).length;
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) (done ? onClose : onCancel)();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, done, onCancel, onClose]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="delete-confirm-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) (done ? onClose : onCancel)();
      }}
    >
      <motion.section
        aria-labelledby={titleId}
        aria-modal="true"
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="delete-confirm batch-deploy-confirm"
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        role="alertdialog"
        transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="delete-confirm-icon">
          <Rocket className="h-5 w-5" />
        </div>
        <div className="delete-confirm-copy">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div
                key="result"
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -8 }}
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
                transition={{
                  duration: prefersReducedMotion ? 0.1 : MOTION.duration.card,
                  ease: MOTION.ease.out,
                }}
              >
                <h2 id={titleId}>Batch deploy finished</h2>
                <div className="batch-deploy-summary">
                  <p className="batch-deploy-summary-line">
                    {result.succeeded.length} deployed
                    {result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}.
                  </p>
                  {result.succeeded.length > 0 ? (
                    <ul className="batch-deploy-list batch-deploy-list-success">
                      {result.succeeded.map((title, index) => (
                        <motion.li
                          key={title}
                          animate={{ opacity: 1, y: 0 }}
                          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
                          transition={{
                            delay: prefersReducedMotion ? 0 : Math.min(index, 5) * 0.03,
                            duration: prefersReducedMotion ? 0.1 : MOTION.duration.micro,
                            ease: MOTION.ease.out,
                          }}
                        >
                          {title}
                        </motion.li>
                      ))}
                    </ul>
                  ) : null}
                  {result.failed.length > 0 ? (
                    <ul className="batch-deploy-list batch-deploy-list-error">
                      {result.failed.map((failure, index) => (
                        <motion.li
                          key={failure.title}
                          animate={{ opacity: 1, y: 0 }}
                          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
                          transition={{
                            delay: prefersReducedMotion ? 0 : Math.min(index, 5) * 0.03,
                            duration: prefersReducedMotion ? 0.1 : MOTION.duration.micro,
                            ease: MOTION.ease.out,
                          }}
                        >
                          {failure.title}
                          <span>{failure.message}</span>
                        </motion.li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="confirm"
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -8 }}
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
                transition={{
                  duration: prefersReducedMotion ? 0.1 : MOTION.duration.card,
                  ease: MOTION.ease.out,
                }}
              >
                <h2 id={titleId}>
                  {`Deploy ${includedCount}${
                    includedCount !== tasks.length ? ` of ${tasks.length}` : ""
                  } agent-ready task${includedCount === 1 ? "" : "s"}?`}
                </h2>
                <ul className="batch-deploy-list batch-deploy-list-confirm">
                  {tasks.map((task) => (
                    <li
                      className={cn(
                        "batch-deploy-task-row",
                        excluded.has(task.id) && "is-excluded",
                      )}
                      key={task.id}
                    >
                      <input
                        type="checkbox"
                        className="batch-deploy-task-toggle"
                        checked={!excluded.has(task.id)}
                        disabled={busy}
                        onChange={() => onToggleExclude(task.id)}
                        aria-label={`Include ${task.title} in this deploy`}
                      />
                      <span className="batch-deploy-task-name" title={task.title}>
                        {task.title}
                      </span>
                      <select
                        aria-label={`Model for ${task.title}`}
                        className="batch-deploy-task-model"
                        disabled={busy || excluded.has(task.id)}
                        onChange={(event) => setModel(task.id, event.target.value as AgentModel)}
                        value={models[task.id] ?? "sonnet"}
                      >
                        {AGENT_MODEL_OPTIONS.map((option) => (
                          <option key={option.model} value={option.model}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="delete-confirm-actions">
          {result ? (
            <button className="delete-confirm-cancel" onClick={onClose} type="button">
              Close
            </button>
          ) : (
            <>
              <button
                className="delete-confirm-cancel"
                disabled={busy}
                onClick={onCancel}
                type="button"
              >
                Cancel
              </button>
              <button
                className="delete-confirm-close"
                disabled={busy || includedCount === 0}
                onClick={onConfirm}
                type="button"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                {busy ? "Deploying..." : "Confirm"}
              </button>
            </>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}

function CompletionBurst({
  burst,
  onDismiss,
}: {
  burst: CompletionBurstState;
  onDismiss: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const headline =
    burst.variant === "complete"
      ? "Day complete"
      : burst.variant === "milestone"
        ? `${burst.percent}% complete`
        : "Done";
  const detail =
    burst.variant === "complete"
      ? `All ${burst.total} tasks closed`
      : burst.remaining === 1
        ? "1 more to 100%"
        : `${burst.remaining} left`;
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      aria-live="polite"
      className={cn("completion-burst", `completion-burst-${burst.variant}`)}
      exit={{ opacity: 0, scale: 0.9, y: -16 }}
      initial={{
        opacity: 0,
        scale: prefersReducedMotion ? 1 : 0.9,
        y: prefersReducedMotion ? 0 : 24,
      }}
      role="status"
      transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: "easeOut" }}
    >
      <Sparkles className="completion-burst-icon h-7 w-7" />
      <strong>{headline}</strong>
      <button
        aria-label="Dismiss completion fact"
        className="completion-burst-dismiss"
        onClick={onDismiss}
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <span>{burst.title}</span>
      <em>{detail}</em>
      <p>
        <b>{burst.fact.subject}</b>
        {burst.fact.text}
      </p>
    </motion.div>
  );
}

function useCurrentMinute(date: string, timezone: string) {
  const [minute, setMinute] = useState(() => currentMinuteForDate(date, timezone));

  useEffect(() => {
    setMinute(currentMinuteForDate(date, timezone));
    const interval = window.setInterval(() => {
      setMinute(currentMinuteForDate(date, timezone));
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [date, timezone]);

  return minute;
}

function buildCalendarRange(day: DayPlan, meetings: CalendarFile["meetings"] = []): CalendarRange {
  const slotMinutes = normalizeEstimateMinutes(day.settings.slotMinutes || WORKDAY_SLOT_MINUTES);
  const baseStartMinute = Math.max(0, Math.min(23 * 60, day.settings.startHour * 60));
  const baseEndMinute = Math.max(
    baseStartMinute + slotMinutes,
    Math.min(24 * 60, day.settings.endHour * 60),
  );

  // Keep the configured window (default 8am-6pm) as the baseline, but stretch it
  // to fit any scheduled item that falls outside it, so out-of-hours meetings,
  // tasks, and breaks are shown instead of being hidden or clipped. When nothing
  // falls outside the configured hours the window is unchanged.
  let contentStart = baseStartMinute;
  let contentEnd = baseEndMinute;
  const extend = (rawStart: string, rawEnd: string, minSpan: number) => {
    const start = minuteOfDay(rawStart);
    if (!Number.isFinite(start)) return;
    const end = Math.max(minuteOfDay(rawEnd), start + minSpan);
    if (!Number.isFinite(end)) return;
    contentStart = Math.min(contentStart, start);
    contentEnd = Math.max(contentEnd, end);
  };
  for (const meeting of meetings) {
    if (meeting.allDay) continue;
    extend(meeting.start, meeting.end, 15);
  }
  for (const task of day.tasks) {
    if (!task.scheduledStart || !task.scheduledEnd) continue;
    extend(task.scheduledStart, task.scheduledEnd, CALENDAR_INTERACTION_MINUTES);
  }
  for (const dayBreak of day.breaks) {
    extend(dayBreak.start, dayBreak.end, 5);
  }

  const startMinute = Math.max(0, Math.min(23 * 60, contentStart));
  const endMinute = Math.max(startMinute + slotMinutes, Math.min(24 * 60, contentEnd));

  return {
    startMinute: floorToInterval(startMinute, slotMinutes),
    endMinute: Math.min(24 * 60, ceilToInterval(endMinute, slotMinutes)),
    slotMinutes,
  };
}

function floorToInterval(value: number, interval: number) {
  return Math.max(0, Math.floor(value / interval) * interval);
}

function ceilToInterval(value: number, interval: number) {
  return Math.ceil(value / interval) * interval;
}

function buildSlots(startMinute: number, endMinute: number, slotMinutes: number) {
  const slots: number[] = [];
  for (let minute = startMinute; minute < endMinute; minute += slotMinutes) {
    slots.push(minute);
  }
  return slots;
}

function currentResolutionWarning(resolution: CurrentResolution | undefined) {
  if (!resolution) return undefined;
  if (!resolution.selectedDate) {
    return "Today's good morning routine has not been run. No archived working-memory day exists yet.";
  }
  const showingFallbackOlderDay =
    resolution.isFallback && resolution.selectedDate !== resolution.today;
  if (resolution.todayExists && !resolution.morningRunComplete && !showingFallbackOlderDay) {
    return "Today's day exists, but morning routine has not completed.";
  }
  if (showingFallbackOlderDay || !resolution.morningRunComplete) {
    return `Today's good morning routine has not been run. Showing latest plan from ${resolution.selectedDate}.`;
  }
  return undefined;
}

function selectedDayMorningWarning(day: DayPlan | undefined, date: string, today: string) {
  if (!day || date !== today) return undefined;
  if (day.lifecycle.morningRunAt?.trim()) return undefined;
  return "Today's day exists, but morning routine has not completed.";
}

function todayInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function summarizeProgress(tasks: TaskRecord[]): ProgressSummary {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = Math.max(0, total - done);
  const nextMilestonePercent = PROGRESS_MILESTONES.find((milestone) => percent < milestone);
  const tasksToNext =
    total > 0 && nextMilestonePercent
      ? Math.max(1, Math.ceil((nextMilestonePercent / 100) * total) - done)
      : undefined;
  return { done, total, percent, remaining, nextMilestonePercent, tasksToNext };
}

function isSlotCollision(collision: Collision) {
  return String(collision.id).startsWith("slot:");
}

function progressThemeStyle(progress: ProgressSummary) {
  const depth = Math.max(12, Math.min(68, 14 + progress.percent * 0.54));
  const glow = Math.max(10, Math.min(36, 12 + progress.percent * 0.22));
  const meter =
    progress.percent >= 100
      ? "#14b884"
      : progress.percent >= 70
        ? "#d88f16"
        : progress.percent >= 40
          ? "#2563eb"
          : "#0d9488";

  return {
    "--progress-depth": `${depth}%`,
    "--progress-glow": `${glow}%`,
    "--progress-meter-color": meter,
  } as CSSProperties;
}

function completionRemainingText(progress: ProgressSummary) {
  if (progress.total === 0) return "No tickets yet";
  if (progress.remaining === 0) return `All ${progress.total} tasks completed`;
  if (progress.remaining === 1) return "1 more to 100%";
  return `${progress.remaining} left to close the day`;
}

function completionCelebrationText(progress: ProgressSummary) {
  if (progress.total === 0) return "Set the field, then start turning plans into receipts.";
  if (progress.remaining === 0) return "The board is clear. Every planned item has landed.";
  if (progress.done === 0) return "The runway is built. First win is still waiting.";
  if (progress.percent >= 75) return "Most of the day is behind you. Keep the line moving.";
  if (progress.percent >= 50)
    return "Real progress is visible. The middle of the day is paying off.";
  return "The first wins are on the board. Momentum is compounding.";
}

function completionFactForTask(
  title: string,
  progress: ProgressSummary,
  facts: readonly CompletionFact[] = COMPLETION_FACTS,
) {
  const pool = facts.length > 0 ? facts : COMPLETION_FACTS;
  const seed = Array.from(title).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return pool[(seed + progress.done * 7 + progress.percent) % pool.length];
}

function sortTrackers(trackers: TrackerRecord[]) {
  return [...trackers].sort(
    (a, b) =>
      trackerSortDate(b).localeCompare(trackerSortDate(a)) ||
      a.person.localeCompare(b.person) ||
      a.work.localeCompare(b.work),
  );
}

function trackerSortDate(tracker: TrackerRecord) {
  return tracker.createdAt || tracker.updatedAt || tracker.originalAskDate || "";
}

function isTrackerClosed(status: TrackerRecord["status"]) {
  return status === "done" || status === "dropped";
}

function trackerAgeDays(tracker: TrackerRecord, workDate: string) {
  return daysBetweenDateKeys(tracker.originalAskDate, workDate);
}

function formatTrackerAge(ageDays: number) {
  if (ageDays <= 0) return "Started today";
  if (ageDays === 1) return "1 day open";
  return `${ageDays} days open`;
}

function formatTrackerDate(date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return date;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))));
}

function dateTimeFromMinutes(date: string, minutes: number) {
  const safeMinutes = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function minuteOfDay(value: string) {
  const match = value.match(/T(\d{2}):(\d{2})/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

function verticalBlockStyle(
  startMinute: number,
  endMinute: number,
  range: CalendarRange,
  rowHeight: number,
  minHeight: number,
): CSSProperties {
  const metrics = verticalBlockMetrics(startMinute, endMinute, range, rowHeight, minHeight);

  return {
    top: metrics.top,
    minHeight: metrics.minHeight,
    height: metrics.height,
  };
}

function verticalBlockMetrics(
  startMinute: number,
  endMinute: number,
  range: CalendarRange,
  rowHeight: number,
  minHeight: number,
) {
  const visibleStart = Math.max(startMinute, range.startMinute);
  const visibleEnd = Math.min(endMinute, range.endMinute);
  const top = ((visibleStart - range.startMinute) / range.slotMinutes) * rowHeight;
  const exactHeight =
    ((visibleEnd - visibleStart) / range.slotMinutes) * rowHeight - CALENDAR_BLOCK_VERTICAL_GAP;
  const height = Math.max(CALENDAR_EVENT_MIN_RENDERED_HEIGHT, exactHeight);
  // Keep short back-to-back events inside their time slot; details move to hover.
  const cappedMinHeight = Math.min(minHeight, height);

  return {
    top,
    minHeight: cappedMinHeight,
    height: Math.max(height, cappedMinHeight),
  };
}

function calendarEventBlockStyle(
  layout: PackedCalendarLayout<CalendarEventItem>,
  range: CalendarRange,
  rowHeight: number,
): CSSProperties {
  const minHeight = calendarEventMinHeight(layout.item);
  const vertical = verticalBlockStyle(
    layout.visibleStartMinute,
    layout.visibleEndMinute,
    range,
    rowHeight,
    minHeight,
  );
  const gap = 6;
  const widthPercent = 100 / layout.overlapColumnCount;
  const columnGapOffset = (gap * layout.overlapColumn) / layout.overlapColumnCount;
  const widthGapOffset = (gap * (layout.overlapColumnCount - 1)) / layout.overlapColumnCount;
  return {
    ...vertical,
    left: `calc(${widthPercent * layout.overlapColumn}% + ${columnGapOffset}px)`,
    width: `calc(${widthPercent}% - ${widthGapOffset}px)`,
  };
}

function calendarEventStyleWithIcon(style: CSSProperties, renderedHeight: number): CSSProperties {
  const iconSize = Math.round(Math.max(10, Math.min(18, renderedHeight * 0.36)));
  const svgSize = Math.max(8, iconSize - 5);
  return {
    ...style,
    "--calendar-event-icon-size": `${iconSize}px`,
    "--calendar-event-icon-svg-size": `${svgSize}px`,
  } as CSSProperties;
}

function calendarIconOnlyTaskStyle(style: CSSProperties, renderedHeight: number): CSSProperties {
  const controlSize = Math.round(Math.max(12, Math.min(18, renderedHeight - 2)));
  const logoSize = Math.round(Math.max(10, Math.min(16, renderedHeight - 4)));
  const logoSvgSize = Math.max(8, logoSize - 4);
  return {
    ...style,
    "--calendar-icon-only-control-size": `${controlSize}px`,
    "--calendar-icon-only-logo-size": `${logoSize}px`,
    "--calendar-icon-only-logo-svg-size": `${logoSvgSize}px`,
  } as CSSProperties;
}

function calendarEventRenderedHeight(
  layout: CalendarLayoutItem<CalendarEventItem>,
  range: CalendarRange,
  rowHeight: number,
) {
  return verticalBlockMetrics(
    layout.visibleStartMinute,
    layout.visibleEndMinute,
    range,
    rowHeight,
    calendarEventMinHeight(layout.item),
  ).height;
}

function calendarEventMinHeight(item: CalendarEventItem) {
  if (item.type === "task") return CALENDAR_TASK_MIN_HEIGHT;
  if (item.type === "break") return CALENDAR_MEETING_MIN_HEIGHT;
  return CALENDAR_MEETING_MIN_HEIGHT;
}

function taskToLayoutItem(
  task: TaskRecord,
  range: CalendarRange,
): CalendarLayoutItem<CalendarTaskItem> | undefined {
  if (!task.scheduledStart || !task.scheduledEnd) return undefined;
  const startMinute = minuteOfDay(task.scheduledStart);
  const endMinute = Math.max(
    minuteOfDay(task.scheduledEnd),
    startMinute + CALENDAR_INTERACTION_MINUTES,
  );
  if (endMinute <= range.startMinute || startMinute >= range.endMinute) return undefined;
  return {
    id: `task:${task.id}`,
    item: { type: "task", task },
    startMinute,
    endMinute,
    visibleStartMinute: Math.max(startMinute, range.startMinute),
    visibleEndMinute: Math.min(endMinute, range.endMinute),
  };
}

function scheduledTaskMinutes(task: TaskRecord) {
  if (task.scheduledStart && task.scheduledEnd) {
    return Math.max(
      CALENDAR_INTERACTION_MINUTES,
      minuteOfDay(task.scheduledEnd) - minuteOfDay(task.scheduledStart),
    );
  }
  return task.estimateMinutes;
}

function meetingToLayoutItem(
  meeting: CalendarFile["meetings"][number],
  range: CalendarRange,
): CalendarLayoutItem<CalendarMeetingItem> | undefined {
  if (meeting.allDay || !intersectsRange(meeting.start, meeting.end, range)) return undefined;
  const startMinute = minuteOfDay(meeting.start);
  const endMinute = Math.max(minuteOfDay(meeting.end), startMinute + 15);
  return {
    id: `meeting:${meeting.id}`,
    item: { type: "meeting", meeting },
    startMinute,
    endMinute,
    visibleStartMinute: Math.max(startMinute, range.startMinute),
    visibleEndMinute: Math.min(endMinute, range.endMinute),
  };
}

function breakToLayoutItem(
  dayBreak: DayPlan["breaks"][number],
  range: CalendarRange,
): CalendarLayoutItem<CalendarBreakItem> | undefined {
  if (!intersectsRange(dayBreak.start, dayBreak.end, range)) return undefined;
  const startMinute = minuteOfDay(dayBreak.start);
  const endMinute = Math.max(minuteOfDay(dayBreak.end), startMinute + 5);
  return {
    id: `break:${dayBreak.id}`,
    item: { type: "break", dayBreak },
    startMinute,
    endMinute,
    visibleStartMinute: Math.max(startMinute, range.startMinute),
    visibleEndMinute: Math.min(endMinute, range.endMinute),
  };
}

function isMeetingLayout(
  layout: PackedCalendarLayout<CalendarEventItem>,
): layout is PackedCalendarLayout<CalendarMeetingItem> {
  return layout.item.type === "meeting";
}

function isTaskLayout(
  layout: PackedCalendarLayout<CalendarEventItem>,
): layout is PackedCalendarLayout<CalendarTaskItem> {
  return layout.item.type === "task";
}

function isBreakLayout(
  layout: PackedCalendarLayout<CalendarEventItem>,
): layout is PackedCalendarLayout<CalendarBreakItem> {
  return layout.item.type === "break";
}

function packCalendarOverlaps<T>(
  items: CalendarLayoutItem<T>[],
  collisionEndMinute: (item: CalendarLayoutItem<T>) => number = (item) => item.visibleEndMinute,
): PackedCalendarLayout<T>[] {
  const sorted = [...items].sort((a, b) => {
    if (a.visibleStartMinute !== b.visibleStartMinute) {
      return a.visibleStartMinute - b.visibleStartMinute;
    }
    if (a.visibleEndMinute !== b.visibleEndMinute) {
      return b.visibleEndMinute - a.visibleEndMinute;
    }
    return a.id.localeCompare(b.id);
  });
  const packed: PackedCalendarLayout<T>[] = [];
  let cluster: CalendarLayoutItem<T>[] = [];
  let clusterEnd = -1;

  function flushCluster() {
    if (cluster.length === 0) return;
    const activeColumns: Array<{ column: number; endMinute: number }> = [];
    const clusterPacked: PackedCalendarLayout<T>[] = [];
    let maxColumns = 0;

    for (const item of cluster) {
      for (let index = activeColumns.length - 1; index >= 0; index -= 1) {
        if (activeColumns[index].endMinute <= item.visibleStartMinute) {
          activeColumns.splice(index, 1);
        }
      }

      const usedColumns = new Set(activeColumns.map((active) => active.column));
      let column = 0;
      while (usedColumns.has(column)) {
        column += 1;
      }

      activeColumns.push({ column, endMinute: collisionEndMinute(item) });
      maxColumns = Math.max(maxColumns, column + 1);
      clusterPacked.push({
        ...item,
        overlapColumn: column,
        overlapColumnCount: 1,
      });
    }

    packed.push(
      ...clusterPacked.map((item) => ({
        ...item,
        overlapColumnCount: maxColumns,
      })),
    );
    cluster = [];
    clusterEnd = -1;
  }

  for (const item of sorted) {
    if (cluster.length > 0 && item.visibleStartMinute >= clusterEnd) {
      flushCluster();
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, collisionEndMinute(item));
  }
  flushCluster();

  return packed;
}

function intersectsRange(start: string, end: string, range: CalendarRange) {
  const startMinute = minuteOfDay(start);
  const endMinute = Math.max(minuteOfDay(end), startMinute + 15);
  return endMinute > range.startMinute && startMinute < range.endMinute;
}

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${suffix}`;
}

function formatDropSlotLabel(minute: number) {
  const nextMinute = minute + CALENDAR_INTERACTION_MINUTES;
  return `${formatCompactMinute(minute)}-${formatCompactMinute(nextMinute)}`;
}

function formatRange(start: string, end: string) {
  return `${formatCompactTime(start)}-${formatCompactTime(end)}`;
}

function calendarTaskHoverText(task: TaskRecord, minutes: number) {
  const taskTitle = task.title.trim() || "Scheduled task";
  const timeRange =
    task.scheduledStart && task.scheduledEnd
      ? formatRange(task.scheduledStart, task.scheduledEnd)
      : "Unscheduled";
  return `${taskTitle} · ${timeRange} · ${formatDurationMinutes(minutes)}`;
}

function formatDurationMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourLabel = hours === 1 ? "1 hr" : `${hours} hr`;
  return remainder ? `${hourLabel} ${remainder} min` : hourLabel;
}

function agentModelUiLabel(model: AgentModel) {
  return model.charAt(0).toUpperCase() + model.slice(1);
}

function formatAgentRunTime(run: AgentRun) {
  const date = new Date(run.launchedAt);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatCompactTime(value: string) {
  const minutes = minuteOfDay(value);
  return formatCompactMinute(minutes);
}

function formatCompactMinute(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "p" : "a";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${suffix}`;
}

function currentMinuteForDate(date: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${valueByType.year}-${valueByType.month}-${valueByType.day}`;

  if (today !== date) return undefined;
  return Number(valueByType.hour) * 60 + Number(valueByType.minute);
}

function readPreference<T extends string>(
  key: string,
  fallback: T,
  options: readonly { value: T }[],
) {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return options.some((option) => option.value === stored) ? (stored as T) : fallback;
  } catch {
    return fallback;
  }
}

function writePreference(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Non-critical preference persistence.
  }
}

function readBooleanPreference(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === "true") return true;
    if (stored === "false") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeBooleanPreference(key: string, value: boolean) {
  writePreference(key, value ? "true" : "false");
}

function defaultPromptSettings(): PromptSettings {
  return {
    schemaVersion: 1,
    promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    updatedAt: new Date().toISOString(),
  };
}

function promptSettingsPreviewValues() {
  const objectiveBody =
    "Improve task prompts so agents receive sufficient context before implementation.";
  const backgroundBody =
    "The user wants structured task fields instead of random generated ticket prose.";
  const sourcesBody = "- manual: User request";
  const constraintsBody = "Keep the prompt simple and generated from editable fields.";
  const doneWhenBody = "Ready tasks copy a complete work order; incomplete captures do not.";
  const verificationBody = "Run prompt tests and inspect the studio copy flow.";
  const estimateBody = "90 minutes, deep work.";

  return {
    title: "Review working-memory prompt quality",
    ticketBody: [
      "## Objective",
      "",
      objectiveBody,
      "",
      "## Background",
      "",
      backgroundBody,
      "",
      "## Sources",
      "",
      sourcesBody,
      "",
      "## Constraints / Non-goals",
      "",
      constraintsBody,
      "",
      "## Done When",
      "",
      doneWhenBody,
      "",
      "## Verification",
      "",
      verificationBody,
      "",
      "## Estimate",
      "",
      estimateBody,
    ].join("\n"),
    objectiveBody,
    backgroundBody,
    sourcesBody,
    constraintsBody,
    doneWhenBody,
    verificationBody,
    estimateBody,
    sources: "- manual: User request",
    kind: "focus",
    workDepth: "deep",
    estimateMinutes: "90",
    readinessWarnings: "",
    project: "working-memory-viewer",
  };
}

function defaultWorkDepthForKind(kind: TaskKind): WorkDepth {
  return kind === "focus" ? "deep" : "shallow";
}

function taskTicketFields(task: TaskRecord): TicketFields {
  return (
    (task as TaskRecord & { ticketFields?: TicketFields }).ticketFields || {
      objective: task.title || "",
      background: "",
      constraintsNonGoals: "",
      doneWhen: "",
      verification: "",
    }
  );
}

function createEmptyTaskDraft(): TaskCreationDraft {
  return {
    title: "",
    objective: "",
    background: "",
    sourcesOverride: "",
    constraintsNonGoals: "",
    doneWhen: "",
    verification: "",
    kind: "task",
    workDepth: "shallow",
    estimateMinutes: "30",
    sourceKind: "manual",
    sources: [{ label: "", url: "" }],
  };
}

function createEmptyTrackerDraft(date: string): TrackerCreationDraft {
  return {
    person: "",
    work: "",
    status: "waiting",
    originalAskDate: date,
    notes: "",
    sourceKind: "manual",
    sources: [{ label: "", url: "" }],
  };
}

function parseEstimateDraft(value: string, fallback: number) {
  if (!value.trim()) return normalizeEstimateMinutes(fallback);
  return normalizeEstimateMinutes(Number(value));
}

function normalizeEstimateMinutes(value: number) {
  if (!Number.isFinite(value)) return 30;
  return Math.max(
    5,
    Math.round(value / CALENDAR_INTERACTION_MINUTES) * CALENDAR_INTERACTION_MINUTES,
  );
}

function splitSubticketCount(minutes: number) {
  const safeMinutes = normalizeEstimateMinutes(minutes);
  return safeMinutes > 30 ? Math.ceil(safeMinutes / 30) : 0;
}

function taskSourceKind(task: TaskRecord): DisplaySourceKind {
  const sourceKind = task.sourceRefs.find((candidate) => isDisplaySourceKind(candidate.kind))?.kind;
  return sourceKind && isDisplaySourceKind(sourceKind) ? sourceKind : "manual";
}

function isDisplaySourceKind(kind: SourceKind): kind is DisplaySourceKind {
  return kind === "slack" || kind === "jira" || kind === "gmail" || kind === "manual";
}

function sourceKindLabel(kind: SourceKind) {
  if (isDisplaySourceKind(kind)) return SOURCE_KIND_META[kind].label;
  if (kind === "calendar") return "Calendar";
  if (kind === "meeting") return "Meeting";
  if (kind === "doc") return "Doc";
  return "Manual";
}

export function sourceRefsFromDraft(
  draft: Pick<TaskCreationDraft | TrackerCreationDraft, "sourceKind" | "sources">,
  fallbackLabel: string,
): SourceRef[] {
  const refs: SourceRef[] = [];
  for (const entry of draft.sources) {
    const label = entry.label.trim();
    const url = entry.url.trim();
    if (!label && !url) continue;
    const sourceRef: SourceRef = { kind: draft.sourceKind, label: label || fallbackLabel };
    if (url) sourceRef.url = url;
    refs.push(sourceRef);
  }
  // Preserve the legacy "no source captured -> one fallback ref" behavior.
  if (refs.length === 0) {
    return [{ kind: draft.sourceKind, label: fallbackLabel }];
  }
  return refs;
}

function taskTicketFieldsFromDraft(draft: TaskCreationDraft): TicketFields {
  return {
    objective: draft.objective.trim() || draft.title.trim(),
    background: draft.background.trim(),
    sourcesOverride: draft.sourcesOverride.trim() || undefined,
    constraintsNonGoals: draft.constraintsNonGoals.trim(),
    doneWhen: draft.doneWhen.trim(),
    verification: draft.verification.trim(),
  };
}

function trackerSourceLabel(tracker: TrackerRecord) {
  const sourceRef = tracker.sourceRefs[0];
  if (!sourceRef) return "";
  return sourceRef.label || sourceKindLabel(sourceRef.kind);
}

function formatCarryOverDays(days: number) {
  return `${days}-day carry over`;
}

function formatDayCount(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function taskCarryOverDays(task: TaskRecord, workDate: string) {
  return daysBetweenDateKeys(task.createdAt.slice(0, 10), workDate);
}

function daysBetweenDateKeys(startDate: string, endDate: string) {
  const createdOrdinal = dateOrdinal(startDate);
  const workOrdinal = dateOrdinal(endDate);
  if (createdOrdinal === undefined || workOrdinal === undefined) return 0;
  return Math.max(0, workOrdinal - createdOrdinal);
}

function dateOrdinal(date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / (24 * 60 * 60 * 1000);
}

function applyEstimateMinutes(task: TaskRecord, estimateMinutes: number, date: string): TaskRecord {
  const nextEstimate = normalizeEstimateMinutes(estimateMinutes);
  if (!task.scheduledStart) {
    return { ...task, estimateMinutes: nextEstimate };
  }
  const startMinute = minuteOfDay(task.scheduledStart);
  return {
    ...task,
    estimateMinutes: nextEstimate,
    scheduledEnd: dateTimeFromMinutes(date, startMinute + nextEstimate),
  };
}

function applyScheduledEnd(
  task: TaskRecord,
  endMinute: number,
  date: string,
  slotMinutes: number,
): TaskRecord {
  const startMinute = minuteOfDay(task.scheduledStart || dateTimeFromMinutes(date, endMinute - 30));
  const nextEndMinute = Math.max(startMinute + slotMinutes, endMinute);
  return {
    ...task,
    estimateMinutes: nextEndMinute - startMinute,
    scheduledEnd: dateTimeFromMinutes(date, nextEndMinute),
  };
}

function validateTaskDraft(draft: TaskCreationDraft) {
  const missing: string[] = [];
  if (!draft.title.trim()) missing.push("title");
  if (!draft.objective.trim()) missing.push("objective");
  if (!draft.doneWhen.trim()) missing.push("done when");
  if (!draft.estimateMinutes.trim()) missing.push("estimate");
  if (!draft.workDepth.trim()) missing.push("depth");
  if (draft.kind === "focus" || draft.workDepth === "deep") {
    if (!draft.background.trim()) missing.push("background");
    if (!draft.sources.some((entry) => entry.label.trim()) && !draft.sourcesOverride.trim())
      missing.push("source");
    if (!draft.constraintsNonGoals.trim()) missing.push("constraints/non-goals");
    if (!draft.verification.trim()) missing.push("verification");
  }
  return missing;
}

function validateTrackerDraft(draft: TrackerCreationDraft) {
  const missing: string[] = [];
  if (!draft.person.trim()) missing.push("person");
  if (!draft.work.trim()) missing.push("work");
  if (dateOrdinal(draft.originalAskDate) === undefined) missing.push("ask date");
  return missing;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);
}

function taskIdFromDragId(id: string) {
  if (id.startsWith("scheduled:")) return id.slice("scheduled:".length);
  if (id.startsWith("task:")) return id.slice("task:".length);
  return id;
}

function isTaskStatus(value: string): value is TaskStatus {
  return (STATUS_ORDER as readonly string[]).includes(value);
}

function createUniqueTaskId(date: string, title: string, tasks: TaskRecord[]) {
  return uniqueId(`wm-${date.replaceAll("-", "")}-${slugPart(title || "task")}`, tasks);
}

function createUniqueTrackerId(
  date: string,
  person: string,
  work: string,
  trackers: TrackerRecord[],
) {
  return uniqueId(
    `tracker-${date.replaceAll("-", "")}-${slugPart(person || "person")}-${slugPart(
      work || "work",
    )}`,
    trackers,
  );
}

function uniqueId(baseId: string, records: Array<{ id: string }>) {
  const existing = new Set(records.map((record) => record.id));
  if (!existing.has(baseId)) return baseId;
  let suffix = 2;
  while (existing.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

function slugPart(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42)
    .replace(/-+$/g, "");
  return slug || "item";
}
