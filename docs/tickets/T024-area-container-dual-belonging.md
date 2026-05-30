# T024: Area And Container Dual Belonging

## Goal

Clarify the structure currently split between `Domain` and `Project`.

Most tasks need one broad area and optionally one concrete container/project/list/person.

Example:

- area: Finance
- container: 2026 Policy Renewal
- task: Renew insurance

## Direction

Rename mentally:

- `Domain` -> `Area`
- `Project` -> `Container`

A task has:

- `areaId`
- `containerId` optional

This handles most needs without introducing many-to-many complexity yet.

## Cases

- `Diet App` container under Product/Business area.
- `Emma` person container under Social area.
- `Garage Reset` project/maintenance container under House area.
- `Date Ideas` idea pool under Social area.
- `Renew insurance` under Finance area and 2026 Policy Renewal container.

## Acceptance Criteria

- Docs and code consistently describe area/container semantics.
- Existing `domainId` / `projectId` names are either renamed or mapped behind helper terminology.
- Planner can balance areas while grouping selected tasks by container.
- Tests cover area balancing and container grouping separately.

## Non-Goals

- full many-to-many tagging system
- multi-user ownership
- final database migration names
