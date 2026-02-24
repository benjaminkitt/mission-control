import { NextResponse } from "next/server";
import { getTasks, getInbox, getDecisions, getAgents } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const [tasksData, inboxData, decisionsData, agentsData] = await Promise.all([
    getTasks(),
    getInbox(),
    getDecisions(),
    getAgents(),
  ]);

  const tasks = tasksData.tasks.filter((t) => !t.deletedAt);
  const unreadInbox = inboxData.messages.filter((m) => m.status === "unread").length;
  const pendingDecisions = decisionsData.decisions.filter((d) => d.status === "pending").length;
  const agents = agentsData.agents;

  return NextResponse.json(
    { tasks, unreadInbox, pendingDecisions, agents },
    { headers: { "Cache-Control": "private, max-age=2, stale-while-revalidate=5" } },
  );
}
