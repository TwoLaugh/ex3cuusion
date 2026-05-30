# T015: Android V1 Decision Gate

## Goal

Decide how to provide Android access only after the web V1 interaction model is stable.

## Scope

- Review web Today, AI inbox, project drawer, completion, deferral, and review flows.
- Compare mobile web, Capacitor wrapper, React Native, and native options.
- Produce implementation recommendation.

## Requirements

- Do not start Android launcher V2 work here.
- Do not duplicate unstable web flows in native code.
- Reuse backend contracts from V1.

## Acceptance

- Decision doc identifies chosen Android V1 approach and why.
- Required backend/API gaps are listed.
- Launcher/app-request/timer/app-usage work remains deferred to V2.

