# Contributing to Syncodex

Thanks for considering a contribution.

## Before You Start

- Syncodex is currently Windows-only.
- The project is tightly coupled to the official Codex desktop app.
- Behavior should stay conservative around official data: do not introduce direct writes
  to the official SQLite database.

## Preferred Contribution Flow

1. Open an issue before starting large changes.
2. Keep changes focused and easy to review.
3. Prefer small pull requests over broad refactors.
4. Include verification notes for UI, queue behavior, or bridge behavior changes.

## Development Notes

- Source-mode helpers live under `scripts/`.
- Packaged runtime is built from `dist\Syncodex.exe`.
- Phone access and queue behavior are important compatibility surfaces; avoid changing
  them casually.

## Testing Expectations

At minimum, contributors should run checks relevant to the touched area, for example:

```powershell
node --check package\web\app.js
py -m compileall -q apps
.\scripts\smoke_test.ps1
```

If a change is not covered by automated checks, describe the manual verification that
was performed.

## Scope Rules

Please avoid contributions that:

- bypass the official desktop IPC path without a strong compatibility reason
- write directly to the official Codex SQLite database
- introduce public-hosted service assumptions into a local-first tool
