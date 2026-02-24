/**
 * run-inbox-respond.ts — Standalone script to generate an AI agent response to an inbox message.
 *
 * Usage:
 *   node --import tsx scripts/daemon/run-inbox-respond.ts <messageId>
 *
 * This script:
 *   1. Reads the message from inbox.json
 *   2. Loads the recipient agent's persona from agents.json
 *   3. Builds a prompt for the agent to compose a reply
 *   4. Spawns Claude Code to generate the response
 *   5. Posts the reply back to inbox.json via the API
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { AgentRunner } from "./runner";
import { loadConfig } from "./config";
import { logger } from "./logger";

// ─── Paths ──────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, "../../data");
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");

// ─── Data Types ─────────────────────────────────────────────────────────────

interface InboxMessage {
  id: string;
  from: string;
  to: string;
  type: string;
  taskId: string | null;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
  readAt: string | null;
}

interface AgentDef {
  id: string;
  name: string;
  description: string;
  instructions: string;
  capabilities: string[];
  skillIds: string[];
  status: string;
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
  kanban: string;
}

// ─── Data Reading ───────────────────────────────────────────────────────────

function readJSON<T>(filename: string): T | null {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function getAgent(agentId: string): AgentDef | null {
  const data = readJSON<{ agents: AgentDef[] }>("agents.json");
  return data?.agents.find((a) => a.id === agentId) ?? null;
}

function getLinkedSkills(agent: AgentDef): SkillDef[] {
  const data = readJSON<{ skills: SkillDef[] }>("skills-library.json");
  if (!data) return [];

  const result: SkillDef[] = [];
  const seen = new Set<string>();

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

function getMessage(messageId: string): InboxMessage | null {
  const data = readJSON<{ messages: InboxMessage[] }>("inbox.json");
  return data?.messages.find((m) => m.id === messageId) ?? null;
}

/** Get the conversation thread for a message (by subject thread + taskId). */
function getConversationThread(message: InboxMessage): InboxMessage[] {
  const data = readJSON<{ messages: InboxMessage[] }>("inbox.json");
  if (!data) return [];

  // Normalize subject: strip leading "Re: " prefixes for matching
  const normalize = (s: string) => s.replace(/^(Re:\s*)+/i, "").trim().toLowerCase();
  const baseSubject = normalize(message.subject);

  const thread = data.messages.filter((m) => {
    // Don't include the current message itself
    if (m.id === message.id) return false;
    // Match by subject thread
    if (normalize(m.subject) === baseSubject) return true;
    // Also match by taskId if present
    if (message.taskId && m.taskId === message.taskId) return true;
    return false;
  });

  // Sort oldest first (chronological)
  thread.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  // Cap to last 20 messages to keep prompt size reasonable
  return thread.slice(-20);
}

// ─── Prompt Construction ────────────────────────────────────────────────────

