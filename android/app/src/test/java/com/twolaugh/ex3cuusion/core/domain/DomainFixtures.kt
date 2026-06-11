package com.twolaugh.ex3cuusion.core.domain

import com.twolaugh.ex3cuusion.core.model.AppState
import com.twolaugh.ex3cuusion.core.model.CompletionBehavior
import com.twolaugh.ex3cuusion.core.model.CompletionMode
import com.twolaugh.ex3cuusion.core.model.DateIntent
import com.twolaugh.ex3cuusion.core.model.DateIntentKind
import com.twolaugh.ex3cuusion.core.model.Carryover
import com.twolaugh.ex3cuusion.core.model.Energy
import com.twolaugh.ex3cuusion.core.model.Folder
import com.twolaugh.ex3cuusion.core.model.IntentType
import com.twolaugh.ex3cuusion.core.model.PlannerFields
import com.twolaugh.ex3cuusion.core.model.PlannerSignals
import com.twolaugh.ex3cuusion.core.model.PreferredWindow
import com.twolaugh.ex3cuusion.core.model.PressureLevel
import com.twolaugh.ex3cuusion.core.model.RepeatPolicy
import com.twolaugh.ex3cuusion.core.model.SetupCost
import com.twolaugh.ex3cuusion.core.model.Strictness
import com.twolaugh.ex3cuusion.core.model.Task
import com.twolaugh.ex3cuusion.core.model.TaskLocation
import com.twolaugh.ex3cuusion.core.model.TaskStatus
import com.twolaugh.ex3cuusion.core.model.TaskType
import com.twolaugh.ex3cuusion.core.store.UndoStack
import java.io.File
import java.nio.file.Files

