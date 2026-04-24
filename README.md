# Syncodex

Syncodex is an unofficial Windows bridge that mirrors the official Codex desktop app
into a browser and phone-friendly UI.

It extends the official desktop experience without replacing the official app:

1. It reads official local Codex thread data and renders it in a cleaner web UI.
2. It lets you continue the same official Codex threads from Syncodex.

The official Codex desktop app remains the source of truth. Syncodex does not run the
model itself and does not write directly to the official SQLite database.

## Status

Syncodex is currently a Windows-only project built around the official Codex desktop app.
It is optimized for local single-user usage, browser monitoring, and phone access.

## Features

- Browse official Codex sessions, titles, statuses, plans, reasoning, command steps,
  file changes, and final replies in a browser UI.
- Keep browser, phone, and official Codex desktop state in sync.
- Send new messages into an official Codex thread through the desktop IPC path.
- Queue local phone tasks safely while Codex is busy.
- Show official queue items before Syncodex local queue items.
- Support completion automation such as auto-read, auto-continue, and per-thread
  completion preferences.
- Generate completion audio on Windows and play it on the phone with a normal audio
  player.
- Support phone access through a temporary Cloudflare tunnel with QR code login.

## Design Principles

- Official Codex remains the only source of truth.
- Syncodex reads official data and prefers official IPC for message sending.
- Syncodex avoids direct writes to the official SQLite database.
- Cached content must never override live truth.

## Runtime Model

The supported packaged runtime is:

```text
dist\Syncodex.exe
```

Normal running state is:

- 2 `Syncodex.exe` processes
- optional `cloudflared.exe` when phone public access is enabled

## Requirements

- Windows 10 or Windows 11
- Official Codex desktop app installed and usable on the same machine
- Access to the local Codex data directory under `%USERPROFILE%\\.codex`

## Quick Start

### Packaged App

1. Build or obtain:

```text
dist\Syncodex.exe
```

2. Double-click it on Windows.
3. Open:

```text
http://127.0.0.1:8765
```

4. For phone access, use the tray menu item labeled `Mobile access...`.

That opens a local status page with a QR code and a temporary public HTTPS URL.

### Source Mode

Start the local bridge:

```powershell
.\scripts\start_bridge.ps1
```

Stop it:

```powershell
.\scripts\stop_bridge.ps1
```

Build the tray executable:

```powershell
.\scripts\build_tray.ps1
```

## Messaging Path

By default Syncodex sends messages through the official desktop IPC route:

```text
\\.\pipe\codex-ipc
-> thread-follower-start-turn
```

Fallback behavior:

- default: `desktop-ipc`
- optional safe fallback: `fallback`
- legacy direct app-server path: `app-server`

Environment variable:

```powershell
$env:SYNCODEX_SENDER_TRANSPORT = "desktop-ipc"
```

## Phone Access

Phone access is designed for the case where the phone and PC are not on the same LAN.

The flow is:

```text
Phone browser
  -> temporary Cloudflare tunnel
  -> local Syncodex token proxy
  -> 127.0.0.1:8765
```

Important properties:

- the local bridge still listens on `127.0.0.1`
- public access requires a temporary tokenized URL
- stopping mobile access or exiting Syncodex invalidates the session
- during development, `scripts\rebuild_restart_preserve_mobile.ps1` is the preferred
  rebuild script because it keeps `cloudflared.exe` alive when possible

## Documentation

- [Chinese user manual](docs/user-manual.zh-CN.md)
- [Chinese requirements and implementation summary](docs/requirements-and-implementation.zh-CN.md)
- [Architecture notes](docs/architecture.md)
- [Private/public repo split plan](docs/repo-split-plan.zh-CN.md)

## Non-Goals

- Replacing the official Codex desktop app
- Writing directly to the official SQLite database
- Acting as a multi-user hosted service
- Providing a long-term public internet deployment target

## Notes

- This is not an OpenAI official component.
- The official Codex desktop app remains the source of truth.
- Syncodex is intentionally conservative about writes.
- The packaged app should be started through `dist\Syncodex.exe`, not ad hoc source
  processes.
