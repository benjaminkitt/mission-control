import { readFileSync, existsSync } from "fs";
import path from "path";
import { logger } from "./logger";
import { fenceTaskData, enforcePromptLimit } from "./security";
import type { MissionsFile, MissionTaskEntry } from "./types";

// Paths relative to mission-control/
const DATA_DIR = path.resolve(__dirname, "../../data");
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");
const COMMANDS_DIR = path.join(WORKSPACE_ROOT, ".claude", "commands");

// ─── Data Types (lightweight, no import from src/) ───────────────────────────

interface AgentDef {
  id: string;
  name: string;
  description: string;
  instructions: string;
  capabilities: string[];
  skillIds: string[];
  status: string;
  profileId?: string | null;  // Assigned profile (null = use system default)
}

interface SkillDef {
  id: string;
  name: string;
  content: string;
  agentIds: string[];
}

interface TaskDef {
  id: string;
  title: string;
  description: string;
  importance: string;
  urgency: string;
  kanban: string;
  assignedTo: string | null;
  projectId: string | null;
  collaborators: string[];
  subtasks: Array<{ id: string; title: string; done: boolean }>;
  acceptanceCriteria: string[];
  notes: string;
  estimatedMinutes: number | null;
}

// ─── Data Reading ────────────────────────────────────────────────────────────