// Port of src/lib/seed.ts createSeedState() — the same characters the TS day-list tests run
// against, pinned to the test clock 2026-06-01 (a Monday) 08:30.
fun seedState(): AppState = AppState(
    currentDate = "2026-06-01",
    currentTime = "08:30",
    availableMinutes = 300,
    folders = listOf(
        Folder(id = "domain_health", name = "Health Repair", weight = 10),
        Folder(id = "domain_work", name = "Job Work", weight = 9),
        Folder(id = "domain_product", name = "Diet App", weight = 8),
        Folder(id = "domain_house", name = "House Work", weight = 5),
        Folder(id = "domain_social", name = "Social Maintenance", weight = 4),
        Folder(
            id = "project_diet_app", name = "Diet App", parentFolderId = "domain_product",
            canBlock = true, defaultBlockMinutes = 120, contextNote = "Keep momentum on auth and optimizer work."
        ),
        Folder(
            id = "container_emma", name = "Emma", parentFolderId = "domain_social",
            canBlock = true, defaultBlockMinutes = 45, contextNote = "Relationship ideas and light-touch maintenance."
        )
    ),
    tasks = listOf(
        Task(
            id = "task_auth_bug", title = "Finish auth bug", type = TaskType.ProjectTask, folderId = "project_diet_app",
            status = TaskStatus.Active, repeatPolicy = RepeatPolicy.None, completionBehavior = CompletionBehavior.ExhaustOnce,
            completionMode = CompletionMode.OutcomeDone, definitionOfDone = "Auth bug is fixed and verified.",
            plannerFields = PlannerFields(IntentType.Progress, PressureLevel.Due, TaskLocation.Computer, SetupCost.Medium),
            tags = listOf("computer", "auth"), priority = 9, importance = 9, urgency = 9,
            dueDate = "2026-06-05", effortMinutes = 90, energy = Energy.High, strictness = Strictness.Normal
        ),
        Task(
            id = "task_optimizer_tests", title = "Add optimizer tests", type = TaskType.ProjectTask, folderId = "project_diet_app",
            status = TaskStatus.Active, repeatPolicy = RepeatPolicy.None, completionBehavior = CompletionBehavior.ExhaustOnce,
            completionMode = CompletionMode.OutcomeDone, definitionOfDone = "Optimizer tests are added and passing.",
            plannerFields = PlannerFields(IntentType.Progress, PressureLevel.Due, TaskLocation.Computer, SetupCost.Medium),
            tags = listOf("computer", "tests"), priority = 7, importance = 8, urgency = 5,
            dueDate = "2026-06-06", effortMinutes = 60, energy = Energy.Medium, strictness = Strictness.Normal
        ),
        Task(
            id = "task_message_will", title = "Message Will", type = TaskType.Atomic, folderId = "domain_social",
            status = TaskStatus.Active, repeatPolicy = RepeatPolicy.None, completionBehavior = CompletionBehavior.ExhaustOnce,
            completionMode = CompletionMode.SimpleDone,
            plannerFields = PlannerFields(IntentType.Relationship, PressureLevel.Due, TaskLocation.Phone, SetupCost.Low),
            plannerSignals = PlannerSignals(relationshipValue = 7.0), tags = listOf("phone", "social"),
            priority = 5, importance = 6, urgency = 7, dueDate = "2026-06-02", effortMinutes = 10,
            energy = Energy.Low, strictness = Strictness.Normal
        ),
        Task(
            id = "task_clean_garage", title = "Clean garage", type = TaskType.Atomic, folderId = "domain_house",
            status = TaskStatus.Active, repeatPolicy = RepeatPolicy.None, completionBehavior = CompletionBehavior.ExhaustOnce,
            completionMode = CompletionMode.ProgressAccumulating,
            plannerFields = PlannerFields(IntentType.Maintenance, PressureLevel.Soft, TaskLocation.Home, SetupCost.High),
            tags = listOf("home", "weekend"), priority = 4, importance = 5, urgency = 3,
            dueDate = "2026-06-07", effortMinutes = 90, energy = Energy.Medium, strictness = Strictness.Flexible
        ),
        Task(
            id = "task_read_together", title = "Read together", type = TaskType.SoftInvitation, folderId = "container_emma",
            status = TaskStatus.Active,
            repeatPolicy = RepeatPolicy.Weekly(days = listOf(0, 3, 6), carryover = Carryover.Skip, cooldownDays = 3),
            completionBehavior = CompletionBehavior.KeepAsSuggestion, completionMode = CompletionMode.SuggestionUsed,
            plannerFields = PlannerFields(IntentType.Relationship, PressureLevel.Soft, TaskLocation.Home, SetupCost.Low),
            plannerSignals = PlannerSignals(relationshipValue = 6.0, cognitiveLoad = 2.0), tags = listOf("relationship", "soft_idea"),
            priority = 3, importance = 5, urgency = 1, effortMinutes = 45, energy = Energy.Low, strictness = Strictness.Flexible
        ),
        Task(
            id = "task_back_rehab", title = "Back rehab", type = TaskType.Atomic, folderId = "domain_health",
            status = TaskStatus.Active,
            repeatPolicy = RepeatPolicy.Daily(preferredWindow = PreferredWindow.Morning, carryover = Carryover.Skip),
            completionBehavior = CompletionBehavior.Repeatable, completionMode = CompletionMode.RepeatableCheckoff,
            plannerFields = PlannerFields(IntentType.Health, PressureLevel.Soft),
            tags = listOf("health", "recurring"), priority = 5, importance = 5, urgency = 4,
            effortMinutes = 20, energy = Energy.Low, strictness = Strictness.Strict,
            dateIntent = DateIntent(kind = DateIntentKind.Recurring, confidence = 0.9)
        )
    )
)

// Fresh engine over the seed (or a custom state) with an isolated temp-dir undo stack.
fun testEngine(state: AppState = seedState()): DomainEngine {
    val dir = Files.createTempDirectory("ex3-domain-test").toFile()
    return DomainEngine(state, UndoStack(File(dir, "history.json")))
}
