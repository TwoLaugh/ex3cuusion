import { NextResponse } from "next/server";
import { buildDayPlan } from "@/lib/planner";
import { getState } from "@/lib/state";
import { buildWeekPlan } from "@/lib/week-plan";

export async function GET() {
  const state = getState();
  return NextResponse.json({
    currentDate: state.currentDate,
    currentTime: state.currentTime,
    taskCount: state.tasks.length,
    routineCount: state.routines.length,
    routines: state.routines,
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
      domainId: task.domainId,
      projectId: task.projectId,
      completionBehavior: task.completionBehavior,
      completionMode: task.completionMode,
      definitionOfDone: task.definitionOfDone,
      blocked: task.blocked,
      waiting: task.waiting,
      delegation: task.delegation,
      dueDate: task.dueDate,
      scheduledDate: task.scheduledDate,
      scheduledTime: task.scheduledTime,
      dateIntent: task.dateIntent,
      effortMinutes: task.effortMinutes
    })),
    planItems: buildDayPlan(state).items.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      startTime: item.startTime,
      endTime: item.endTime,
      type: item.type,
      taskId: item.taskId,
      selectedTaskIds: item.selectedTaskIds
    })),
    executionEvents: state.executionEvents,
    week: buildWeekPlan(state)
  });
}
