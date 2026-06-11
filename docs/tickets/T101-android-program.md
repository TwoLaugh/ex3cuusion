# T101-T107 — Native Android program (Kotlin/Compose)

DECISION (user, 2026-06-11): move primary development from the web app to
a full native Android app. Web app demotes to desktop workbench. Chosen
over Expo/RN with tradeoffs understood (forked logic, weeks-scale, heavy
build env) because native is where this ends anyway (widgets, launcher).

Architecture:
- android/ dir in this repo. Kotlin + Jetpack Compose, single activity.
- LOCAL-FIRST: persists the SAME AppState JSON document schema the web
  uses (kotlinx.serialization mirrors src/lib/types.ts). One schema, two
  runtimes; export/import = file copy. Room/SQLite only if perf demands.
- The brain is TRANSLATED from the verified TS (planner.ts, day-list.ts
  incl. T093 tray intelligence, state slices, undo snapshot stack) WITH
  ported tests (JUnit) — the TS suite is the spec.
- AI on-device: single-shot capture interpretation via OpenAI Responses
  (JSON schema), API key in app settings. Clarification chat OUT of v1.
- v1 scope = the daily loop ONLY: Today list (reorder/tick/instant add),
  habit strip + streaks, capacity/balance gauges, tray (due/balance/
  backlog), carry + close-out, capture+enrich, folders browse, undo.
  NOT v1: timeline, week view, organizer, docs, capture sessions.

Tickets:
- T101 scaffold: SDK bootstrap (cmdline-tools via CLI), gradle project,
  Compose + warm-dark theme tokens, assembleDebug APK, empty Today.
- T102 core port 1: types as @Serializable, JSON store (AppState-
  compatible), normalize/migrate, repository, undo stack, tests.
- T103 core port 2: planner + day-list + tray intelligence + carry/
  close-out logic, ported tests.
- T104 Today UI (Compose): list/habits/gauges/tray/close-out.
- T105 capture + AI + settings (key), async enrich.
- T106 folders UI, undo surface, polish; sideload-ready APK.
- T107 data bridge: export/import state.json with the web workbench.
Later: notifications, widget, launcher (the 06-android HLD idea).

Web tickets T094/T097/T098/T099 pause as web builds; their specs feed
the Android backlog. T100 (PWA) cancelled — superseded by native.
