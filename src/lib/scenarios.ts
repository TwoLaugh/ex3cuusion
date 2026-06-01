import type { AppState } from "./types";

export function createRealisticCharacterState(): AppState {
  return {
    currentDate: "2026-06-03",
    currentTime: "06:45",
    availableMinutes: 780,
    // T088: folders are the only structure. Top-level folders are areas; child folders
    // (parentFolderId set) behave like the legacy projects (their tasks become project_task).
    folders: [
      { id: "domain_health", name: "Health", weight: 10 },
      { id: "domain_work", name: "Work", weight: 10 },
      { id: "domain_zine", name: "Recipe Zine", weight: 7 },
      { id: "domain_home", name: "Home Admin", weight: 5 },
      { id: "domain_social", name: "Social", weight: 6 },
      { id: "domain_recovery", name: "Recovery", weight: 8 },
      {
        id: "project_dashboard_review",
        name: "Clinician Dashboard UX Review",
        parentFolderId: "domain_work",
        canBlock: true,
        defaultBlockMinutes: 150,
        contextNote: "Final UX review package is due before tomorrow's stakeholder readout."
      },
      {
        id: "project_recipe_zine",
        name: "Illustrated Recipe Zine",
        parentFolderId: "domain_zine",
        canBlock: true,
        defaultBlockMinutes: 75,
        contextNote: "Personal creative project; preserve a small amount of momentum without sacrificing sleep."
      }
    ],
    tasks: [
      fixedTask("task_medication", "Medication and water", "domain_health", "07:00", 5, "low"),
      fixedTask("task_standup", "Team standup", "domain_work", "09:30", 15, "medium"),
      fixedTask("task_stakeholder_critique", "Stakeholder critique", "domain_work", "14:00", 60, "high"),
      fixedTask("task_dentist_travel_out", "Travel to dentist", "domain_health", "16:05", 25, "medium"),
      fixedTask("task_dentist", "Dentist appointment", "domain_health", "16:30", 45, "medium"),
      fixedTask("task_dentist_travel_home", "Travel home from dentist", "domain_health", "17:15", 25, "medium"),
      fixedTask("task_dinner_leo", "Dinner with Leo", "domain_social", "19:30", 90, "medium"),
      fixedTask("task_shutdown", "Shutdown routine", "domain_recovery", "22:15", 30, "low"),
      fixedTask("task_sleep", "Sleep", "domain_recovery", "23:00", 465, "low"),
      {
        id: "task_polish_screens",
        title: "Polish 6 dashboard screens",
        type: "project_task",
        folderId: "project_dashboard_review",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        plannerFields: { intentType: "progress", pressureLevel: "due", location: "computer", setupCost: "medium" },
        priority: 10,
        importance: 10,
        urgency: 9,
        dueDate: "2026-06-04",
        effortMinutes: 150,
        energy: "high",
        strictness: "normal"
      },
      {
        id: "task_review_analytics",
        title: "Review analytics notes",
        type: "project_task",
        folderId: "project_dashboard_review",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        plannerFields: { intentType: "progress", pressureLevel: "due", location: "computer", setupCost: "low" },
        priority: 9,
        importance: 9,
        urgency: 8,
        dueDate: "2026-06-03",
        effortMinutes: 60,
        energy: "high",
        strictness: "normal"
      },
      {
        id: "task_rationale_bullets",
        title: "Write UX rationale bullets",
        type: "project_task",
        folderId: "project_dashboard_review",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        plannerFields: { intentType: "progress", pressureLevel: "due", location: "computer", setupCost: "low" },
        priority: 8,
        importance: 8,
        urgency: 8,
        dueDate: "2026-06-03",
        effortMinutes: 45,
        energy: "high",
        strictness: "normal"
      },
      {
        id: "task_pm_preview",
        title: "Send preview to PM",
        type: "atomic",
        folderId: "domain_work",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        plannerFields: { intentType: "obligation", pressureLevel: "due", location: "computer", setupCost: "low" },
        priority: 8,
        importance: 8,
        urgency: 8,
        dueDate: "2026-06-03",
        effortMinutes: 15,
        energy: "medium",
        strictness: "normal"
      },
      {
        id: "task_process_feedback",
        title: "Process critique feedback",
        type: "atomic",
        folderId: "domain_work",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        plannerFields: { intentType: "progress", pressureLevel: "due", location: "computer", setupCost: "medium" },
        priority: 7,
        importance: 8,
        urgency: 6,
        dueDate: "2026-06-04",
        effortMinutes: 45,
        energy: "medium",
        strictness: "normal"
      },
      {
        id: "task_sketch_zine",
        title: "Sketch one recipe zine spread",
        type: "project_task",
        folderId: "project_recipe_zine",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        plannerFields: { intentType: "idea", pressureLevel: "soft", location: "home", setupCost: "medium" },
        priority: 5,
        importance: 7,
        urgency: 3,
        dueDate: "2026-06-08",
        effortMinutes: 45,
        energy: "medium",
        strictness: "flexible"
      },
      {
        id: "task_zine_words",
        title: "Write 150 zine words",
        type: "project_task",
        folderId: "project_recipe_zine",
        status: "active",
        repeatPolicy: { type: "none" },
        completionBehavior: "exhaust_once",
        plannerFields: { intentType: "idea", pressureLevel: "soft", location: "home", setupCost: "low" },
        priority: 4,
        importance: 6,
        urgency: 3,
        dueDate: "2026-06-08",
        effortMinutes: 30,
        energy: "medium",
        strictness: "flexible"
      },
      normalTask("task_reply_sister", "Reply to sister about birthday plans", "domain_social", 15, 6, 8, 6, "low"),
      normalTask("task_text_leo", "Confirm dinner with Leo", "domain_social", 5, 7, 8, 7, "low"),
      normalTask("task_support_coworker", "Send supportive note to Alex", "domain_social", 10, 5, 7, 4, "low"),
      normalTask("task_buy_toothpaste", "Buy toothpaste", "domain_home", 10, 4, 4, 4, "low"),
      normalTask("task_kitchen_tidy", "Quick tidy kitchen", "domain_home", 15, 4, 5, 3, "low"),
      recurringTask("task_mobility", "Run or mobility fallback", "domain_health", 25, "medium", "morning"),
      recurringTask("task_breakfast", "Shower and breakfast", "domain_health", 30, "low", "morning"),
      recurringTask("task_lunch", "Lunch away from desk", "domain_recovery", 30, "low", "afternoon"),
      recurringTask("task_inbox", "AI inbox triage", "domain_work", 15, "medium", "morning")
    ],
    deferrals: [
      {
        id: "deferral_prev_zine",
        date: "2026-06-02",
        planItemId: "previous_zine_block",
        reason: "low_energy",
        note: "Creative project slipped after work overran."
      },
      {
        id: "deferral_prev_social",
        date: "2026-06-02",
        planItemId: "previous_social_batch",
        reason: "no_time",
        note: "Social replies are starting to accumulate."
      }
    ],
    completions: [],
    executionEvents: [],
    folderBlockSelections: [],
    dailyReviews: [],
    inbox: [],
    captureSessions: []
  };
}

