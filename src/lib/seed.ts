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
    // T088 Stage 2b: folders are the canonical structure store. Top-level folders play the role of
    // the legacy domains; child folders (parentFolderId set) play the role of legacy projects.
    // normalizeState re-derives domains/projects/task.domainId/projectId from these.
    folders: [
      { id: "domain_health", name: "Health Repair", weight: 10 },
      { id: "domain_work", name: "Job Work", weight: 9 },
      { id: "domain_product", name: "Diet App", weight: 8 },
      { id: "domain_house", name: "House Work", weight: 5 },
      { id: "domain_social", name: "Social Maintenance", weight: 4 },
      {
        id: "project_diet_app",
        name: "Diet App",
        parentFolderId: "domain_product",
        canBlock: true,
        defaultBlockMinutes: 120,
        contextNote: "Keep momentum on auth and optimizer work."
      },
      {
        id: "container_emma",
        name: "Emma",
        parentFolderId: "domain_social",
        canBlock: true,
        defaultBlockMinutes: 45,
        contextNote: "Relationship ideas and light-touch maintenance."
      }
    ],
    // Legacy mirrors kept so createSeedState() is usable without normalizeState (planner/tests read
    // these directly). normalizeState re-derives them from `folders`, which is canonical.
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
        kind: "project",
        planningMode: "deadline_driven",
        status: "active",
        priorityWeight: 9,
        defaultBlockMinutes: 120,
        contextNote: "Keep momentum on auth and optimizer work."
      },
      {
        id: "container_emma",
        domainId: "domain_social",
        name: "Emma",
        kind: "person",
        planningMode: "relationship",
        status: "active",
        priorityWeight: 4,
        defaultBlockMinutes: 45,
        contextNote: "Relationship ideas and light-touch maintenance."
      }
    ],
    tasks: [
      {
        id: "task_auth_bug",
        title: "Finish auth bug",
        type: "project_task",
        domainId: "domain_product",
        projectId: "project_diet_app",
        folderId: "project_diet_app",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        completionMode: "outcome_done",
        definitionOfDone: "Auth bug is fixed and verified.",
        plannerFields: { intentType: "progress", pressureLevel: "due", location: "computer", setupCost: "medium" },
        tags: ["computer", "auth"],
        fieldConfidence: { intentType: 0.9, pressureLevel: 0.9, effortMinutes: 0.65 },
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
        type: "project_task",
        domainId: "domain_product",
        projectId: "project_diet_app",
        folderId: "project_diet_app",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        completionMode: "outcome_done",
        definitionOfDone: "Optimizer tests are added and passing.",
        plannerFields: { intentType: "progress", pressureLevel: "due", location: "computer", setupCost: "medium" },
        tags: ["computer", "tests"],
        fieldConfidence: { intentType: 0.9, pressureLevel: 0.8, effortMinutes: 0.7 },
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
        type: "atomic",
        domainId: "domain_social",
        folderId: "domain_social",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        completionMode: "simple_done",
        plannerFields: { intentType: "relationship", pressureLevel: "due", location: "phone", setupCost: "low" },
        plannerSignals: { relationshipValue: 7 },
        tags: ["phone", "social"],
        fieldConfidence: { intentType: 0.85, pressureLevel: 0.75, effortMinutes: 0.8 },
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
        type: "atomic",
        domainId: "domain_house",
        folderId: "domain_house",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        completionMode: "progress_accumulating",
        plannerFields: { intentType: "maintenance", pressureLevel: "soft", location: "home", setupCost: "high" },
        tags: ["home", "weekend"],
        fieldConfidence: { intentType: 0.8, pressureLevel: 0.7, effortMinutes: 0.45 },
        priority: 4,
        importance: 5,
        urgency: 3,
        dueDate: "2026-06-07",
        effortMinutes: 90,
        energy: "medium",
        strictness: "flexible"
      },
      {
        id: "task_read_together",
        title: "Read together",
        type: "soft_invitation",
        domainId: "domain_social",
        projectId: "container_emma",
        folderId: "container_emma",
        status: "active",
        repeatPolicy: { type: "weekly", days: [0, 3, 6], carryover: "skip", cooldownDays: 3 },
        completionBehavior: "keep_as_suggestion",
        completionMode: "suggestion_used",
        plannerFields: { intentType: "relationship", pressureLevel: "soft", location: "home", setupCost: "low" },
        plannerSignals: { relationshipValue: 6, cognitiveLoad: 2 },
        tags: ["relationship", "soft_idea"],
        fieldConfidence: { intentType: 0.8, pressureLevel: 0.8, effortMinutes: 0.5 },
        priority: 3,
        importance: 5,
        urgency: 1,
        effortMinutes: 45,
        energy: "low",
        strictness: "flexible"
      },
      {
        id: "task_back_rehab",
        title: "Back rehab",
        type: "atomic",
        domainId: "domain_health",
        folderId: "domain_health",
        status: "active",
        repeatPolicy: { type: "daily", preferredWindow: "morning", carryover: "skip" },
        completionBehavior: "repeatable",
        completionMode: "repeatable_checkoff",
        plannerFields: { intentType: "health", pressureLevel: "soft" },
        tags: ["health", "recurring"],
        priority: 5,
        importance: 5,
        urgency: 4,
        effortMinutes: 20,
        energy: "low",
        strictness: "strict",
        dateIntent: { kind: "recurring", confidence: 0.9 }
      }
    ],
    deferrals: [],
    completions: [],
    executionEvents: [],
    projectBlockSelections: [],
    dailyReviews: [],
    inbox: [],
    captureSessions: []
  };
}
