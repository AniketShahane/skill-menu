import type { AgentReadiness, PromptSettings, TaskRecord, TicketFields } from "./types";

export const DEFAULT_PROMPT_TEMPLATE = [
  "## Objective",
  "",
  "{{objectiveBody}}",
  "",
  "## Background",
  "",
  "{{backgroundBody}}",
  "",
  "## Sources",
  "",
  "{{sourcesBody}}",
  "",
  "## Constraints / Non-goals",
  "",
  "{{constraintsBody}}",
  "",
  "## Done When",
  "",
  "{{doneWhenBody}}",
  "",
  "## Verification",
  "",
  "{{verificationBody}}",
  "",
  "## Estimate",
  "",
  "{{estimateBody}}",
  "",
  "## Source Links",
  "",
  "{{sources}}",
  "",
  "## Planning Metadata",
  "",
  "- Kind: {{kind}}",
  "- Work depth: {{workDepth}}",
  "- Estimate: {{estimateMinutes}} minutes",
  "- Project / area: {{project}}",
  "",
  "## Execution Guidance",
  "",
  "- Inspect relevant files or sources before editing.",
  "- Reuse existing patterns and keep changes scoped.",
  "- Do not revert unrelated user work.",
  "- Run the checks named above, or report exactly why they could not be run.",
  "- Ask only if blocked, destructive, security-sensitive, or success criteria are ambiguous.",
].join("\n");

const SUPPORTED_PLACEHOLDERS = new Set([
  "title",
  "ticketBody",
  "objectiveBody",
  "backgroundBody",
  "sourcesBody",
  "constraintsBody",
  "doneWhenBody",
  "verificationBody",
  "estimateBody",
  "sources",
  "kind",
  "workDepth",
  "estimateMinutes",
  "readinessWarnings",
  "project",
]);

const RISKY_TEXT_PATTERN =
  /\b(agent|api|backfill|bug|code|credential|data|database|delete|deploy|drop|fix|implementation|implement|legal|migration|payment|production|prod|refactor|release|remove|schema|secret|security|sql)\b/i;

export type PromptRenderResult = {
  text: string;
  readiness: AgentReadiness;
  warnings: string[];
};

export function buildAgentPrompt(
  task: TaskRecord,
  settings?: Pick<PromptSettings, "promptTemplate">,
) {
  return renderAgentPrompt(task, settings).text;
}

export function renderAgentPrompt(
  task: TaskRecord,
  settings?: Pick<PromptSettings, "promptTemplate">,
): PromptRenderResult {
  const taskReadiness = getTaskReadiness(task);
  const taskWarnings = getPromptWarnings(task);
  const rendered = renderPromptTemplate(
    settings?.promptTemplate || DEFAULT_PROMPT_TEMPLATE,
    promptValues(task),
  );
  const warnings = Array.from(new Set([...taskWarnings, ...rendered.warnings]));
  const readiness =
    taskReadiness === "incomplete" ? "incomplete" : warnings.length > 0 ? "warning" : "ready";
  const text =
    readiness === "warning"
      ? [
          "## Delegation Warning",
          "",
          "This task is not fully agent-ready. The agent may need to ask before acting.",
          "",
          ...warnings.map((warning) => `- ${warning}`),
          "",
          rendered.text,
        ].join("\n")
      : rendered.text;

  return {
    text,
    readiness,
    warnings,
  };
}

export function buildTicketBody(task: TaskRecord) {
  return [
    "## Objective",
    "",
    renderObjective(task),
    "",
    "## Background",
    "",
    renderBackground(task),
    "",
    "## Sources",
    "",
    renderSources(task),
    "",
    "## Constraints / Non-goals",
    "",
    renderConstraints(task),
    "",
    "## Done When",
    "",
    renderDoneWhen(task),
    "",
    "## Verification",
    "",
    renderVerification(task),
    "",
    "## Estimate",
    "",
    renderEstimate(task),
  ].join("\n");
}

