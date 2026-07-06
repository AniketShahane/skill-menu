const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

function envText(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getWorkspaceRoot(startDir = process.cwd()) {
  const configured = envText("WORKING_MEMORY_ROOT_DIR");
  if (configured) return configured;
  return startDir;
}

function getDataHome() {
  return envText("XDG_DATA_HOME") || `${process.env.HOME || process.cwd()}/.local/share`;
}

export function getDefaultWorkingMemoryDir() {
  return `${getDataHome()}/working-memory/Working Memory`;
}

export function getDefaultInteractiveMemoryDir() {
  return `${getDataHome()}/working-memory/Interactive Working Memory`;
}

export function getWorkingMemoryTimeZone() {
  return (
    envText("WORKING_MEMORY_TIMEZONE") || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
}

export function getAgentCwd() {
  return envText("WORKING_MEMORY_AGENT_CWD") || getWorkspaceRoot();
}

export function isDirectAgentDeployEnabled() {
  return TRUE_ENV_VALUES.has(envText("WORKING_MEMORY_ENABLE_DIRECT_DEPLOY")?.toLowerCase() || "");
}

export function getClaudeBin() {
  return envText("WORKING_MEMORY_CLAUDE_BIN") || "claude";
}