function fixedTask(
  id: string,
  title: string,
  folderId: string,
  scheduledTime: string,
  effortMinutes: number,
  energy: "low" | "medium" | "high"
) {
  return {
    id,
    title,
    type: "atomic" as const,
    folderId,
    status: "active" as const,
    repeatPolicy: { type: "none" as const },
    completionBehavior: "exhaust_once" as const,
    plannerFields: { intentType: "obligation" as const, pressureLevel: "fixed" as const, setupCost: "low" as const },
    priority: 10,
    importance: 10,
    urgency: 10,
    scheduledDate: "2026-06-03",
    scheduledTime,
    effortMinutes,
    energy,
    strictness: "strict" as const
  };
}

function normalTask(
  id: string,
  title: string,
  folderId: string,
  effortMinutes: number,
  priority: number,
  importance: number,
  urgency: number,
  energy: "low" | "medium" | "high"
) {
  return {
    id,
    title,
    type: "atomic" as const,
    folderId,
    status: "active" as const,
    repeatPolicy: { type: "none" as const },
    completionBehavior: "exhaust_once" as const,
    plannerFields: { intentType: "admin" as const, pressureLevel: "due" as const, setupCost: "low" as const },
    priority,
    importance,
    urgency,
    dueDate: "2026-06-03",
    effortMinutes,
    energy,
    strictness: "normal" as const
  };
}

function recurringTask(
  id: string,
  title: string,
  folderId: string,
  effortMinutes: number,
  energy: "low" | "medium" | "high",
  preferredWindow: "morning" | "afternoon" | "evening"
) {
  return {
    id,
    title,
    type: "atomic" as const,
    folderId,
    status: "active" as const,
    repeatPolicy: { type: "daily" as const, preferredWindow, carryover: "skip" as const },
    completionBehavior: "repeatable" as const,
    completionMode: "repeatable_checkoff" as const,
    plannerFields: { intentType: "obligation" as const, pressureLevel: "soft" as const },
    priority: 4,
    importance: 4,
    urgency: 3,
    effortMinutes,
    energy,
    strictness: "normal" as const,
    dateIntent: { kind: "recurring" as const, confidence: 0.9 }
  };
}
