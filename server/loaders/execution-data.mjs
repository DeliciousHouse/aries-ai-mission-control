import path from "node:path";
import { readJson, toIso, getMissionControlRoot } from "../lib/fs-utils.mjs";

const tasksPath = path.join(getMissionControlRoot(), "server", "data", "execution-tasks.json");

export async function loadExecutionData() {
  const payload = await readJson(tasksPath);
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];

  return {
    source: {
      kind: payload.kind ?? "internal-planning",
      updatedAt: payload.updatedAt ?? toIso(Date.now()),
      note:
        payload.note ??
        "Internal planning data only. This is not runtime telemetry and should not be presented as live state.",
    },
    tasks,
    owners: [...new Set(tasks.map((task) => task.owner))]
      .sort()
      .map((owner) => ({ label: owner, value: owner })),
    workstreams: [...new Set(tasks.map((task) => task.workstream))]
      .sort()
      .map((workstream) => ({ label: workstream, value: workstream })),
    views: [
      { id: "all", label: "All tasks", count: tasks.length },
      { id: "frontend", label: "Frontend tasks", count: tasks.filter((task) => task.owner === "Rohan").length },
      { id: "backend", label: "Backend tasks", count: tasks.filter((task) => task.owner === "Roy").length },
      { id: "manual", label: "Human / manual tasks", count: tasks.filter((task) => task.owner === "Somwya").length },
      {
        id: "blocked",
        label: "Blocked tasks",
        count: tasks.filter((task) => task.blocked || task.status === "blocked").length,
      },
      {
        id: "ready-next",
        label: "Ready next",
        count: tasks.filter((task) => !task.blocked && task.status !== "done").length,
      },
    ],
  };
}
