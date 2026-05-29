# Android Launcher V2 HLD

## Role

V2 turns Android into an intentional execution surface.

The launcher should show:

- Today
- Inbox
- current task
- clock/date
- maybe a tiny set of allowed apps
- app request box

It should not show the normal app grid by default.

## Goal

Remove automatic app-opening affordances and make phone use intentional.

This is soft behavior design, not hard lockdown.

## Launcher Basics

V2 should be native Android/Kotlin/Jetpack Compose.

The launcher activity handles:

```xml
<intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.HOME" />
    <category android:name="android.intent.category.DEFAULT" />
</intent-filter>
```

## App Discovery

Android 11+ package visibility requires declaring app-query intent visibility:

```xml
<queries>
    <intent>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent>
</queries>
```

## App Request Flow

User asks:

```text
Open Chrome to research driving test routes.
```

System checks:

- current plan
- linked task
- app access mode
- specificity of reason
- whether this looks like avoidance
- allowed duration

Possible outcomes:

- approved
- denied
- redirected to current task
- needs clarification
- defer current task and log reason

## App Access Modes

- always allowed
- task linked
- requires reason
- requires approval
- blocked

## Timers

Timer types:

- countdown
- pomodoro
- stopwatch
- focus block
- app usage limit

Timers can attach to:

- task
- plan item
- app request

## Notifications And Alarms

V2 should support normal reminders first.

Exact wake alarms are optional/harder because Android exact-alarm permissions are more complex.

## Non-Goals

V2 should not initially attempt:

- enterprise device owner mode
- kiosk lock task mode
- accessibility-service hard blocking
- preventing every bypass
- disabling settings
- hiding apps globally

