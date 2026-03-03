import { z } from "zod";
import { NextResponse } from "next/server";

// ─── Shared enums ──────────────────────────────────────────────────────────────

const importanceEnum = z.enum(["important", "not-important"]);
const urgencyEnum = z.enum(["urgent", "not-urgent"]);
const kanbanEnum = z.enum(["not-started", "in-progress", "done"]);
const goalTypeEnum = z.enum(["long-term", "medium-term"]);
const goalStatusEnum = z.enum(["not-started", "in-progress", "completed"]);
const projectStatusEnum = z.enum(["active", "paused", "completed", "archived"]);
// Relaxed from fixed enum to string — validated against agent registry at runtime.
const agentRoleEnum = z.string().min(1).max(50);
const actorEnum = z.string().min(1).max(50);
const messageTypeEnum = z.enum(["delegation", "report", "question", "update", "approval"]);
const messageStatusEnum = z.enum(["unread", "read", "archived"]);
const decisionStatusEnum = z.enum(["pending", "answered"]);
const eventTypeEnum = z.enum([
  "task_created",
  "task_updated",
  "task_completed",
  "task_delegated",
  "task_failed",
  "message_sent",
  "decision_requested",
  "decision_answered",
  "brain_dump_triaged",
  "milestone_completed",
  "agent_checkin",
]);

// ─── Shared limits (exported for frontend validation) ──────────────────────────

/** Default max items returned by GET endpoints when no ?limit is specified */
export const DEFAULT_LIMIT = 200;

export const LIMITS = {
  TITLE: 200,
  DESCRIPTION: 5000,
  NOTES: 5000,
  BODY: 5000,
  CONTENT: 5000,
  CONTEXT: 5000,
  SUBJECT: 500,
  QUESTION: 500,
  ANSWER: 500,
  SUBTASK_TITLE: 500,
  COMMENT_CONTENT: 5000,
  TAG: 100,
  MAX_SUBTASKS: 100,
  MAX_DAILY_ACTIONS: 100,
  MAX_COMMENTS: 100,
  MAX_BLOCKED_BY: 50,
  MAX_CRITERIA: 50,
  MAX_TAGS: 50,
  MAX_MILESTONES: 50,
  MAX_TASKS: 50,
  MAX_OPTIONS: 20,
  MAX_MINUTES: 99999,
} as const;

// ─── Sub-schemas ───────────────────────────────────────────────────────────────

const dailyActionSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(LIMITS.SUBTASK_TITLE),
  done: z.boolean(),
  date: z.string().max(30),
});

const subtaskSchema = z.object({
  id: z.string().max(100),
  title: z.string().max(LIMITS.SUBTASK_TITLE),
  done: z.boolean(),
});

const commentSchema = z.object({
  id: z.string().max(100),
  author: actorEnum,
  content: z.string().max(LIMITS.COMMENT_CONTENT),
  createdAt: z.string().max(30),
});

// ─── Task schemas ──────────────────────────────────────────────────────────────

export const taskCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(LIMITS.TITLE, `Title must be under ${LIMITS.TITLE} characters`),
  description: z.string().max(LIMITS.DESCRIPTION).optional().default(""),
  importance: importanceEnum.optional().default("not-important"),
  urgency: urgencyEnum.optional().default("not-urgent"),
  kanban: kanbanEnum.optional().default("not-started"),
  projectId: z.string().nullable().optional().default(null),
  milestoneId: z.string().nullable().optional().default(null),
  assignedTo: agentRoleEnum.nullable().optional().default(null),
  collaborators: z.array(z.string().max(50)).max(20).optional().default([]),
  dailyActions: z.array(dailyActionSchema).max(LIMITS.MAX_DAILY_ACTIONS).optional().default([]),
  subtasks: z.array(subtaskSchema).max(LIMITS.MAX_SUBTASKS).optional().default([]),
  blockedBy: z.array(z.string()).max(LIMITS.MAX_BLOCKED_BY).optional().default([]),
  estimatedMinutes: z.number().min(0).max(LIMITS.MAX_MINUTES).nullable().optional().default(null),
  actualMinutes: z.number().min(0).max(LIMITS.MAX_MINUTES).nullable().optional().default(null),
  acceptanceCriteria: z.array(z.string().max(LIMITS.SUBTASK_TITLE)).max(LIMITS.MAX_CRITERIA).optional().default([]),
  comments: z.array(commentSchema).max(LIMITS.MAX_COMMENTS).optional().default([]),
  tags: z.array(z.string().max(LIMITS.TAG)).max(LIMITS.MAX_TAGS).optional().default([]),
  notes: z.string().max(LIMITS.NOTES).optional().default(""),
  dueDate: z.string().max(30).nullable().optional().default(null),
  deletedAt: z.string().nullable().optional().default(null),
});