function buildRespondPrompt(agent: AgentDef, message: InboxMessage): string {
  const skills = getLinkedSkills(agent);
  const lines: string[] = [];

  // Agent persona
  lines.push(`You are acting as ${agent.name} — ${agent.description}.`);
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
    for (const skill of skills) {
      lines.push(`### ${skill.name}`);
      lines.push(skill.content);
      lines.push("");
    }
  }

  // Conversation thread for context
  const thread = getConversationThread(message);
  if (thread.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## Conversation History");
    lines.push("");
    for (let i = 0; i < thread.length; i++) {
      const m = thread[i];
      const time = new Date(m.createdAt).toLocaleString();
      lines.push(`**[${i + 1}] ${m.from} → ${m.to}** (${time}) — *${m.type}*`);
      lines.push(`Subject: ${m.subject}`);
      lines.push(m.body || "(no content)");
      lines.push("");
    }
  }

  // Current message to respond to
  lines.push("---");
  lines.push("");
  lines.push("## Message You Need to Reply To");
  lines.push("");
  lines.push(`**From:** ${message.from}`);
  lines.push(`**Type:** ${message.type}`);
  lines.push(`**Subject:** ${message.subject}`);
  lines.push("");
  lines.push("**Message:**");
  lines.push(message.body || "(no content)");
  lines.push("");

  // Task context if linked
  if (message.taskId) {
    const tasksData = readJSON<{ tasks: TaskDef[] }>("tasks.json");
    const task = tasksData?.tasks.find((t) => t.id === message.taskId);
    if (task) {
      lines.push("**Linked Task:**");
      lines.push(`- Title: ${task.title}`);
      lines.push(`- Description: ${task.description}`);
      lines.push(`- Status: ${task.kanban}`);
      lines.push("");
    }
  }

  // Instructions for the agent
  lines.push("---");
  lines.push("");
  lines.push("## Your Task");
  lines.push("");
  lines.push("Read the message above carefully.");
  lines.push("");
  lines.push("**If the message asks you to take action** (create tasks, do research, update data, write code, etc.):");
  lines.push("1. Perform the requested work first — read files, create/update data in `mission-control/data/`, etc.");
  lines.push("2. Then compose a reply summarizing what you did and any results");
  lines.push("");
  lines.push("**If the message is informational or a question:**");
  lines.push("1. Provide your professional perspective based on your role and capabilities");
  lines.push("2. Include any actionable suggestions or next steps");
  lines.push("");
  lines.push("Keep your reply concise but thorough.");
  lines.push("");
  lines.push("After composing your reply, write it to the inbox by modifying `mission-control/data/inbox.json`.");
  lines.push("Add a new message entry with these fields:");
  lines.push(`- id: "msg_${Date.now() + 1000}" (or use Date.now() in your code)`);
  lines.push(`- from: "${agent.id}"`);
  lines.push(`- to: "${message.from}"`);
  lines.push(`- type: "update"`);
  lines.push(`- taskId: ${message.taskId ? `"${message.taskId}"` : "null"}`);
  lines.push(`- subject: "${message.subject.startsWith("Re: ") ? message.subject : `Re: ${message.subject}`}"`);
  lines.push("- body: <your reply content>");
  lines.push(`- status: "unread"`);
  lines.push(`- createdAt: <current ISO timestamp>`);
  lines.push(`- readAt: null`);
  lines.push("");
  lines.push("Read the current inbox.json first, add your message to the messages array, then write it back.");
  lines.push("Use 2-space JSON indentation. Do NOT delete or modify existing messages.");
  lines.push("");
  lines.push("**IMPORTANT**: Writing your reply to inbox.json is your most critical task.");
  lines.push("Always ensure a reply is posted, even if you couldn't complete all requested work.");
  lines.push("A partial update is better than no reply.");

  return lines.join("\n");
}

// ─── Post-Completion Side Effects ───────────────────────────────────────────

const INBOX_FILE = path.join(DATA_DIR, "inbox.json");
const ACTIVITY_LOG_FILE = path.join(DATA_DIR, "activity-log.json");

/**
 * Extract a human-readable summary from Claude Code's stdout.
 * Parses Claude Code JSON output (--output-format json) and handles error subtypes.
 * Falls back to raw text only if stdout isn't JSON, rejecting raw JSON blobs.
 */
function extractSummary(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;

    // Successful result with content
    if (typeof parsed.result === "string" && parsed.result.length > 0) {
      return parsed.result.slice(0, 1000);
    }

    // Handle known error subtypes with human-readable messages
    if (parsed.type === "result") {
      if (parsed.subtype === "error_max_turns") {
        return "I ran out of processing turns before I could finish. You can retry with a more focused request, or break the task into smaller steps.";
      }
      if (parsed.subtype === "error_timeout") {
        return "I timed out before completing the task. Consider breaking it into smaller, more targeted requests.";
      }
      if (parsed.is_error) {
        return "I encountered an error while processing your message. Please try again or rephrase your request.";
      }
      // Successful but no result text
      return "(Completed but produced no summary)";
    }
  } catch {
    // Not JSON — fall through to raw text
  }

  // Fallback: last 10 lines of raw text, but reject raw JSON blobs
  const trimmed = stdout.trim();
  if (!trimmed) return "(no output)";
  const lines = trimmed.split("\n");
  const tail = lines.slice(-10).join("\n");
  if (tail.startsWith("{") || tail.startsWith("[")) {
    return "(Agent session ended without producing a readable reply)";
  }
  if (tail.length > 500) return tail.slice(0, 497) + "...";
  return tail;
}

/**
 * Ensure a reply was posted to inbox.json after the agent session completes.
 * If the agent already wrote its reply (as instructed in the prompt), this is a no-op.
 * If not, extract a summary from stdout and post a fallback reply.
 * Also logs an activity event.
 */