function readJSON<T>(filename: string): T {
  const filePath = path.join(DATA_DIR, filename);
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function getAgent(agentId: string): AgentDef | null {
  const data = readJSON<{ agents: AgentDef[] }>("agents.json");
  return data.agents.find(a => a.id === agentId) ?? null;
}

function getLinkedSkills(agent: AgentDef): SkillDef[] {
  const data = readJSON<{ skills: SkillDef[] }>("skills-library.json");
  const seen = new Set<string>();
  const result: SkillDef[] = [];

  for (const skill of data.skills) {
    const linkedByAgent = agent.skillIds.includes(skill.id);
    const linkedBySkill = skill.agentIds.includes(agent.id);
    if ((linkedByAgent || linkedBySkill) && !seen.has(skill.id)) {
      seen.add(skill.id);
      result.push(skill);
    }
  }

  return result;
}

// ─── Prompt Construction ─────────────────────────────────────────────────────

/**
 * Build a full agent persona prompt (mirrors generateAgentCommandMarkdown from sync-commands.ts)
 */
function buildAgentPersona(agent: AgentDef, skills: SkillDef[]): string {
  const lines: string[] = [];

  lines.push(`You are acting as a ${agent.name} — ${agent.description}.`);
  lines.push("");

  if (agent.instructions) {
    lines.push("## Your Instructions");
    lines.push(agent.instructions);
    lines.push("");
  }

  if (agent.capabilities.length > 0) {
    lines.push("## Your Capabilities");
    for (const cap of agent.capabilities) {
      lines.push(`- ${cap}`);
    }
    lines.push("");
  }

  if (skills.length > 0) {
    lines.push("## Your Skills");
    lines.push("");
    for (const skill of skills) {
      lines.push(`### ${skill.name}`);
      lines.push(skill.content);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Build the task-specific instructions section
 */
function buildTaskInstructions(task: TaskDef): string {
  const lines: string[] = [];

  lines.push(`## Your Current Task`);
  lines.push("");
  lines.push(`**Title:** ${task.title}`);
  lines.push(`**Task ID:** ${task.id}`);
  lines.push(`**Priority:** ${task.importance} / ${task.urgency}`);

  if (task.description) {
    lines.push("");
    lines.push("**Description:**");
    lines.push(task.description);
  }

  if (task.subtasks.length > 0) {
    lines.push("");
    lines.push("**Subtasks:**");
    for (const sub of task.subtasks) {
      lines.push(`- [${sub.done ? "x" : " "}] ${sub.title}`);
    }
  }

  if (task.acceptanceCriteria.length > 0) {
    lines.push("");
    lines.push("**Acceptance Criteria (Definition of Done):**");
    for (const criteria of task.acceptanceCriteria) {
      lines.push(`- ${criteria}`);
    }
  }

  if (task.notes) {
    lines.push("");
    lines.push("**Notes:**");
    lines.push(task.notes);
  }

  if (task.estimatedMinutes) {
    lines.push("");
    lines.push(`**Estimated time:** ${task.estimatedMinutes} minutes`);
  }

  return lines.join("\n");
}

/**
 * Build the standard operating procedures section
 */
function buildSOP(agentId: string, task: TaskDef): string {
  const lines = [
    "## Standard Operating Procedures",
    "",
    "You MUST follow these steps:",
    "1. Read `mission-control/data/ai-context.md` for current state",
    `2. Check inbox for messages addressed to you: filter \`to: "${agentId}"\``,
    "3. Execute the work described in the task",
    "4. When done, write a clear summary of what was accomplished, results, and any follow-up needed",
    "",
    "**IMPORTANT — Do NOT perform bookkeeping yourself.** The system automatically:",
    "- Marks the task as done in tasks.json",
    "- Posts your completion report to inbox.json (using your summary output)",
    "- Logs the activity event to activity-log.json",
    "- Regenerates ai-context.md",
    "",
    "Do NOT change the task's kanban status, completedAt, or other top-level fields.",
    "Do NOT write to inbox.json or activity-log.json.",
    "Do NOT run `pnpm gen:context`. Focus entirely on executing the task.",
  ];

  if (task.subtasks.length > 0) {
    lines.push("");
    lines.push("## Subtask Progress Tracking");
    lines.push("");
    lines.push("As you complete each subtask, update its `done` field to `true` in `mission-control/data/tasks.json`.");
    lines.push("This lets the dashboard show real-time progress to the user.");
    lines.push("");
    lines.push("To update a subtask:");
    lines.push("1. Read `mission-control/data/tasks.json`");
    lines.push(`2. Find the task with id \`${task.id}\``);
    lines.push("3. In its `subtasks` array, set `done: true` for the completed subtask");
    lines.push("4. Update the task's `updatedAt` to the current ISO timestamp");
    lines.push("5. Write the file back with 2-space indentation");
    lines.push("");
    lines.push("Do this IMMEDIATELY after completing each subtask, before moving to the next one.");
    lines.push("Only update `subtasks[].done` and `updatedAt` — do NOT change any other task fields.");
    lines.push("");
    lines.push("**THIS IS REQUIRED** — the user monitors progress in real-time through the dashboard.");
  }

  return lines.join("\n");
}

// ─── Restart & Retry Context ─────────────────────────────────────────────────

/**
 * Build context from previous mission history so the agent understands
 * what has already been accomplished in this mission run.
 */
function buildRestartContext(missionId: string): string | null {
  try {
    const filePath = path.join(DATA_DIR, "missions.json");
    if (!existsSync(filePath)) return null;

    const data = JSON.parse(readFileSync(filePath, "utf-8")) as MissionsFile;
    const mission = data.missions.find(m => m.id === missionId);
    if (!mission || mission.taskHistory.length === 0) return null;

    const lines: string[] = [
      "## Previous Mission Context",
      "",
      "This task is part of an ongoing mission. Here is what has happened so far:",
      "",
    ];

    // Group by status for clarity
    const completed = mission.taskHistory.filter(e => e.status === "completed");
    const failed = mission.taskHistory.filter(e => e.status !== "completed");

    if (completed.length > 0) {
      lines.push("**Completed tasks:**");
      for (const entry of completed) {
        lines.push(`- ✅ ${entry.taskTitle} (by ${entry.agentId}): ${entry.summary.slice(0, 150)}`);
      }
      lines.push("");
    }

    if (failed.length > 0) {
      lines.push("**Failed/timed-out tasks:**");
      for (const entry of failed) {
        lines.push(`- ❌ ${entry.taskTitle} (${entry.status}, attempt ${entry.attempt}): ${entry.summary.slice(0, 150)}`);
      }
      lines.push("");
    }

    lines.push(`**Mission progress:** ${mission.completedTasks} completed, ${mission.failedTasks} failed out of ${mission.totalTasks} total.`);
    lines.push("");
    lines.push("Use this context to avoid duplicating work that was already done and to build upon completed results.");

    return lines.join("\n");
  } catch (err) {
    logger.warn("prompt-builder", `Failed to build restart context for mission ${missionId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Build retry context when a task is being retried after a user decision.
 * Checks decisions.json for answered decisions related to this task and
 * injects the user's guidance into the prompt.
 */
function buildRetryContext(taskId: string): string | null {
  try {
    const filePath = path.join(DATA_DIR, "decisions.json");
    if (!existsSync(filePath)) return null;

    interface DecisionRecord {
      id: string;
      taskId: string | null;
      status: string;
      question: string;
      answer: string | null;
      context: string;
      answeredAt: string | null;
    }

    const data = JSON.parse(readFileSync(filePath, "utf-8")) as { decisions: DecisionRecord[] };

    // Find answered decisions for this task, sorted by most recent
    const answered = data.decisions
      .filter(d => d.taskId === taskId && d.status === "answered" && d.answer)
      .sort((a, b) => {
        const ta = a.answeredAt ? new Date(a.answeredAt).getTime() : 0;
        const tb = b.answeredAt ? new Date(b.answeredAt).getTime() : 0;
        return tb - ta;
      });

    if (answered.length === 0) return null;

    const latest = answered[0];
    const lines: string[] = [
      "## ⚠️ Retry Instructions — Read Carefully",
      "",
      "**This task has been attempted before and failed.** The user has reviewed the situation and provided guidance:",
      "",
      `**User's decision:** ${latest.answer}`,
      "",
    ];

    if (latest.context) {
      lines.push(`**Previous failure context:** ${latest.context.slice(0, 300)}`);
      lines.push("");
    }

    lines.push("You MUST take a DIFFERENT approach than what was tried before.");
    lines.push("Do NOT repeat the same steps that led to failure.");
    lines.push("If the user said to try a different approach, think creatively about alternative solutions.");

    return lines.join("\n");
  } catch (err) {
    logger.warn("prompt-builder", `Failed to build retry context for task ${taskId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the complete prompt for a task assignment.
 * Agent persona + fenced task data + SOP instructions.
 * If missionId is provided, injects restart context (mission history) and retry context (user decisions).
 */
export function buildTaskPrompt(agentId: string, task: TaskDef, missionId?: string): string {
  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const skills = getLinkedSkills(agent);
  const persona = buildAgentPersona(agent, skills);
  const taskInstructions = fenceTaskData(buildTaskInstructions(task));
  const sop = buildSOP(agentId, task);

  const sections: string[] = [persona];

  // Inject mission restart context (what has been done previously)
  if (missionId) {
    const restartCtx = buildRestartContext(missionId);
    if (restartCtx) sections.push(restartCtx);
  }

  // Inject retry context (user guidance from decisions)
  const retryCtx = buildRetryContext(task.id);
  if (retryCtx) sections.push(retryCtx);

  sections.push(taskInstructions, sop);

  const fullPrompt = sections.join("\n\n");
  return enforcePromptLimit(fullPrompt);
}

/**
 * Build a prompt for a scheduled command (daily-plan, standup, etc.).
 * Reads the command file from .claude/commands/<command>/user.md.
 */
export function buildScheduledPrompt(command: string): string {
  const cmdFile = path.join(COMMANDS_DIR, command, "user.md");

  if (existsSync(cmdFile)) {
    const content = readFileSync(cmdFile, "utf-8");
    return enforcePromptLimit(content);
  }

  // Fallback: generic prompt
  logger.warn("prompt-builder", `No command file found for /${command}, using generic prompt`);
  return `Run the /${command} workflow. Read mission-control/data/ai-context.md first for context.`;
}

/**
 * Read a task by ID from tasks.json
 */
export function getTask(taskId: string): TaskDef | null {
  const data = readJSON<{ tasks: TaskDef[] }>("tasks.json");
  return data.tasks.find(t => t.id === taskId) ?? null;
}

/**
 * Get all pending tasks sorted by Eisenhower priority
 */
export function getPendingTasks(): TaskDef[] {
  const data = readJSON<{ tasks: TaskDef[] }>("tasks.json");

  const pending = data.tasks.filter(t =>
    t.kanban === "not-started" &&
    t.assignedTo !== null &&
    t.assignedTo !== "me"
  );

  // Sort by Eisenhower quadrant: DO > SCHEDULE > DELEGATE > ELIMINATE
  const priorityMap: Record<string, number> = {
    "important-urgent": 0,
    "important-not-urgent": 1,
    "not-important-urgent": 2,
    "not-important-not-urgent": 3,
  };

  pending.sort((a, b) => {
    const pa = priorityMap[`${a.importance}-${a.urgency}`] ?? 3;
    const pb = priorityMap[`${b.importance}-${b.urgency}`] ?? 3;
    return pa - pb;
  });

  return pending;
}

/**
 * Check if a task is unblocked (all blockedBy tasks are done)
 */
export function isTaskUnblocked(task: TaskDef & { blockedBy: string[] }): boolean {
  if (!task.blockedBy || task.blockedBy.length === 0) return true;

  const allTasks = readJSON<{ tasks: Array<{ id: string; kanban: string }> }>("tasks.json");
  return task.blockedBy.every(blockerId => {
    const blocker = allTasks.tasks.find(t => t.id === blockerId);
    return blocker?.kanban === "done";
  });
}

/**
 * Check if a task has a pending decision that blocks execution
 */
export function hasPendingDecision(taskId: string): boolean {
  const decisions = readJSON<{ decisions: Array<{ taskId: string | null; status: string }> }>("decisions.json");
  return decisions.decisions.some(d => d.taskId === taskId && d.status === "pending");
}
