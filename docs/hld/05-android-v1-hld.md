# Android V1 HLD

## Role

Android V1 provides mobile access to the execution engine.

It is not the launcher yet.

## Scope

Required:

- Today view
- Inbox / command input
- completion and defer controls
- basic project block expansion
- daily review
- optional push/local reminders if easy

Not required:

- home screen replacement
- app request system
- package discovery
- hard blocking
- app usage logging
- exact wake alarms

## Implementation Options

Fastest options:

- Capacitor wrapper around web app
- React Native app using the same backend

Later V2 launcher work should be native Kotlin/Jetpack Compose because launcher behavior, app launching, package querying, notifications, and alarms are Android-specific.

## V1 Acceptance

User can:

- open Today on Android
- see routine/project/task plan
- complete work
- defer with reason
- capture messy input
- run daily review

