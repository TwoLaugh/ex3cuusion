# T096 — Task timer & forecasting calibration

User decision: accurate time tracking matters for forecasting; no pillar
quotas. Start / pause / stop timer on a task (list row + drawer). Stop
writes actualMinutes into the existing completion/execution machinery,
feeding effectiveEffortMinutes and the T093 calibrated capacity. One
running timer at a time; survives reload (persisted start timestamp).