export const taskUpdateSchema = z.object({
  id: z.string().min(1, "Task ID is required"),
  title: z.string().min(1).max(LIMITS.TITLE).optional(),
  description: z.string().max(LIMITS.DESCRIPTION).optional(),
  importance: importanceEnum.optional(),
  urgency: urgencyEnum.optional(),
  kanban: kanbanEnum.optional(),
  projectId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  assignedTo: agentRoleEnum.nullable().optional(),
  collaborators: z.array(z.string().max(50)).max(20).optional(),
  dailyActions: z.array(dailyActionSchema).max(LIMITS.MAX_DAILY_ACTIONS).optional(),
  subtasks: z.array(subtaskSchema).max(LIMITS.MAX_SUBTASKS).optional(),
  blockedBy: z.array(z.string()).max(LIMITS.MAX_BLOCKED_BY).optional(),
  estimatedMinutes: z.number().min(0).max(LIMITS.MAX_MINUTES).nullable().optional(),
  actualMinutes: z.number().min(0).max(LIMITS.MAX_MINUTES).nullable().optional(),
  acceptanceCriteria: z.array(z.string().max(LIMITS.SUBTASK_TITLE)).max(LIMITS.MAX_CRITERIA).optional(),
  comments: z.array(commentSchema).max(LIMITS.MAX_COMMENTS).optional(),
  tags: z.array(z.string().max(LIMITS.TAG)).max(LIMITS.MAX_TAGS).optional(),
  notes: z.string().max(LIMITS.NOTES).optional(),
  dueDate: z.string().max(30).nullable().optional(),
  deletedAt: z.string().nullable().optional(),
});

// ─── Goal schemas ──────────────────────────────────────────────────────────────

export const goalCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(LIMITS.TITLE),
  type: goalTypeEnum.optional().default("medium-term"),
  timeframe: z.string().max(100).optional().default(""),
  parentGoalId: z.string().nullable().optional().default(null),
  projectId: z.string().nullable().optional().default(null),
  status: goalStatusEnum.optional().default("not-started"),
  milestones: z.array(z.string()).max(LIMITS.MAX_MILESTONES).optional().default([]),
  tasks: z.array(z.string()).max(LIMITS.MAX_TASKS).optional().default([]),
  deletedAt: z.string().nullable().optional().default(null),
});

export const goalUpdateSchema = z.object({
  id: z.string().min(1, "Goal ID is required"),
  title: z.string().min(1).max(LIMITS.TITLE).optional(),
  type: goalTypeEnum.optional(),
  timeframe: z.string().max(100).optional(),
  parentGoalId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  status: goalStatusEnum.optional(),
  milestones: z.array(z.string()).max(LIMITS.MAX_MILESTONES).optional(),
  tasks: z.array(z.string()).max(LIMITS.MAX_TASKS).optional(),
  deletedAt: z.string().nullable().optional(),
});

// ─── Project schemas ───────────────────────────────────────────────────────────

export const projectCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(LIMITS.TITLE),
  description: z.string().max(LIMITS.DESCRIPTION).optional().default(""),
  status: projectStatusEnum.optional().default("active"),
  color: z.string().max(20).optional().default("#6B7280"),
  teamMembers: z.array(z.string().max(50)).max(20).optional().default([]),
  tags: z.array(z.string().max(LIMITS.TAG)).max(LIMITS.MAX_TAGS).optional().default([]),
  deletedAt: z.string().nullable().optional().default(null),
});

export const projectUpdateSchema = z.object({
  id: z.string().min(1, "Project ID is required"),
  name: z.string().min(1).max(LIMITS.TITLE).optional(),
  description: z.string().max(LIMITS.DESCRIPTION).optional(),
  status: projectStatusEnum.optional(),
  color: z.string().max(20).optional(),
  teamMembers: z.array(z.string().max(50)).max(20).optional(),
  tags: z.array(z.string().max(LIMITS.TAG)).max(LIMITS.MAX_TAGS).optional(),
  deletedAt: z.string().nullable().optional(),
});

