// ─── Daemon Configuration ────────────────────────────────────────────────────

export interface ScheduleEntry {
  enabled: boolean;
  cron: string;
  command: string;
}

export interface DaemonConfig {
  polling: {
    enabled: boolean;
    intervalMinutes: number;
  };
  concurrency: {
    maxParallelAgents: number;
  };
  schedule: Record<string, ScheduleEntry>;
  execution: {
    maxTurns: number;
    timeoutMinutes: number;
    retries: number;
    retryDelayMinutes: number;
    skipPermissions: boolean;
    allowedTools: string[];
    agentTeams: boolean;
    claudeBinaryPath: string | null;
  };
}

// ─── Agent Sessions ──────────────────────────────────────────────────────────

export type SessionStatus = "running" | "completed" | "failed" | "timeout";

export interface AgentSession {
  id: string;
  agentId: string;
  taskId: string | null;
  command: string;
  pid: number;
  startedAt: string;
  status: SessionStatus;
  retryCount: number;
}

export interface SessionHistoryEntry {
  id: string;
  agentId: string;
  taskId: string | null;
  command: string;
  pid: number;
  startedAt: string;
  completedAt: string;
  status: SessionStatus;
  exitCode: number | null;
  error: string | null;
  durationMinutes: number;
  retryCount: number;
}

// ─── Daemon Status ───────────────────────────────────────────────────────────

export type DaemonRunStatus = "running" | "stopped" | "starting";

export interface DaemonStats {
  tasksDispatched: number;
  tasksCompleted: number;
  tasksFailed: number;
  uptimeMinutes: number;
}

export interface DaemonStatus {
  status: DaemonRunStatus;
  pid: number | null;
  startedAt: string | null;
  activeSessions: AgentSession[];
  history: SessionHistoryEntry[];
  stats: DaemonStats;
  lastPollAt: string | null;
  nextScheduledRuns: Record<string, string>;
}

// ─── Runner Types ────────────────────────────────────────────────────────────

export interface SpawnOptions {
  prompt: string;
  maxTurns: number;
  timeoutMinutes: number;
  skipPermissions: boolean;
  allowedTools?: string[];
  agentTeams?: boolean;
  cwd: string;
}

export interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

// ─── Missions (continuous project execution) ─────────────────────────────────

export type MissionStatus = "running" | "completed" | "stopped" | "stalled";

export interface MissionTaskEntry {
  taskId: string;
  taskTitle: string;
  agentId: string;
  status: "completed" | "failed" | "timeout" | "stopped";
  startedAt: string;
  completedAt: string;
  summary: string;
  attempt: number;
}

export interface LoopDetectionState {
  taskAttempts: Record<string, number>;
  taskErrors: Record<string, string[]>;
}

export interface MissionRun {
  id: string;
  projectId: string;
  status: MissionStatus;
  startedAt: string;
  stoppedAt: string | null;
  completedAt: string | null;
  lastTaskCompletedAt: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
  taskHistory: MissionTaskEntry[];
  loopDetection: LoopDetectionState;
}

export interface MissionsFile {
  missions: MissionRun[];
}

// ─── Log Levels ──────────────────────────────────────────────────────────────

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "SECURITY";
