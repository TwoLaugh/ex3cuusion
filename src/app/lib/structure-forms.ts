import type { FormEvent } from "react";
import type { AppState } from "@/lib/types";

export type PostFn = (url: string, body?: Record<string, unknown>) => Promise<void>;

export function submitStructureForm(
  event: FormEvent<HTMLFormElement>,
  post: PostFn,
  entity: "task" | "folder",
  action: "create" | "update",
  id?: string
) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const patch = structurePatch(entity, formData);
  void post("/api/structure", { entity, action, id, patch }).then(() => {
    if (action === "create") form.reset();
  });
}

export function structurePatch(entity: "task" | "folder", formData: FormData): Record<string, unknown> {
  if (entity === "folder") {
    return {
      name: fieldText(formData, "name"),
      // Empty string = top level; state.ts treats "" as clearing the parent.
      parentFolderId: fieldText(formData, "parentFolderId"),
      weight: fieldNumber(formData, "weight"),
      canBlock: formData.get("canBlock") === "on",
      defaultBlockMinutes: fieldNumber(formData, "defaultBlockMinutes")
    };
  }

  const tagsRaw = fieldText(formData, "tags");
  const minMinutesRaw = fieldText(formData, "minMinutes");
  const maxMinutesRaw = fieldText(formData, "maxMinutes");
  const importance = fieldNumber(formData, "importance");
  const urgency = fieldNumber(formData, "urgency");
  const priority = fieldNumber(formData, "priority");
  const repeatType = fieldText(formData, "repeatType");
  const repeatDays = fieldText(formData, "repeatDays")
    .split(",")
    .map((day) => Number(day.trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const repeatPolicy =
    repeatType === "weekly"
      ? { type: "weekly", days: repeatDays.length ? repeatDays : [1] }
      : repeatType === "daily"
        ? { type: "daily" }
        : { type: "none" };
  return {
    repeatPolicy,
    title: fieldText(formData, "title"),
    // Folders are the only structure (T088): the single folder picker drives placement.
    folderId: fieldText(formData, "folderId"),
    parentTaskId: fieldText(formData, "parentTaskId"),
    status: fieldText(formData, "status"),
    priority,
    // If the Advanced importance/urgency fields are absent (simple view), mirror priority so the
    // planner still has all three scores.
    importance: importance || priority,
    urgency: urgency || priority,
    effortMinutes: fieldNumber(formData, "effortMinutes"),
    dueDate: fieldText(formData, "dueDate"),
    scheduledDate: fieldText(formData, "scheduledDate"),
    scheduledTime: fieldText(formData, "scheduledTime"),
    completionBehavior: fieldText(formData, "completionBehavior"),
    completionMode: fieldText(formData, "completionMode"),
    energy: fieldText(formData, "energy"),
    strictness: fieldText(formData, "strictness"),
    schedulingMode: fieldText(formData, "schedulingMode"),
    tags: tagsRaw ? tagsRaw.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
    minMinutes: minMinutesRaw ? Number(minMinutesRaw) : undefined,
    maxMinutes: maxMinutesRaw ? Number(maxMinutesRaw) : undefined,
    definitionOfDone: fieldText(formData, "definitionOfDone"),
    notes: fieldText(formData, "notes")
  };
}

export function fieldText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function fieldNumber(formData: FormData, key: string): number | undefined {
  const value = fieldText(formData, key);
  return value ? Number(value) : undefined;
}

export function actionSummary(action: AppState["inbox"][number]["actions"][number]): string {
  const payload = action.payload ?? {};
  if (action.type === "create_task") return `Task: ${String(payload.title ?? action.label)}`;
  if (action.type === "schedule_task") return `Moved: ${String(payload.title ?? action.label)}`;
  if (action.type === "archive_task") return `Removed: ${String(payload.title ?? action.label)}`;
  if (action.type === "create_folder") return `Folder: ${String(payload.name ?? payload.title ?? action.label)}`;
  return action.label;
}