// ─── Brain Dump schemas ────────────────────────────────────────────────────────

export const brainDumpCreateSchema = z.object({
  id: z.string().optional(),
  content: z.string().min(1, "Content is required").max(LIMITS.CONTENT),
  capturedAt: z.string().max(30).optional(),
  processed: z.boolean().optional().default(false),
  convertedTo: z.string().nullable().optional().default(null),
  tags: z.array(z.string().max(LIMITS.TAG)).max(LIMITS.MAX_TAGS).optional().default([]),
});

export const brainDumpUpdateSchema = z.object({
  id: z.string().min(1, "Entry ID is required"),
  content: z.string().min(1).max(LIMITS.CONTENT).optional(),
  processed: z.boolean().optional(),
  convertedTo: z.string().nullable().optional(),
  tags: z.array(z.string().max(LIMITS.TAG)).max(LIMITS.MAX_TAGS).optional(),
});

// ─── Inbox schemas ─────────────────────────────────────────────────────────────

export const inboxCreateSchema = z.object({
  id: z.string().optional(),
  from: actorEnum.optional().default("me"),
  to: agentRoleEnum,
  type: messageTypeEnum.optional().default("update"),
  taskId: z.string().nullable().optional().default(null),
  subject: z.string().min(1, "Subject is required").max(LIMITS.SUBJECT),
  body: z.string().max(LIMITS.BODY).optional().default(""),
  createdAt: z.string().max(30).optional(),
});

export const inboxUpdateSchema = z.object({
  id: z.string().min(1, "Message ID is required"),
  status: messageStatusEnum.optional(),
  readAt: z.string().max(30).nullable().optional(),
  from: actorEnum.optional(),
  to: agentRoleEnum.optional(),
  type: messageTypeEnum.optional(),
  taskId: z.string().nullable().optional(),
  subject: z.string().max(LIMITS.SUBJECT).optional(),
  body: z.string().max(LIMITS.BODY).optional(),
});

// ─── Decision schemas ──────────────────────────────────────────────────────────

export const decisionCreateSchema = z.object({
  id: z.string().optional(),
  requestedBy: actorEnum.optional().default("developer"),
  taskId: z.string().nullable().optional().default(null),
  question: z.string().min(1, "Question is required").max(LIMITS.QUESTION),
  options: z.array(z.string().max(LIMITS.ANSWER)).max(LIMITS.MAX_OPTIONS).optional().default([]),
  context: z.string().max(LIMITS.CONTEXT).optional().default(""),
  createdAt: z.string().max(30).optional(),
});

export const decisionUpdateSchema = z.object({
  id: z.string().min(1, "Decision ID is required"),
  status: decisionStatusEnum.optional(),
  answer: z.string().max(LIMITS.ANSWER).nullable().optional(),
  question: z.string().max(LIMITS.QUESTION).optional(),
  options: z.array(z.string().max(LIMITS.ANSWER)).max(LIMITS.MAX_OPTIONS).optional(),
  context: z.string().max(LIMITS.CONTEXT).optional(),
  requestedBy: actorEnum.optional(),
  taskId: z.string().nullable().optional(),
});

// ─── Activity Log schemas ──────────────────────────────────────────────────────

export const activityEventCreateSchema = z.object({
  id: z.string().optional(),
  type: eventTypeEnum,
  actor: actorEnum.optional().default("system"),
  taskId: z.string().nullable().optional().default(null),
  summary: z.string().min(1, "Summary is required").max(LIMITS.SUBJECT),
  details: z.string().max(LIMITS.DESCRIPTION).optional().default(""),
  timestamp: z.string().max(30).optional(),
});

// ─── Agent schemas ───────────────────────────────────────────────────────────

const agentStatusEnum = z.enum(["active", "inactive"]);

export const agentCreateSchema = z.object({
  id: z.string().min(1, "ID is required").max(50).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1, "Name is required").max(LIMITS.TITLE),
  icon: z.string().max(50).optional().default("Bot"),
  description: z.string().max(LIMITS.DESCRIPTION).optional().default(""),
  instructions: z.string().max(20000).optional().default(""),
  capabilities: z.array(z.string().max(100)).max(50).optional().default([]),
  skillIds: z.array(z.string().max(100)).max(50).optional().default([]),
  status: agentStatusEnum.optional().default("active"),
  profileId: z.string().max(50).nullable().optional().default(null),
});