export function buildCaptureSummary(task: TaskRecord) {
  return [
    "## Capture Summary",
    "",
    "This task is not ready for delegation yet.",
    "",
    `Title: ${task.title || "[missing: title]"}`,
    `Kind: ${task.kind}`,
    `Work depth: ${task.workDepth || "[missing: workDepth]"}`,
    `Estimate: ${task.estimateMinutes} minutes`,
    "",
    "## Current Ticket Fields",
    "",
    `Objective: ${getTicketFields(task).objective || "[missing: objective]"}`,
    "",
    getTicketFields(task).background
      ? `Background:\n${getTicketFields(task).background}`
      : "Background: [empty]",
    "",
    getTicketFields(task).sourcesOverride
      ? `Sources:\n${getTicketFields(task).sourcesOverride}`
      : `Sources:\n${renderSources(task)}`,
    "",
    getTicketFields(task).constraintsNonGoals
      ? `Constraints / non-goals:\n${getTicketFields(task).constraintsNonGoals}`
      : "Constraints / non-goals: [empty]",
    "",
    getTicketFields(task).doneWhen
      ? `Done when:\n${getTicketFields(task).doneWhen}`
      : "Done when: [missing: doneWhen]",
    "",
    getTicketFields(task).verification
      ? `Verification:\n${getTicketFields(task).verification}`
      : "Verification: [empty]",
    "",
    "## Known Warnings",
    "",
    ...getPromptWarnings(task).map((warning) => `- ${warning}`),
  ].join("\n");
}

export function getTaskReadiness(task: TaskRecord): AgentReadiness {
  const warnings = getPromptWarnings(task);
  if (warnings.some((warning) => warning.startsWith("missing objective"))) return "incomplete";
  if (warnings.some((warning) => warning.startsWith("missing done when"))) return "incomplete";
  return warnings.length === 0 ? "ready" : "warning";
}

export function getPromptWarnings(task: TaskRecord) {
  const warnings = new Set<string>();
  const fields = getTicketFields(task);
  const fullQualification = requiresFullQualification(task);

  if (!task.title.trim()) warnings.add("missing title");
  if (fieldMissing(fields.objective)) warnings.add("missing objective");
  if (fieldMissing(fields.doneWhen)) warnings.add("missing done when");
  if (!task.workDepth) warnings.add("missing work depth");
  if (!Number.isFinite(task.estimateMinutes) || task.estimateMinutes <= 0) {
    warnings.add("missing estimate");
  }

  if (fullQualification && fieldMissing(fields.background)) {
    warnings.add("missing background for deep or delegated work");
  }
  if (fullQualification && !hasUsefulSources(task)) {
    warnings.add("missing sources for deep or delegated work");
  }
  if (
    fullQualification &&
    fieldMissing(fields.constraintsNonGoals) &&
    !isExplicitNone(fields.constraintsNonGoals)
  ) {
    warnings.add("missing constraints / non-goals for deep or delegated work");
  }
  if (fullQualification && fieldMissing(fields.verification)) {
    warnings.add("missing verification for deep or delegated work");
  }
  if (findUnresolvedPlaceholders(buildTicketBody(task)).length > 0) {
    warnings.add("ticket fields have unresolved placeholders");
  }

  return Array.from(warnings);
}

export function validatePromptTemplate(template: string) {
  const warnings: string[] = [];
  const placeholders = extractPlaceholders(template);
  const unknown = placeholders.filter((placeholder) => !SUPPORTED_PLACEHOLDERS.has(placeholder));

  const hasTicketBody = placeholders.includes("ticketBody");
  const hasGranularCore =
    placeholders.includes("objectiveBody") && placeholders.includes("doneWhenBody");
  if (!hasTicketBody && !hasGranularCore) {
    warnings.push(
      "Template should include {{ticketBody}} (or {{objectiveBody}} and {{doneWhenBody}}) so the agent receives the qualified work order.",
    );
  }
  for (const placeholder of Array.from(new Set(unknown))) {
    warnings.push(`Unknown placeholder: {{${placeholder}}}`);
  }

  return warnings;
}