function ensureReplyPosted(agent: AgentDef, originalMessage: InboxMessage, stdout: string, timedOut: boolean): void {
  const now = new Date().toISOString();
  const originalTime = new Date(originalMessage.createdAt).getTime();

  // 1. Check if the agent already wrote a reply
  try {
    const inboxRaw = existsSync(INBOX_FILE)
      ? readFileSync(INBOX_FILE, "utf-8")
      : '{"messages":[]}';
    const inboxData = JSON.parse(inboxRaw) as { messages: InboxMessage[] };

    const agentReplied = inboxData.messages.some((m) =>
      m.from === agent.id &&
      m.to === originalMessage.from &&
      new Date(m.createdAt).getTime() > originalTime
    );

    if (!agentReplied) {
      // Agent didn't write a reply — post a fallback
      let summary: string;
      if (timedOut && !stdout.trim()) {
        // Process was killed on timeout — stdout is empty because Claude Code writes JSON at exit
        summary = "I was working on your request but ran out of time before finishing. "
          + "Any work I completed may already be saved in the data files. "
          + "You can retry with a more focused request, or break it into smaller steps.";
      } else {
        summary = extractSummary(stdout);
      }
      const replySubject = originalMessage.subject.startsWith("Re: ")
        ? originalMessage.subject
        : `Re: ${originalMessage.subject}`;

      inboxData.messages.push({
        id: `msg_${Date.now()}`,
        from: agent.id,
        to: originalMessage.from,
        type: "update",
        taskId: originalMessage.taskId,
        subject: replySubject,
        body: summary,
        status: "unread",
        createdAt: now,
        readAt: null,
      });

      writeFileSync(INBOX_FILE, JSON.stringify(inboxData, null, 2), "utf-8");
      logger.info("inbox-respond", `Posted fallback reply for agent ${agent.id}`);
    } else {
      logger.info("inbox-respond", `Agent ${agent.id} already wrote its reply`);
    }
  } catch (err) {
    logger.error("inbox-respond", `Failed to ensure reply posted: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Log activity event
  try {
    const logRaw = existsSync(ACTIVITY_LOG_FILE)
      ? readFileSync(ACTIVITY_LOG_FILE, "utf-8")
      : '{"events":[]}';
    const logData = JSON.parse(logRaw) as { events: Array<Record<string, unknown>> };

    logData.events.push({
      id: `evt_${Date.now()}`,
      type: "message_sent",
      actor: agent.id,
      taskId: originalMessage.taskId,
      summary: `${agent.name} replied to inbox message`,
      details: `Replied to: "${originalMessage.subject}" from ${originalMessage.from}`,
      timestamp: now,
    });

    writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(logData, null, 2), "utf-8");
  } catch (err) {
    logger.error("inbox-respond", `Failed to log activity: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── CLI Argument Parsing ───────────────────────────────────────────────────

function parseArgs(): { messageId: string } {
  const messageId = process.argv[2];

  if (!messageId) {
    console.error("Usage: run-inbox-respond.ts <messageId>");
    process.exit(1);
  }

  return { messageId };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { messageId } = parseArgs();

  logger.info("inbox-respond", `Starting auto-respond for message ${messageId}`);

  // 1. Read message
  const message = getMessage(messageId);
  if (!message) {
    logger.error("inbox-respond", `Message not found: ${messageId}`);
    process.exit(1);
  }

  // 2. Get the recipient agent
  const agent = getAgent(message.to);
  if (!agent) {
    logger.error("inbox-respond", `Agent not found: ${message.to}`);
    process.exit(1);
  }

  // 3. Load execution config
  const config = loadConfig();
  const { maxTurns, timeoutMinutes, skipPermissions, allowedTools } = config.execution;

  // 4. Build prompt
  const prompt = buildRespondPrompt(agent, message);

  // 5. Spawn Claude Code
  const runner = new AgentRunner(WORKSPACE_ROOT);
  try {
    const result = await runner.spawnAgent({
      prompt,
      maxTurns: Math.min(maxTurns, 25), // Cap at 25 turns for message responses
      timeoutMinutes: Math.min(timeoutMinutes, 15), // Cap at 15 minutes
      skipPermissions,
      allowedTools,
      cwd: WORKSPACE_ROOT,
    });

    // Always ensure a reply is posted — even on failure, the user should see a response
    ensureReplyPosted(agent, message, result.stdout, result.timedOut);

    if (result.exitCode === 0) {
      logger.info("inbox-respond", `Auto-respond completed for message ${messageId} (agent: ${agent.id})`);
    } else {
      logger.error(
        "inbox-respond",
        `Auto-respond failed for message ${messageId}: exit code ${result.exitCode}`
      );
    }
  } catch (err) {
    logger.error(
      "inbox-respond",
      `Auto-respond error for message ${messageId}: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error("inbox-respond", `Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
