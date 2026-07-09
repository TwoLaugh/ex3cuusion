import { NextResponse } from "next/server";
import { dayView } from "@/lib/state";
import { getState } from "@/lib/state";
import { buildWeekPlan } from "@/lib/week-plan";

export async function GET() {
  const plan = dayView(); // T090: the committed-day projection, not a fresh generation
  const state = getState();
  return NextResponse.json({
    currentDate: state.currentDate,
    currentTime: state.currentTime,
    committedAt: plan.committedAt,
    newCandidateCount: plan.newCandidateCount,
    taskCount: state.tasks.length,
    folders: state.folders,
    inbox: state.inbox.map((entry) => ({
      id: entry.id,
      input: entry.input,
      summary: entry.summary,
      actions: entry.actions.map((action) => ({
        id: action.id,
        type: action.type,
        label: action.label,
        safety: action.safety,
        status: action.status,
        appliedEntityId: action.appliedEntityId,
        skippedReason: action.skippedReason,
        captureSessionId: action.captureSessionId,
        pendingQuestionId: action.pendingQuestionId,
        payload: action.payload
      }))
    })),
    captureSessions: state.captureSessions,
    tasks: state.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      folderId: task.folderId,
      completionBehavior: task.completionBehavior,
      completionMode: task.completionMode,
      repeatPolicy: task.repeatPolicy,
      definitionOfDone: task.definitionOfDone,
      blocked: task.blocked,
      waiting: task.waiting,
      delegation: task.delegation,
      dueDate: task.dueDate,
      scheduledDate: task.scheduledDate,
      scheduledTime: task.scheduledTime,
      dateIntent: task.dateIntent,
      scheduling: task.scheduling,
      effortMinutes: task.effortMinutes
    })),
    planItems: plan.items.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      startTime: item.startTime,
      endTime: item.endTime,
      type: item.type,
      taskId: item.taskId,
      schedulingMode: item.schedulingMode,
      attentionLoad: item.attentionLoad,
      canOverlap: item.canOverlap,
      overlapKinds: item.overlapKinds,
      phaseKind: item.phaseKind,
      parentTaskId: item.parentTaskId,
      blockingMinutes: item.blockingMinutes,
      clockMinutes: item.clockMinutes,
      selectedTaskIds: item.selectedTaskIds
    })),
    folderBlockSelections: state.folderBlockSelections,
    dailyReviews: state.dailyReviews,
    executionEvents: state.executionEvents,
    week: buildWeekPlan(state)
  });
}