export function renderPromptTemplate(template: string, values: Record<string, string>) {
  const warnings = validatePromptTemplate(template);
  const text = template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key: string) => {
    const normalizedKey = key.trim();
    if (!SUPPORTED_PLACEHOLDERS.has(normalizedKey)) return match;
    const value = values[normalizedKey];
    if (value === undefined) return `[missing: ${normalizedKey}]`;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
    return normalizedKey === "readinessWarnings" ? "None" : `[missing: ${normalizedKey}]`;
  });

  return { text, warnings };
}

export function sourceLines(task: TaskRecord) {
  const lines = task.sourceRefs.map((source) =>
    source.url
      ? `- ${source.kind}: [${source.label}](${source.url})`
      : `- ${source.kind}: ${source.label}`,
  );
  return lines.length > 0 ? lines.join("\n") : "- No source links captured.";
}

export function requiresFullQualification(task: TaskRecord) {
  return (
    task.workDepth === "deep" ||
    task.kind === "focus" ||
    task.estimateMinutes >= 60 ||
    hasRiskyText(task)
  );
}

function promptValues(task: TaskRecord) {
  return {
    title: task.title,
    ticketBody: buildTicketBody(task),
    objectiveBody: renderObjective(task),
    backgroundBody: renderBackground(task),
    sourcesBody: renderSources(task),
    constraintsBody: renderConstraints(task),
    doneWhenBody: renderDoneWhen(task),
    verificationBody: renderVerification(task),
    estimateBody: renderEstimate(task),
    sources: sourceLines(task),
    kind: task.kind,
    workDepth: task.workDepth,
    estimateMinutes: String(task.estimateMinutes),
    readinessWarnings: renderReadinessWarnings(task),
    project: task.project || "None",
  };
}

function renderObjective(task: TaskRecord) {
  return getTicketFields(task).objective.trim() || "Unknown";
}

function renderDoneWhen(task: TaskRecord) {
  return getTicketFields(task).doneWhen.trim() || "Unknown";
}

function renderEstimate(task: TaskRecord) {
  return `${task.estimateMinutes} minutes, ${task.workDepth || "unknown"} work.`;
}

function renderBackground(task: TaskRecord) {
  return getTicketFields(task).background.trim() || "None needed";
}

function renderSources(task: TaskRecord) {
  const override = getTicketFields(task).sourcesOverride?.trim();
  if (override) return override;
  if (task.sourceRefs.length > 0) return sourceLines(task);
  return "None needed";
}

function renderConstraints(task: TaskRecord) {
  return getTicketFields(task).constraintsNonGoals.trim() || "None";
}

function renderVerification(task: TaskRecord) {
  return getTicketFields(task).verification.trim() || "None specified";
}

function hasUsefulSources(task: TaskRecord) {
  const override = getTicketFields(task).sourcesOverride?.trim();
  if (override && !isUnknownLike(override)) return true;
  return task.sourceRefs.length > 0;
}

function renderReadinessWarnings(task: TaskRecord) {
  const warnings = getPromptWarnings(task);
  return warnings.length > 0 ? warnings.map((warning) => `- ${warning}`).join("\n") : "None";
}

function getTicketFields(task: TaskRecord): TicketFields {
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

function hasRiskyText(task: TaskRecord) {
  const fields = getTicketFields(task);
  return RISKY_TEXT_PATTERN.test(
    [
      task.title,
      fields.objective,
      fields.background,
      fields.constraintsNonGoals,
      fields.doneWhen,
      fields.verification,
    ].join("\n"),
  );
}

function fieldMissing(value: string | undefined) {
  const text = value?.trim() || "";
  return !text || isUnknownLike(text);
}

function isUnknownLike(value: string) {
  return /^(unknown|\[missing:[^\]]+\])$/i.test(value.trim());
}

function isExplicitNone(value: string | undefined) {
  return /^(none|none needed|n\/a|not applicable)$/i.test(value?.trim() || "");
}

function findUnresolvedPlaceholders(value: string) {
  return value.match(/\{\{\s*[^}]+?\s*\}\}/g) || [];
}

function extractPlaceholders(template: string) {
  return Array.from(template.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)).map((match) => match[1].trim());
}