export const agentUpdateSchema = z.object({
  id: z.string().min(1, "Agent ID is required"),
  name: z.string().min(1).max(LIMITS.TITLE).optional(),
  icon: z.string().max(50).optional(),
  description: z.string().max(LIMITS.DESCRIPTION).optional(),
  instructions: z.string().max(20000).optional(),
  capabilities: z.array(z.string().max(100)).max(50).optional(),
  skillIds: z.array(z.string().max(100)).max(50).optional(),
  status: agentStatusEnum.optional(),
  profileId: z.string().max(50).nullable().optional(),
});

// ─── Skill schemas ──────────────────────────────────────────────────────────

export const skillCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required").max(LIMITS.TITLE),
  description: z.string().max(LIMITS.DESCRIPTION).optional().default(""),
  content: z.string().max(50000).optional().default(""),
  agentIds: z.array(z.string().max(50)).max(20).optional().default([]),
  tags: z.array(z.string().max(LIMITS.TAG)).max(LIMITS.MAX_TAGS).optional().default([]),
});

export const skillUpdateSchema = z.object({
  id: z.string().min(1, "Skill ID is required"),
  name: z.string().min(1).max(LIMITS.TITLE).optional(),
  description: z.string().max(LIMITS.DESCRIPTION).optional(),
  content: z.string().max(50000).optional(),
  agentIds: z.array(z.string().max(50)).max(20).optional(),
  tags: z.array(z.string().max(LIMITS.TAG)).max(LIMITS.MAX_TAGS).optional(),
});

// ─── Profile schemas ──────────────────────────────────────────────────────────

const profileSchema = z.object({
  id: z.string().min(1, "Profile ID is required").max(50).regex(/^[a-z0-9-]+$/, "Profile ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1, "Name is required").max(LIMITS.TITLE),
  description: z.string().max(LIMITS.DESCRIPTION).optional(),
  env: z.record(z.string(), z.string()),
});

export const profileCreateSchema = profileSchema;

export const profileUpdateSchema = z.object({
  id: z.string().min(1, "Profile ID is required"),
  name: z.string().min(1).max(LIMITS.TITLE).optional(),
  description: z.string().max(LIMITS.DESCRIPTION).nullable().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

// ─── Daemon Config schemas ─────────────────────────────────────────────────────

const scheduleEntrySchema = z.object({
  enabled: z.boolean(),
  cron: z.string().min(1).max(200),
  command: z.string().min(1).max(100).regex(
    /^[a-z0-9-]+$/,
    "Command must be lowercase alphanumeric with hyphens"
  ),
});

export const daemonConfigUpdateSchema = z.object({
  polling: z.object({
    enabled: z.boolean(),
    intervalMinutes: z.number().int().min(1).max(60),
  }).optional(),
  concurrency: z.object({
    maxParallelAgents: z.number().int().min(1).max(10),
  }).optional(),
  schedule: z.record(
    z.string().max(50),
    scheduleEntrySchema
  ).optional(),
  execution: z.object({
    maxTurns: z.number().int().min(1).max(100),
    timeoutMinutes: z.number().int().min(1).max(120),
    retries: z.number().int().min(0).max(5),
    retryDelayMinutes: z.number().int().min(1).max(30),
    skipPermissions: z.boolean(),
    allowedTools: z.array(z.string().min(1).max(100)).max(50),
    agentTeams: z.boolean(),
    claudeBinaryPath: z.string().nullable(),
    maxTaskContinuations: z.number().int().min(0).max(5).optional(),
  }).optional(),
  inbox: z.object({
    maxContinuations: z.number().int().min(0).max(5),
    maxTurnsPerSession: z.number().int().min(5).max(100),
    timeoutPerSessionMinutes: z.number().int().min(5).max(60),
  }).optional(),
  profiles: z.object({
    definitions: z.array(profileSchema).min(1, "At least one profile is required"),
    defaultProfileId: z.string().min(1, "Default profile ID is required"),
  }).optional(),
}).strict();

// ─── Validation helper ─────────────────────────────────────────────────────────

type ValidationSuccess<T> = { success: true; data: T };
type ValidationFailure = { success: false; error: NextResponse };
type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export async function validateBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<ValidationResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      error: NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      ),
    };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const fieldErrors = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return {
      success: false,
      error: NextResponse.json(
        { error: "Validation failed", details: fieldErrors },
        { status: 400 }
      ),
    };
  }

  return { success: true, data: result.data };
}
