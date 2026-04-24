# Syncodex Architecture

## Goal

Syncodex bridges the official local Codex thread store to a browser UI.

The current shape is:

```text
Official Codex state_5.sqlite + rollout JSONL
  -> Syncodex bridge
  -> Syncodex web API
  -> browser / phone UI
```

## Boundaries

- Syncodex does not implement model reasoning.
- Syncodex does not replace Codex tool execution.
- Syncodex does not write the official Codex SQLite database.
- The official Codex thread id is the internal source of truth.
- Message sending first follows the official desktop IPC route:
  `\\.\pipe\codex-ipc` -> `thread-follower-start-turn` -> the Codex renderer that
  currently owns the thread.
- If `SYNCODEX_SENDER_TRANSPORT=fallback` is set, Syncodex may fall back to a
  standalone `codex app-server` sender. That fallback writes to the official rollout,
  but the already-open Codex desktop renderer may not immediately refresh that thread.
- The default browser timeline is clean mode: chat messages, file changes, turn
  state, and errors are exposed; raw command and tool events are hidden to keep the
  phone UI readable.

## Core Data Sources

```text
%USERPROFILE%\.codex\state_5.sqlite
%USERPROFILE%\.codex\session_index.jsonl
%USERPROFILE%\.codex\sessions\...\rollout-*.jsonl
```

## First Endpoints

```text
GET  /api/health
GET  /api/sessions
GET  /api/sessions/:sessionId
GET  /api/sessions/:sessionId/timeline
GET  /api/sessions/:sessionId/messages
POST /api/sessions/:sessionId/messages
GET  /api/codex/mode
GET  /api/codex/quota
```

`sessionId` is currently the official Codex `thread_id`.

## Design Rules

- Official Codex remains the only source of truth.
- Syncodex may cache content for faster rendering, but cached content must not override
  live status.
- Queue behavior must remain conservative: official queue first, then Syncodex-managed
  follow-up work.
- Compatibility with the already-open official desktop UI is more important than
  aggressive fallback behavior.
