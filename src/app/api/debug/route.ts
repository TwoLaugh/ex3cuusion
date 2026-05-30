import { NextResponse } from "next/server";
import { buildDayPlan } from "@/lib/planner";
import { getState } from "@/lib/state";

export async function GET() {
  const state = getState();
  return NextResponse.json({
    currentDate: state.currentDate,
    currentTime: state.currentTime,
    taskCount: state.tasks.length,
    routineCount: state.routines.length,
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
        payload: action.payload
      }))
    })),
    tasks: state.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      domainId: task.domainId,
      projectId: task.projectId,
      dueDate: task.dueDate,
      scheduledDate: task.scheduledDate,
      scheduledTime: task.scheduledTime,
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
    }))
  });
}
