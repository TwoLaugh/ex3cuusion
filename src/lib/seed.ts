import { resetIds } from "./ids";
import { toDateOnly, toTimeOnly } from "./dates";
import type { AppState } from "./types";

export function createSeedState(): AppState {
  resetIds();
  const now = new Date();

  return {
    currentDate: toDateOnly(now),
    currentTime: toTimeOnly(now),
    availableMinutes: 300,
    domains: [
      { id: "domain_health", name: "Health Repair", weight: 10 },
      { id: "domain_work", name: "Job Work", weight: 9 },
      { id: "domain_product", name: "Diet App", weight: 8 },
      { id: "domain_house", name: "House Work", weight: 5 },
      { id: "domain_social", name: "Social Maintenance", weight: 4 }
    ],
    projects: [
      {
        id: "project_diet_app",
        domainId: "domain_product",
        name: "Diet App",
        status: "active",
        priorityWeight: 9,
        defaultBlockMinutes: 120,
        contextNote: "Keep momentum on auth and optimizer work."
      }
    ],
    tasks: [
      {
        id: "task_auth_bug",
        title: "Finish auth bug",
        domainId: "domain_product",
        projectId: "project_diet_app",
        status: "active",
        priority: 9,
        importance: 9,
        urgency: 9,
        dueDate: "2026-06-05",
        effortMinutes: 90,
        energy: "high",
        strictness: "normal"
      },
      {
        id: "task_optimizer_tests",
        title: "Add optimizer tests",
        domainId: "domain_product",
        projectId: "project_diet_app",
        status: "active",
        priority: 7,
        importance: 8,
        urgency: 5,
        dueDate: "2026-06-06",
        effortMinutes: 60,
        energy: "medium",
        strictness: "normal"
      },
      {
        id: "task_message_will",
        title: "Message Will",
        domainId: "domain_social",
        status: "active",
        priority: 5,
        importance: 6,
        urgency: 7,
        dueDate: "2026-06-02",
        effortMinutes: 10,
        energy: "low",
        strictness: "normal"
      },
      {
        id: "task_clean_garage",
        title: "Clean garage",
        domainId: "domain_house",
        status: "active",
        priority: 4,
        importance: 5,
        urgency: 3,
        dueDate: "2026-06-07",
        effortMinutes: 90,
        energy: "medium",
        strictness: "soft"
      }
    ],
    routines: [
      {
        id: "routine_back_rehab",
        title: "Back rehab",
        domainId: "domain_health",
        recurrence: { type: "daily" },
        defaultEffortMinutes: 20,
        energy: "low",
        strictness: "strict",
        preferredWindow: "morning",
        active: true
      }
    ],
    deferrals: [],
    completions: [],
    inbox: []
  };
}
