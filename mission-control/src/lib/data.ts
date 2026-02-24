import { readFile, writeFile, readdir, unlink, mkdir } from "fs/promises";
import path from "path";
import { Mutex } from "async-mutex";
import type {
  TasksFile,
  GoalsFile,
  ProjectsFile,
  BrainDumpFile,
  ActivityLogFile,
  InboxFile,
  DecisionsFile,
  AgentsFile,
  SkillsLibraryFile,
  ActiveRunsFile,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CHECKPOINTS_DIR = path.join(DATA_DIR, "checkpoints");

function filePath(name: string): string {
  return path.join(DATA_DIR, name);
}

export function getCheckpointsDir(): string {
  return CHECKPOINTS_DIR;
}

export async function ensureCheckpointsDir(): Promise<void> {
  await mkdir(CHECKPOINTS_DIR, { recursive: true });
}

// ─── Checkpoint metadata type ────────────────────────────────────────────────

export interface CheckpointMeta {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  version: number;
  stats: {
    tasks: number;
    projects: number;
    goals: number;
    brainDump: number;
    inbox: number;
    decisions: number;
    agents: number;
    skills: number;
  };
}

export interface CheckpointFile {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  version: number;
  data: {
    tasks: TasksFile;
    goals: GoalsFile;
    projects: ProjectsFile;
    brainDump: BrainDumpFile;
    inbox: InboxFile;
    decisions: DecisionsFile;
    agents: AgentsFile;
    skillsLibrary: SkillsLibraryFile;
  };
}

// ─── Bulk checkpoint helpers ─────────────────────────────────────────────────

export async function getAllCoreData(): Promise<CheckpointFile["data"]> {
  const [tasks, goals, projects, brainDump, inbox, decisions, agents, skillsLibrary] =
    await Promise.all([
      getTasks(),
      getGoals(),
      getProjects(),
      getBrainDump(),
      getInbox(),
      getDecisions(),
      getAgents(),
      getSkillsLibrary(),
    ]);
  return { tasks, goals, projects, brainDump, inbox, decisions, agents, skillsLibrary };
}

export async function loadCoreData(data: CheckpointFile["data"]): Promise<void> {
  // Write sequentially to avoid overwhelming mutexes
  await saveTasks(data.tasks);
  await saveGoals(data.goals);
  await saveProjects(data.projects);
  await saveBrainDump(data.brainDump);
  await saveInbox(data.inbox);
  await saveDecisions(data.decisions);
  await saveAgents(data.agents);
  await saveSkillsLibrary(data.skillsLibrary);
  // Reset activity log to empty
  await saveActivityLog({ events: [] });
}

// ─── Checkpoint CRUD helpers ─────────────────────────────────────────────────

export async function listCheckpoints(): Promise<CheckpointMeta[]> {
  await ensureCheckpointsDir();
  const files = await readdir(CHECKPOINTS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const metas: CheckpointMeta[] = [];
  for (const file of jsonFiles) {
    try {
      const raw = await readFile(path.join(CHECKPOINTS_DIR, file), "utf-8");
      const snap = JSON.parse(raw) as CheckpointFile;
      metas.push({
        id: snap.id,
        name: snap.name,
        description: snap.description,
        createdAt: snap.createdAt,
        version: snap.version,
        stats: {
          tasks: snap.data.tasks.tasks.length,
          projects: snap.data.projects.projects.length,
          goals: snap.data.goals.goals.length,
          brainDump: snap.data.brainDump.entries.length,
          inbox: snap.data.inbox.messages.length,
          decisions: snap.data.decisions.decisions.length,
          agents: snap.data.agents.agents.length,
          skills: snap.data.skillsLibrary.skills.length,
        },
      });
    } catch {
      // Skip malformed checkpoint files
    }
  }
  return metas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getCheckpoint(id: string): Promise<CheckpointFile> {
  const raw = await readFile(path.join(CHECKPOINTS_DIR, `${id}.json`), "utf-8");
  return JSON.parse(raw) as CheckpointFile;
}

export async function saveCheckpoint(snap: CheckpointFile): Promise<void> {
  await ensureCheckpointsDir();
  await writeFile(path.join(CHECKPOINTS_DIR, `${snap.id}.json`), JSON.stringify(snap, null, 2), "utf-8");
}

export async function deleteCheckpoint(id: string): Promise<void> {
  await unlink(path.join(CHECKPOINTS_DIR, `${id}.json`));
}

// ─── Internal write helper (no mutex — caller must hold the lock) ────────────

async function _writeJson(name: string, data: unknown): Promise<void> {
  await writeFile(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}

// ─── Per-file mutexes for concurrent write safety ─────────────────────────────

const fileMutexes = {
  tasks: new Mutex(),
  tasksArchive: new Mutex(),
  goals: new Mutex(),
  projects: new Mutex(),
  brainDump: new Mutex(),
  activityLog: new Mutex(),
  inbox: new Mutex(),
  decisions: new Mutex(),
  agents: new Mutex(),
  skillsLibrary: new Mutex(),
  activeRuns: new Mutex(),
  daemonConfig: new Mutex(),
};

// ─── Read functions (no locking needed — reads are safe) ──────────────────────

export async function getTasks(): Promise<TasksFile> {
  const raw = await readFile(filePath("tasks.json"), "utf-8");
  return JSON.parse(raw) as TasksFile;
}

export async function getTasksArchive(): Promise<TasksFile> {
  try {
    const raw = await readFile(filePath("tasks-archive.json"), "utf-8");
    return JSON.parse(raw) as TasksFile;
  } catch {
    return { tasks: [] };
  }
}

export async function getGoals(): Promise<GoalsFile> {
  const raw = await readFile(filePath("goals.json"), "utf-8");
  return JSON.parse(raw) as GoalsFile;
}

export async function getProjects(): Promise<ProjectsFile> {
  const raw = await readFile(filePath("projects.json"), "utf-8");
  return JSON.parse(raw) as ProjectsFile;
}

export async function getBrainDump(): Promise<BrainDumpFile> {
  const raw = await readFile(filePath("brain-dump.json"), "utf-8");
  return JSON.parse(raw) as BrainDumpFile;
}

export async function getActivityLog(): Promise<ActivityLogFile> {
  const raw = await readFile(filePath("activity-log.json"), "utf-8");
  return JSON.parse(raw) as ActivityLogFile;
}

export async function getInbox(): Promise<InboxFile> {
  const raw = await readFile(filePath("inbox.json"), "utf-8");
  return JSON.parse(raw) as InboxFile;
}

export async function getDecisions(): Promise<DecisionsFile> {
  const raw = await readFile(filePath("decisions.json"), "utf-8");
  return JSON.parse(raw) as DecisionsFile;
}

export async function getAgents(): Promise<AgentsFile> {
  try {
    const raw = await readFile(filePath("agents.json"), "utf-8");
    return JSON.parse(raw) as AgentsFile;
  } catch {
    return { agents: [] };
  }
}

export async function getSkillsLibrary(): Promise<SkillsLibraryFile> {
  try {
    const raw = await readFile(filePath("skills-library.json"), "utf-8");
    return JSON.parse(raw) as SkillsLibraryFile;
  } catch {
    return { skills: [] };
  }
}

export async function getActiveRuns(): Promise<ActiveRunsFile> {
  try {
    const raw = await readFile(filePath("active-runs.json"), "utf-8");
    return JSON.parse(raw) as ActiveRunsFile;
  } catch {
    return { runs: [] };
  }
}

export async function getDaemonConfig(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(filePath("daemon-config.json"), "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ─── Save functions (mutex-protected to prevent concurrent write corruption) ──

export async function saveTasks(data: TasksFile): Promise<void> {
  await fileMutexes.tasks.runExclusive(async () => {
    await _writeJson("tasks.json", data);
  });
}

export async function saveTasksArchive(data: TasksFile): Promise<void> {
  await fileMutexes.tasksArchive.runExclusive(async () => {
    await _writeJson("tasks-archive.json", data);
  });
}

export async function saveGoals(data: GoalsFile): Promise<void> {
  await fileMutexes.goals.runExclusive(async () => {
    await _writeJson("goals.json", data);
  });
}

export async function saveProjects(data: ProjectsFile): Promise<void> {
  await fileMutexes.projects.runExclusive(async () => {
    await _writeJson("projects.json", data);
  });
}

export async function saveBrainDump(data: BrainDumpFile): Promise<void> {
  await fileMutexes.brainDump.runExclusive(async () => {
    await _writeJson("brain-dump.json", data);
  });
}

export async function saveActivityLog(data: ActivityLogFile): Promise<void> {
  await fileMutexes.activityLog.runExclusive(async () => {
    await _writeJson("activity-log.json", data);
  });
}

export async function saveInbox(data: InboxFile): Promise<void> {
  await fileMutexes.inbox.runExclusive(async () => {
    await _writeJson("inbox.json", data);
  });
}

export async function saveDecisions(data: DecisionsFile): Promise<void> {
  await fileMutexes.decisions.runExclusive(async () => {
    await _writeJson("decisions.json", data);
  });
}

export async function saveAgents(data: AgentsFile): Promise<void> {
  await fileMutexes.agents.runExclusive(async () => {
    await _writeJson("agents.json", data);
  });
}

export async function saveSkillsLibrary(data: SkillsLibraryFile): Promise<void> {
  await fileMutexes.skillsLibrary.runExclusive(async () => {
    await _writeJson("skills-library.json", data);
  });
}

export async function saveActiveRuns(data: ActiveRunsFile): Promise<void> {
  await fileMutexes.activeRuns.runExclusive(async () => {
    await _writeJson("active-runs.json", data);
  });
}

// ─── Atomic read-modify-write helpers (legacy — read-only inside lock) ────────
// NOTE: These do NOT write back. Calling save*() inside these will DEADLOCK
// (async-mutex is not reentrant). Use mutate*() below for mutations instead.

export async function withTasks<T>(fn: (data: TasksFile) => Promise<T>): Promise<T> {
  return fileMutexes.tasks.runExclusive(async () => {
    const data = await getTasks();
    return fn(data);
  });
}

export async function withTasksArchive<T>(fn: (data: TasksFile) => Promise<T>): Promise<T> {
  return fileMutexes.tasksArchive.runExclusive(async () => {
    const data = await getTasksArchive();
    return fn(data);
  });
}

export async function withGoals<T>(fn: (data: GoalsFile) => Promise<T>): Promise<T> {
  return fileMutexes.goals.runExclusive(async () => {
    const data = await getGoals();
    return fn(data);
  });
}

export async function withProjects<T>(fn: (data: ProjectsFile) => Promise<T>): Promise<T> {
  return fileMutexes.projects.runExclusive(async () => {
    const data = await getProjects();
    return fn(data);
  });
}

export async function withBrainDump<T>(fn: (data: BrainDumpFile) => Promise<T>): Promise<T> {
  return fileMutexes.brainDump.runExclusive(async () => {
    const data = await getBrainDump();
    return fn(data);
  });
}

export async function withActivityLog<T>(fn: (data: ActivityLogFile) => Promise<T>): Promise<T> {
  return fileMutexes.activityLog.runExclusive(async () => {
    const data = await getActivityLog();
    return fn(data);
  });
}

export async function withInbox<T>(fn: (data: InboxFile) => Promise<T>): Promise<T> {
  return fileMutexes.inbox.runExclusive(async () => {
    const data = await getInbox();
    return fn(data);
  });
}

export async function withDecisions<T>(fn: (data: DecisionsFile) => Promise<T>): Promise<T> {
  return fileMutexes.decisions.runExclusive(async () => {
    const data = await getDecisions();
    return fn(data);
  });
}

export async function withAgents<T>(fn: (data: AgentsFile) => Promise<T>): Promise<T> {
  return fileMutexes.agents.runExclusive(async () => {
    const data = await getAgents();
    return fn(data);
  });
}

export async function withSkillsLibrary<T>(fn: (data: SkillsLibraryFile) => Promise<T>): Promise<T> {
  return fileMutexes.skillsLibrary.runExclusive(async () => {
    const data = await getSkillsLibrary();
    return fn(data);
  });
}

export async function withActiveRuns<T>(fn: (data: ActiveRunsFile) => Promise<T>): Promise<T> {
  return fileMutexes.activeRuns.runExclusive(async () => {
    const data = await getActiveRuns();
    return fn(data);
  });
}

// ─── Atomic mutate helpers (lock → read → callback → auto-write → unlock) ────
// Use these for ALL mutation operations. The callback mutates `data` in place,
// and the file is automatically written after the callback returns.
// If the callback throws, the file is NOT written (implicit rollback).

export async function mutateTasks<T>(fn: (data: TasksFile) => Promise<T>): Promise<T> {
  return fileMutexes.tasks.runExclusive(async () => {
    const raw = await readFile(filePath("tasks.json"), "utf-8");
    const data = JSON.parse(raw) as TasksFile;
    const result = await fn(data);
    await _writeJson("tasks.json", data);
    return result;
  });
}

export async function mutateTasksArchive<T>(fn: (data: TasksFile) => Promise<T>): Promise<T> {
  return fileMutexes.tasksArchive.runExclusive(async () => {
    let data: TasksFile;
    try {
      const raw = await readFile(filePath("tasks-archive.json"), "utf-8");
      data = JSON.parse(raw) as TasksFile;
    } catch {
      data = { tasks: [] };
    }
    const result = await fn(data);
    await _writeJson("tasks-archive.json", data);
    return result;
  });
}

export async function mutateGoals<T>(fn: (data: GoalsFile) => Promise<T>): Promise<T> {
  return fileMutexes.goals.runExclusive(async () => {
    const raw = await readFile(filePath("goals.json"), "utf-8");
    const data = JSON.parse(raw) as GoalsFile;
    const result = await fn(data);
    await _writeJson("goals.json", data);
    return result;
  });
}

export async function mutateProjects<T>(fn: (data: ProjectsFile) => Promise<T>): Promise<T> {
  return fileMutexes.projects.runExclusive(async () => {
    const raw = await readFile(filePath("projects.json"), "utf-8");
    const data = JSON.parse(raw) as ProjectsFile;
    const result = await fn(data);
    await _writeJson("projects.json", data);
    return result;
  });
}

export async function mutateBrainDump<T>(fn: (data: BrainDumpFile) => Promise<T>): Promise<T> {
  return fileMutexes.brainDump.runExclusive(async () => {
    const raw = await readFile(filePath("brain-dump.json"), "utf-8");
    const data = JSON.parse(raw) as BrainDumpFile;
    const result = await fn(data);
    await _writeJson("brain-dump.json", data);
    return result;
  });
}

export async function mutateInbox<T>(fn: (data: InboxFile) => Promise<T>): Promise<T> {
  return fileMutexes.inbox.runExclusive(async () => {
    const raw = await readFile(filePath("inbox.json"), "utf-8");
    const data = JSON.parse(raw) as InboxFile;
    const result = await fn(data);
    await _writeJson("inbox.json", data);
    return result;
  });
}

export async function mutateDecisions<T>(fn: (data: DecisionsFile) => Promise<T>): Promise<T> {
  return fileMutexes.decisions.runExclusive(async () => {
    const raw = await readFile(filePath("decisions.json"), "utf-8");
    const data = JSON.parse(raw) as DecisionsFile;
    const result = await fn(data);
    await _writeJson("decisions.json", data);
    return result;
  });
}

export async function mutateActivityLog<T>(fn: (data: ActivityLogFile) => Promise<T>): Promise<T> {
  return fileMutexes.activityLog.runExclusive(async () => {
    const raw = await readFile(filePath("activity-log.json"), "utf-8");
    const data = JSON.parse(raw) as ActivityLogFile;
    const result = await fn(data);
    await _writeJson("activity-log.json", data);
    return result;
  });
}

export async function mutateAgents<T>(fn: (data: AgentsFile) => Promise<T>): Promise<T> {
  return fileMutexes.agents.runExclusive(async () => {
    let data: AgentsFile;
    try {
      const raw = await readFile(filePath("agents.json"), "utf-8");
      data = JSON.parse(raw) as AgentsFile;
    } catch {
      data = { agents: [] };
    }
    const result = await fn(data);
    await _writeJson("agents.json", data);
    return result;
  });
}

export async function mutateSkillsLibrary<T>(fn: (data: SkillsLibraryFile) => Promise<T>): Promise<T> {
  return fileMutexes.skillsLibrary.runExclusive(async () => {
    let data: SkillsLibraryFile;
    try {
      const raw = await readFile(filePath("skills-library.json"), "utf-8");
      data = JSON.parse(raw) as SkillsLibraryFile;
    } catch {
      data = { skills: [] };
    }
    const result = await fn(data);
    await _writeJson("skills-library.json", data);
    return result;
  });
}

export async function mutateActiveRuns<T>(fn: (data: ActiveRunsFile) => Promise<T>): Promise<T> {
  return fileMutexes.activeRuns.runExclusive(async () => {
    let data: ActiveRunsFile;
    try {
      const raw = await readFile(filePath("active-runs.json"), "utf-8");
      data = JSON.parse(raw) as ActiveRunsFile;
    } catch {
      data = { runs: [] };
    }
    const result = await fn(data);
    await _writeJson("active-runs.json", data);
    return result;
  });
}

export async function mutateDaemonConfig<T>(fn: (data: Record<string, unknown>) => Promise<T>): Promise<T> {
  return fileMutexes.daemonConfig.runExclusive(async () => {
    let data: Record<string, unknown>;
    try {
      const raw = await readFile(filePath("daemon-config.json"), "utf-8");
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      data = {};
    }
    const result = await fn(data);
    await _writeJson("daemon-config.json", data);
    return result;
  });
}
