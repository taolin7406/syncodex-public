from __future__ import annotations

import json
import base64
import binascii
import os
import re
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
import shutil
import hashlib
import mimetypes
import tempfile
from datetime import datetime
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_CODEX_HOME = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
DEFAULT_STATE_DB = DEFAULT_CODEX_HOME / "state_5.sqlite"
DEFAULT_GLOBAL_STATE = DEFAULT_CODEX_HOME / ".codex-global-state.json"
MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
MAX_ATTACHMENT_TOTAL_BYTES = 60 * 1024 * 1024
MAX_ATTACHMENT_COUNT = 8
MAX_TTS_TEXT_CHARS = 8000
MIN_TTS_AUDIO_BYTES = 1024
TTS_CACHE_MAX_AGE_SECONDS = 24 * 60 * 60
SEND_CLIENT_DEDUPE_SECONDS = 10 * 60
SEND_CONTENT_DEDUPE_SECONDS = 8


class SyncodexError(Exception):
    """Base exception for expected bridge failures."""


class NotFoundError(SyncodexError):
    """Raised when a requested thread or resource does not exist."""


def utc_ms() -> int:
    return int(time.time() * 1000)


def normalize_windows_path(value: str | None) -> str:
    if not value:
        return ""
    if value.startswith("\\\\?\\"):
        return value[4:]
    return value


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                # Rollout files can be read while Codex is still writing the last line.
                continue
    return rows


def count_text_lines(path: Path) -> int:
    if not path.exists():
        return 0
    size = path.stat().st_size
    if size <= 0:
        return 0

    count = 0
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            count += chunk.count(b"\n")
        handle.seek(-1, os.SEEK_END)
        if handle.read(1) != b"\n":
            count += 1
    return count


def read_jsonl_tail(
    path: Path,
    *,
    max_lines: int = 1200,
    max_bytes: int = 1024 * 1024,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    size = path.stat().st_size
    if size <= 0:
        return rows

    read_size = min(size, max_bytes)
    with path.open("rb") as handle:
        handle.seek(size - read_size)
        data = handle.read(read_size)

    if read_size < size:
        first_newline = data.find(b"\n")
        data = b"" if first_newline < 0 else data[first_newline + 1 :]

    for raw_line in data.splitlines()[-max_lines:]:
        line = raw_line.decode("utf-8", errors="replace").strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def iter_jsonl_reverse(
    path: Path,
    *,
    chunk_size: int = 1024 * 1024,
    max_bytes: int | None = 32 * 1024 * 1024,
):
    if not path.exists() or path.stat().st_size <= 0:
        return

    with path.open("rb") as handle:
        position = handle.seek(0, os.SEEK_END)
        floor = max(0, position - max_bytes) if max_bytes else 0
        buffer = b""

        while position > floor:
            read_size = min(chunk_size, position - floor)
            position -= read_size
            handle.seek(position)
            data = handle.read(read_size) + buffer
            lines = data.split(b"\n")

            if position > floor:
                buffer = lines[0]
                lines = lines[1:]
            else:
                buffer = b""

            for raw_line in reversed(lines):
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue

        if buffer:
            line = buffer.decode("utf-8", errors="replace").strip()
            if line:
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    return


def content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if isinstance(item.get("text"), str):
                    parts.append(item["text"])
                elif isinstance(item.get("content"), str):
                    parts.append(item["content"])
                elif isinstance(item.get("input"), str):
                    parts.append(item["input"])
                elif isinstance(item.get("output"), str):
                    parts.append(item["output"])
        return "\n".join(part for part in parts if part)
    if isinstance(content, dict):
        for key in ("text", "content", "input", "output"):
            if isinstance(content.get(key), str):
                return content[key]
    return json.dumps(content, ensure_ascii=False)


def normalize_message_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def compact_text(value: str, limit: int = 160) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "…"


def normalize_client_message_id(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    text = re.sub(r"[^A-Za-z0-9:_.-]", "_", text)
    return text[:160]


def safe_attachment_name(value: str | None, fallback: str = "attachment") -> str:
    name = Path(str(value or fallback)).name.strip() or fallback
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    name = re.sub(r"\s+", " ", name).strip(" .") or fallback
    if len(name) > 120:
        stem = Path(name).stem[:80] or fallback
        suffix = Path(name).suffix[:20]
        name = f"{stem}{suffix}"
    return name


def decode_attachment_data(value: str) -> bytes:
    text = str(value or "").strip()
    if not text:
        return b""
    if "," in text and text[:80].lower().startswith("data:"):
        text = text.split(",", 1)[1]
    try:
        return base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise SyncodexError("Attachment data is not valid base64.") from exc


def normalize_attachment_record(item: dict[str, Any]) -> dict[str, Any] | None:
    path = normalize_windows_path(str(item.get("path") or "").strip())
    name = safe_attachment_name(str(item.get("name") or Path(path).name or "attachment"))
    if not path:
        return None
    mime_type = str(item.get("mimeType") or item.get("type") or mimetypes.guess_type(path)[0] or "").strip()
    try:
        size = int(item.get("size") or 0)
    except (TypeError, ValueError):
        size = 0
    is_image = bool(item.get("isImage")) or mime_type.startswith("image/")
    return {
        "id": str(item.get("id") or uuid.uuid4()),
        "name": name,
        "mimeType": mime_type,
        "size": max(0, size),
        "path": path,
        "isImage": is_image,
    }


def build_attachment_message_suffix(attachments: list[dict[str, Any]]) -> str:
    normalized = [item for item in (normalize_attachment_record(item) for item in attachments) if item]
    if not normalized:
        return ""
    lines = [
        "",
        "",
        "Syncodex attachments uploaded to this Windows machine. Use these absolute paths when you need to inspect them:",
    ]
    for index, item in enumerate(normalized, start=1):
        kind = "image" if item.get("isImage") else "file"
        size = int(item.get("size") or 0)
        size_text = f", {size} bytes" if size else ""
        lines.append(f"{index}. [{kind}] {item['name']} ({item['path']}{size_text})")
    return "\n".join(lines)


def count_cjk_chars(value: str) -> int:
    return sum(1 for char in value if "\u4e00" <= char <= "\u9fff")


def repair_mojibake_text(value: str | None) -> str:
    text = str(value or "")
    if not text or count_cjk_chars(text) > 0:
        return text

    best = text
    best_cjk_count = 0
    for source_encoding, target_encoding in (
        ("cp1252", "gbk"),
        ("latin1", "utf-8"),
        ("cp1252", "utf-8"),
    ):
        try:
            candidate = text.encode(source_encoding).decode(target_encoding)
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue

        cjk_count = count_cjk_chars(candidate)
        if cjk_count > best_cjk_count:
            best = candidate
            best_cjk_count = cjk_count

    return best if best_cjk_count >= 2 else text


@dataclass(frozen=True)
class ThreadRecord:
    id: str
    title: str
    cwd: str
    rollout_path: str
    created_at: int
    updated_at: int
    source: str
    model: str | None
    reasoning_effort: str | None
    agent_nickname: str | None

    def to_session(self) -> dict[str, Any]:
        project_id = project_id_for_path(self.cwd)
        codex_launch = {
            "modelId": self.model or "",
            "reasoningId": self.reasoning_effort or "",
            "profile": "",
        }
        return {
            "id": self.id,
            "session_id": self.id,
            "sessionId": self.id,
            "thread_id": self.id,
            "codexThreadId": self.id,
            "title": self.title or "(untitled Codex thread)",
            "name": self.title or "(untitled Codex thread)",
            "cwd": normalize_windows_path(self.cwd),
            "workspace": normalize_windows_path(self.cwd),
            "projectId": project_id,
            "projectPath": normalize_windows_path(self.cwd),
            "rollout_path": self.rollout_path,
            "created_at": self.created_at,
            "createdAt": seconds_to_iso(self.created_at),
            "updated_at": self.updated_at,
            "updatedAt": seconds_to_iso(self.updated_at),
            "lastEventAt": seconds_to_iso(self.updated_at),
            "source": self.source,
            "sourceKind": "official_codex_thread",
            "model": self.model,
            "reasoning_effort": self.reasoning_effort,
            "reasoningEffort": self.reasoning_effort,
            "codexLaunch": codex_launch,
            "thread": {
                "id": self.id,
                "threadId": self.id,
                "model": self.model,
                "reasoningEffort": self.reasoning_effort,
                "cwd": normalize_windows_path(self.cwd),
            },
            "agent_nickname": self.agent_nickname,
            "status": "waiting_input",
            "liveBusy": False,
            "eventCount": 0,
            "pendingApproval": None,
            "kind": "official-codex-thread",
        }


class CodexStateReader:
    def __init__(self, codex_home: Path = DEFAULT_CODEX_HOME) -> None:
        self.codex_home = codex_home
        self.state_db = codex_home / "state_5.sqlite"
        self.global_state = codex_home / ".codex-global-state.json"
        self.session_index = codex_home / "session_index.jsonl"
        self.sessions_dir = codex_home / "sessions"

    def health(self) -> dict[str, Any]:
        return {
            "codex_home": str(self.codex_home),
            "codex_home_exists": self.codex_home.exists(),
            "state_db": str(self.state_db),
            "state_db_exists": self.state_db.exists(),
            "global_state": str(self.global_state),
            "global_state_exists": self.global_state.exists(),
            "session_index": str(self.session_index),
            "session_index_exists": self.session_index.exists(),
            "sessions_dir": str(self.sessions_dir),
            "sessions_dir_exists": self.sessions_dir.exists(),
        }

    def _connect(self) -> sqlite3.Connection:
        if not self.state_db.exists():
            raise SyncodexError(f"Codex state database not found: {self.state_db}")
        db_path = self.state_db.resolve()
        uri = f"{db_path.as_uri()}?mode=ro"
        last_error: Exception | None = None

        for attempt in range(3):
            for target, use_uri in ((uri, True), (str(db_path), False)):
                try:
                    conn = sqlite3.connect(target, uri=use_uri, timeout=5.0)
                    conn.row_factory = sqlite3.Row
                    if not use_uri:
                        conn.execute("pragma query_only = on")
                    return conn
                except sqlite3.OperationalError as exc:
                    last_error = exc
            if attempt < 2:
                time.sleep(0.12 * (attempt + 1))

        detail = f": {last_error}" if last_error else ""
        raise SyncodexError(f"Unable to open Codex state database {db_path}{detail}")

    def list_threads(self, limit: int = 200) -> list[ThreadRecord]:
        display_names = self._read_session_index_names()
        try:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    select id, title, cwd, rollout_path, created_at, updated_at, source,
                           model, reasoning_effort, agent_nickname
                    from threads
                    where archived = 0
                      and id not in (select child_thread_id from thread_spawn_edges)
                      and source not like '%"subagent"%'
                      and source not like '%thread_spawn%'
                    order by updated_at desc
                    limit ?
                    """,
                    (limit,),
                ).fetchall()
        except SyncodexError:
            rows = []
        threads = [self._row_to_thread(row, display_names) for row in rows]
        thread_ids = {thread.id for thread in threads}
        threads.extend(self._list_rollout_threads(display_names, thread_ids, limit))
        threads.sort(key=lambda thread: thread.updated_at, reverse=True)
        return threads[:limit]

    def get_thread(self, thread_id: str) -> ThreadRecord:
        display_names = self._read_session_index_names()
        try:
            with self._connect() as conn:
                row = conn.execute(
                    """
                    select id, title, cwd, rollout_path, created_at, updated_at, source,
                           model, reasoning_effort, agent_nickname
                    from threads
                    where id = ?
                    """,
                    (thread_id,),
                ).fetchone()
        except SyncodexError:
            row = None
        if not row:
            rollout_thread = self._find_rollout_thread(thread_id, display_names)
            if rollout_thread:
                return rollout_thread
            raise NotFoundError(f"Codex thread not found: {thread_id}")
        return self._row_to_thread(row, display_names)

    def _list_rollout_threads(
        self,
        display_names: dict[str, str],
        exclude_ids: set[str],
        limit: int,
    ) -> list[ThreadRecord]:
        if not self.sessions_dir.exists():
            return []

        rollout_paths = sorted(
            self.sessions_dir.rglob("rollout-*.jsonl"),
            key=lambda path: path.stat().st_mtime if path.exists() else 0,
            reverse=True,
        )
        threads: list[ThreadRecord] = []
        for path in rollout_paths:
            if len(threads) >= limit:
                break
            thread = self._thread_from_rollout_path(path, display_names)
            if not thread or thread.id in exclude_ids:
                continue
            if "subagent" in thread.source.lower() or "thread_spawn" in thread.source.lower():
                continue
            threads.append(thread)
        return threads

    def _find_rollout_thread(
        self,
        thread_id: str,
        display_names: dict[str, str],
    ) -> ThreadRecord | None:
        if not self.sessions_dir.exists():
            return None
        for path in self.sessions_dir.rglob(f"rollout-*{thread_id}.jsonl"):
            thread = self._thread_from_rollout_path(path, display_names)
            if thread and thread.id == thread_id:
                return thread
        return None

    def _thread_from_rollout_path(
        self,
        path: Path,
        display_names: dict[str, str],
    ) -> ThreadRecord | None:
        metadata: dict[str, Any] = {}
        turn_context: dict[str, Any] = {}
        first_user_message = ""
        fallback_user_message = ""

        try:
            with path.open("r", encoding="utf-8", errors="replace") as handle:
                for line_index, line in enumerate(handle):
                    if line_index > 120 and first_user_message:
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    payload = row.get("payload")
                    payload = payload if isinstance(payload, dict) else {}
                    if row.get("type") == "session_meta":
                        metadata = payload
                    elif row.get("type") == "turn_context":
                        turn_context = payload
                    elif not first_user_message or not fallback_user_message:
                        user_message, is_primary = self._extract_user_message(row)
                        if is_primary and user_message and not first_user_message:
                            first_user_message = user_message
                        elif user_message and not fallback_user_message:
                            fallback_user_message = user_message
        except OSError:
            return None

        thread_id = str(metadata.get("id") or rollout_thread_id_from_path(path) or "").strip()
        if not thread_id:
            return None

        cwd = normalize_windows_path(str(metadata.get("cwd") or turn_context.get("cwd") or ""))
        if not cwd:
            return None

        source = str(metadata.get("source") or "rollout")
        title_message = first_user_message or fallback_user_message
        title = display_names.get(thread_id) or derive_session_title_from_message(title_message)
        stat = path.stat()
        created_at = iso_to_seconds(str(metadata.get("timestamp") or "")) or int(stat.st_ctime)
        updated_at = int(stat.st_mtime)

        return ThreadRecord(
            id=thread_id,
            title=repair_mojibake_text(title),
            cwd=cwd,
            rollout_path=str(path),
            created_at=created_at,
            updated_at=updated_at,
            source=source,
            model=str(turn_context.get("model") or "") or None,
            reasoning_effort=str(turn_context.get("effort") or "") or None,
            agent_nickname=None,
        )

    def _extract_user_message(self, row: dict[str, Any]) -> tuple[str, bool]:
        payload = row.get("payload")
        payload = payload if isinstance(payload, dict) else {}
        if row.get("type") == "event_msg" and payload.get("type") == "user_message":
            return str(payload.get("message") or ""), True
        if row.get("type") == "response_item" and payload.get("type") == "message" and payload.get("role") == "user":
            return content_to_text(payload.get("content")), False
        return "", False

    def _read_session_index_names(self) -> dict[str, str]:
        display_names: dict[str, str] = {}
        if not self.session_index.exists():
            return display_names

        try:
            with self.session_index.open("r", encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    thread_id = str(item.get("id") or "").strip()
                    thread_name = str(item.get("thread_name") or "").strip()
                    if thread_id and thread_name:
                        display_names[thread_id] = thread_name
        except OSError:
            return display_names

        return display_names

    def _row_to_thread(
        self,
        row: sqlite3.Row,
        display_names: dict[str, str] | None = None,
    ) -> ThreadRecord:
        title = (display_names or {}).get(row["id"]) or row["title"] or ""
        return ThreadRecord(
            id=row["id"],
            title=repair_mojibake_text(title),
            cwd=row["cwd"] or "",
            rollout_path=row["rollout_path"] or "",
            created_at=int(row["created_at"] or 0),
            updated_at=int(row["updated_at"] or 0),
            source=row["source"] or "",
            model=row["model"],
            reasoning_effort=row["reasoning_effort"],
            agent_nickname=repair_mojibake_text(row["agent_nickname"]) if row["agent_nickname"] else None,
        )

    def read_queued_followups(self) -> dict[str, list[dict[str, Any]]]:
        if not self.global_state.exists():
            return {}

        try:
            with self.global_state.open("r", encoding="utf-8", errors="replace") as handle:
                state = json.load(handle)
        except (OSError, json.JSONDecodeError):
            return {}

        source = state.get("queued-follow-ups")
        if not isinstance(source, dict):
            return {}

        queues: dict[str, list[dict[str, Any]]] = {}
        for thread_id, raw_items in source.items():
            normalized_thread_id = str(thread_id or "").strip()
            if not normalized_thread_id or not isinstance(raw_items, list):
                continue

            items: list[dict[str, Any]] = []
            for index, raw_item in enumerate(raw_items):
                if not isinstance(raw_item, dict):
                    continue
                item = self._normalize_queued_followup(normalized_thread_id, raw_item, index)
                if item:
                    items.append(item)

            if items:
                queues[normalized_thread_id] = items

        return queues

    def queued_followups_for_thread(self, thread_id: str) -> list[dict[str, Any]]:
        normalized_thread_id = str(thread_id or "").strip()
        if not normalized_thread_id:
            return []
        return self.read_queued_followups().get(normalized_thread_id, [])

    def _normalize_queued_followup(
        self,
        thread_id: str,
        item: dict[str, Any],
        index: int,
    ) -> dict[str, Any] | None:
        context = item.get("context")
        context = context if isinstance(context, dict) else {}
        text = str(item.get("text") or context.get("prompt") or "").strip()
        text = repair_mojibake_text(text)
        if not text:
            return None

        created_at_ms = item.get("createdAt")
        try:
            created_at_ms = int(created_at_ms)
        except (TypeError, ValueError):
            created_at_ms = 0

        item_id = str(item.get("id") or f"{thread_id}:official-queue:{index}").strip()
        cwd = normalize_windows_path(str(item.get("cwd") or "").strip())
        workspace_roots = context.get("workspaceRoots")
        if not isinstance(workspace_roots, list):
            workspace_roots = []

        return {
            "id": item_id,
            "threadId": thread_id,
            "sessionId": thread_id,
            "origin": "official_codex",
            "source": "official_codex",
            "label": "Codex",
            "text": text,
            "content": text,
            "cwd": cwd,
            "createdAtMs": created_at_ms,
            "createdAt": ms_to_iso(created_at_ms),
            "workspaceRoots": [
                normalize_windows_path(str(root or ""))
                for root in workspace_roots
                if str(root or "").strip()
            ],
        }


class RolloutParser:
    def __init__(self) -> None:
        self._summary_cache: dict[str, tuple[tuple[int, int], dict[str, Any]]] = {}

    def parse_thread(self, thread: ThreadRecord) -> list[dict[str, Any]]:
        path = Path(thread.rollout_path)
        rows = read_jsonl(path)
        timeline: list[dict[str, Any]] = []
        for index, row in enumerate(rows):
            item = self._parse_row(row, index, thread.id)
            if item:
                timeline.append(item)
        return timeline

    def _parse_row(
        self, row: dict[str, Any], index: int, thread_id: str
    ) -> dict[str, Any] | None:
        timestamp = row.get("timestamp")
        outer_type = row.get("type")
        payload = row.get("payload") or {}
        payload_type = payload.get("type")

        if outer_type == "session_meta":
            return {
                "id": f"{thread_id}:meta:{index}",
                "thread_id": thread_id,
                "timestamp": timestamp,
                "type": "system",
                "role": "system",
                "title": "Session started",
                "text": compact_text(payload.get("cwd") or "Codex session metadata"),
                "raw_type": outer_type,
                "payload": self._safe_payload(payload),
            }

        if outer_type == "event_msg":
            return {
                "id": f"{thread_id}:event:{index}",
                "thread_id": thread_id,
                "timestamp": timestamp,
                "type": "event",
                "role": "system",
                "title": payload_type or "event",
                "text": compact_text(json.dumps(payload, ensure_ascii=False), 300),
                "raw_type": outer_type,
                "payload": self._safe_payload(payload),
            }

        if outer_type != "response_item":
            return None

        if payload_type == "message":
            role = payload.get("role") or "unknown"
            if role in {"developer", "system"}:
                # Developer/system setup messages are huge and not useful in the phone UI.
                return None
            text = content_to_text(payload.get("content"))
            if not text:
                return None
            return {
                "id": f"{thread_id}:msg:{index}",
                "thread_id": thread_id,
                "timestamp": timestamp,
                "type": "message",
                "role": role,
                "title": role,
                "text": text,
                "content": text,
                "raw_type": outer_type,
                "payload": self._safe_payload(payload),
            }

        if payload_type == "function_call":
            name = payload.get("name") or "tool"
            arguments = payload.get("arguments") or ""
            return {
                "id": f"{thread_id}:tool-call:{index}",
                "thread_id": thread_id,
                "timestamp": timestamp,
                "type": "tool_call",
                "role": "tool",
                "title": name,
                "text": compact_text(arguments, 1200),
                "raw_type": outer_type,
                "payload": self._safe_payload(payload),
            }

        if payload_type == "function_call_output":
            output = payload.get("output") or ""
            return {
                "id": f"{thread_id}:tool-output:{index}",
                "thread_id": thread_id,
                "timestamp": timestamp,
                "type": "tool_output",
                "role": "tool",
                "title": "tool output",
                "text": compact_text(output, 1800),
                "raw_type": outer_type,
                "payload": self._safe_payload(payload),
            }

        return {
            "id": f"{thread_id}:response:{index}",
            "thread_id": thread_id,
            "timestamp": timestamp,
            "type": payload_type or "response_item",
            "role": payload.get("role") or "system",
            "title": payload_type or "response_item",
            "text": compact_text(json.dumps(payload, ensure_ascii=False), 600),
            "raw_type": outer_type,
            "payload": self._safe_payload(payload),
        }

    def _safe_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        text = json.dumps(payload, ensure_ascii=False)
        if len(text) > 8000:
            return {"truncated": True, "preview": text[:8000]}
        return payload

    def summarize_thread(self, thread: ThreadRecord) -> dict[str, Any]:
        path = Path(thread.rollout_path)
        if not path.exists():
            return {
                "status": "waiting_input",
                "liveBusy": False,
                "sourceRolloutHasOpenTurn": False,
                "eventCount": 0,
                "latestPlan": None,
                "hasTaskPlan": False,
                "lastAssistantContent": "",
                "lastCommand": "",
            }

        stat = path.stat()
        cache_key = (stat.st_mtime_ns, stat.st_size)
        cached = self._summary_cache.get(str(path))
        if cached and cached[0] == cache_key:
            return dict(cached[1])

        event_count = count_text_lines(path)
        status = "waiting_input"
        live_busy = False
        latest_plan: dict[str, Any] | None = None
        last_assistant_content = ""
        last_command = ""
        found_status = False
        found_plan = False
        found_assistant = False
        found_command = False
        current_turn_id = ""
        plan_search_closed = False

        for row in iter_jsonl_reverse(path):
            payload = row.get("payload")
            payload = payload if isinstance(payload, dict) else {}
            outer_type = str(row.get("type") or "")
            payload_type = str(payload.get("type") or "")

            if outer_type == "event_msg":
                if not found_status:
                    if payload_type == "task_started":
                        status = "running"
                        live_busy = True
                        found_status = True
                        current_turn_id = str(
                            payload.get("turn_id") or payload.get("turnId") or ""
                        ).strip()
                        plan_search_closed = True
                        if not found_plan:
                            found_plan = True
                    elif payload_type == "task_complete":
                        status = "waiting_input"
                        live_busy = False
                        found_status = True
                        current_turn_id = str(
                            payload.get("turn_id") or payload.get("turnId") or ""
                        ).strip()
                        plan_search_closed = True
                        if not found_plan:
                            found_plan = True
                    elif payload_type in {"turn_aborted", "error"}:
                        status = "failed"
                        live_busy = False
                        found_status = True
                        current_turn_id = str(
                            payload.get("turn_id") or payload.get("turnId") or ""
                        ).strip()
                        plan_search_closed = True
                        if not found_plan:
                            found_plan = True
                if not found_assistant and payload_type == "agent_message":
                    text = str(payload.get("message") or "").strip()
                    if text:
                        last_assistant_content = text
                        found_assistant = True
                if found_status and found_plan and found_assistant and (found_command or not live_busy):
                    break
                continue

            if outer_type != "response_item":
                if found_status and found_plan and found_assistant and (found_command or not live_busy):
                    break
                continue

            if not found_assistant and payload_type == "message" and payload.get("role") == "assistant":
                text = content_to_text(payload.get("content")).strip()
                if text:
                    last_assistant_content = text
                    found_assistant = True
                if found_status and found_plan and found_assistant and (found_command or not live_busy):
                    break
                continue

            if payload_type != "function_call":
                if found_status and found_plan and found_assistant and (found_command or not live_busy):
                    break
                continue

            name = str(payload.get("name") or "")
            if not found_command and name == "exec_command":
                args = self._parse_function_arguments(payload)
                command = str(args.get("cmd") or args.get("command") or "").strip()
                if command:
                    last_command = command
                    found_command = True
            elif not found_plan and not plan_search_closed and name == "update_plan":
                latest_plan = self._parse_plan_update(payload)
                if latest_plan:
                    found_plan = True

            if found_status and found_plan and found_assistant and (found_command or not live_busy):
                break

        if latest_plan and current_turn_id and not latest_plan.get("turnId"):
            latest_plan["turnId"] = current_turn_id

        summary = {
            "status": status,
            "liveBusy": live_busy,
            "sourceRolloutHasOpenTurn": live_busy,
            "eventCount": event_count,
            "latestPlan": latest_plan,
            "hasTaskPlan": bool(latest_plan and latest_plan.get("tasks")),
            "lastAssistantContent": compact_text(last_assistant_content, 500),
            "lastCommand": compact_text(last_command, 240),
        }
        self._summary_cache[str(path)] = (cache_key, summary)
        return dict(summary)

    def _parse_function_arguments(self, payload: dict[str, Any]) -> dict[str, Any]:
        raw = payload.get("arguments")
        if not isinstance(raw, str) or not raw.strip():
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    def _parse_plan_update(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        args = self._parse_function_arguments(payload)
        raw_plan = args.get("plan")
        if not isinstance(raw_plan, list):
            return None

        tasks: list[dict[str, str]] = []
        for index, item in enumerate(raw_plan):
            if not isinstance(item, dict):
                continue
            step = str(item.get("step") or "").strip()
            if not step:
                continue
            status = str(item.get("status") or "pending").strip() or "pending"
            if status not in {"pending", "in_progress", "completed"}:
                status = "pending"
            tasks.append(
                {
                    "id": str(item.get("id") or step or f"plan:{index}"),
                    "step": step,
                    "status": status,
                }
            )

        if not tasks:
            return None

        active_task = next((task for task in tasks if task["status"] == "in_progress"), None)
        if active_task is None:
            active_task = next((task for task in tasks if task["status"] == "pending"), None)
        completed_count = sum(1 for task in tasks if task["status"] == "completed")

        return {
            "turnId": str(
                payload.get("turn_id") or payload.get("turnId") or args.get("turn_id") or args.get("turnId") or ""
            ).strip(),
            "explanation": str(args.get("explanation") or "").strip(),
            "tasks": tasks,
            "activeTask": active_task,
            "completedCount": completed_count,
            "totalCount": len(tasks),
        }

    def raw_events(self, thread: ThreadRecord) -> list[dict[str, Any]]:
        path = Path(thread.rollout_path)
        raw_rows = read_jsonl(path)
        events: list[dict[str, Any]] = []
        for index, row in enumerate(raw_rows, start=1):
            event = dict(row)
            event = self._enrich_raw_event(event)
            event["seq"] = index
            event.setdefault("id", f"{thread.id}:raw:{index}")
            event["sessionId"] = thread.id
            event["session_id"] = thread.id
            events.append(event)
        events = self._remove_message_mirror_events(events)
        if os.environ.get("SYNCODEX_TIMELINE_MODE", "clean").strip().lower() != "raw":
            events = [event for event in events if self._is_clean_timeline_event(event)]
        return events

    def _is_clean_timeline_event(self, event: dict[str, Any]) -> bool:
        payload = event.get("payload")
        payload = payload if isinstance(payload, dict) else {}
        top_type = str(event.get("type") or "")
        payload_type = str(payload.get("type") or "")

        if top_type in {
            "message.user",
            "message.assistant",
            "message.assistant.start",
            "message.assistant.delta",
            "message.assistant.end",
            "reasoning",
            "reasoning.start",
            "reasoning.delta",
            "reasoning.end",
            "patch.end",
            "turn.started",
            "turn.completed",
            "turn.aborted",
            "error",
        }:
            return True

        if top_type == "response_item":
            if payload_type == "message":
                return str(payload.get("role") or "") in {"user", "assistant"}
            if payload_type == "reasoning":
                return True
            if payload_type == "function_call" and str(payload.get("name") or "") == "update_plan":
                return True
            return False

        if top_type == "event_msg":
            return payload_type in {
                "user_message",
                "agent_message",
                "patch_apply_end",
                "task_started",
                "task_complete",
                "turn_aborted",
                "error",
                "token_count",
            }

        return False

    def _remove_message_mirror_events(self, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        response_message_texts: set[tuple[str, str]] = set()
        for event in events:
            if event.get("type") != "response_item":
                continue
            payload = event.get("payload")
            if not isinstance(payload, dict) or payload.get("type") != "message":
                continue
            role = str(payload.get("role") or "")
            if role not in {"user", "assistant"}:
                continue
            text = normalize_message_text(content_to_text(payload.get("content")))
            if text:
                response_message_texts.add((role, text))

        filtered: list[dict[str, Any]] = []
        for event in events:
            payload = event.get("payload")
            if not isinstance(payload, dict) or event.get("type") != "event_msg":
                filtered.append(event)
                continue

            payload_type = payload.get("type")
            if payload_type == "user_message":
                text = normalize_message_text(str(payload.get("message") or ""))
                if ("user", text) in response_message_texts:
                    continue
            elif payload_type == "agent_message":
                text = normalize_message_text(str(payload.get("message") or ""))
                if ("assistant", text) in response_message_texts:
                    continue

            filtered.append(event)
        return filtered

    def _enrich_raw_event(self, event: dict[str, Any]) -> dict[str, Any]:
        payload = event.get("payload")
        if not isinstance(payload, dict) or payload.get("type") != "patch_apply_end":
            return event

        changes = payload.get("changes")
        if not isinstance(changes, dict):
            return event

        enriched_changes: dict[str, Any] = {}
        changed = False
        for file_path, change in changes.items():
            if not isinstance(change, dict):
                enriched_changes[file_path] = change
                continue

            next_change = dict(change)
            if "added" not in next_change or "removed" not in next_change:
                stats = count_unified_diff_stats(str(next_change.get("unified_diff") or ""))
                next_change.setdefault("added", stats["added"])
                next_change.setdefault("removed", stats["removed"])
                changed = True
            enriched_changes[file_path] = next_change

        if changed:
            event = dict(event)
            payload = dict(payload)
            payload["changes"] = enriched_changes
            event["payload"] = payload
        return event


class ThreadMessageSender:
    def __init__(self, script_path: Path | None = None, ipc_script_path: Path | None = None) -> None:
        root = Path(os.environ.get("SYNCODEX_BUNDLE_ROOT") or Path(__file__).resolve().parents[2])
        self.script_path = script_path or root / "scripts" / "codex_send_thread_message.js"
        self.ipc_script_path = ipc_script_path or root / "scripts" / "codex_send_thread_message_ipc.js"
        self.interrupt_script_path = root / "scripts" / "codex_interrupt_thread_ipc.js"
        self.create_script_path = root / "scripts" / "codex_create_thread_app_server.js"

    def send(
        self,
        thread: ThreadRecord,
        message: str,
        *,
        client_message_id: str = "",
    ) -> dict[str, Any]:
        message = message.strip()
        if not message:
            raise SyncodexError("Message cannot be empty.")
        client_message_id = normalize_client_message_id(client_message_id) or str(uuid.uuid4())

        sender_mode = os.environ.get("SYNCODEX_SENDER_TRANSPORT", "desktop-ipc").strip().lower()
        attempts: list[dict[str, Any]] = []
        fallback_modes = {"fallback", "app-server-fallback", "app_server_fallback"}

        if sender_mode not in {"app-server", "app_server", "legacy"}:
            ipc_result = self._run_sender(
                self.ipc_script_path,
                thread,
                message,
                timeout_seconds=45,
                extra_args=["--cwd", normalize_windows_path(thread.cwd)] if thread.cwd else [],
            )
            attempts.append(self._summarize_attempt("desktop-ipc", ipc_result))
            if ipc_result["status"] == "sent":
                return {
                    "client_message_id": client_message_id,
                    "eventId": client_message_id,
                    "desktopRefreshRequired": False,
                    "desktopSynchronized": True,
                    "attempts": attempts,
                    **ipc_result,
                }
            safe_fallback_reason = self._safe_ipc_fallback_reason(ipc_result)
            if safe_fallback_reason:
                app_server_result = self._run_sender_background(self.script_path, thread, message, timeout_seconds=1800)
                attempts.append(self._summarize_attempt("app-server", app_server_result))
                return {
                    "client_message_id": client_message_id,
                    "eventId": client_message_id,
                    "desktopRefreshRequired": app_server_result["status"] == "sent",
                    "desktopSynchronized": False,
                    "safeFallback": True,
                    "safeFallbackReason": safe_fallback_reason,
                    "attempts": attempts,
                    **app_server_result,
                }
            if sender_mode not in fallback_modes:
                return {
                    "client_message_id": client_message_id,
                    "eventId": client_message_id,
                    "desktopRefreshRequired": False,
                    "desktopSynchronized": False,
                    "fallbackSkipped": True,
                    "fallbackSkippedReason": "app-server fallback is disabled for normal sends to avoid duplicate turns",
                    "attempts": attempts,
                    **ipc_result,
                }

        app_server_result = self._run_sender_background(self.script_path, thread, message, timeout_seconds=1800)
        attempts.append(self._summarize_attempt("app-server", app_server_result))
        return {
            "client_message_id": client_message_id,
            "eventId": client_message_id,
            "desktopRefreshRequired": app_server_result["status"] == "sent",
            "desktopSynchronized": False,
            "attempts": attempts,
            **app_server_result,
        }

    def interrupt(self, thread: ThreadRecord) -> dict[str, Any]:
        script_path = self.interrupt_script_path
        if not script_path.exists():
            return {
                "thread_id": thread.id,
                "threadId": thread.id,
                "status": "failed",
                "error": f"Interrupt script is not implemented yet: {script_path}",
            }

        command = [
            "node",
            str(script_path),
            "--thread-id",
            thread.id,
            "--timeout-ms",
            "30000",
        ]
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            completed = subprocess.run(
                command,
                cwd=normalize_windows_path(thread.cwd) or None,
                text=True,
                capture_output=True,
                timeout=35,
                check=False,
                creationflags=creationflags,
            )
        except Exception as exc:
            return {
                "thread_id": thread.id,
                "threadId": thread.id,
                "status": "failed",
                "error": str(exc),
            }

        sender_payload = parse_sender_stdout(completed.stdout)
        status = "interrupted" if completed.returncode == 0 else "failed"
        return {
            "thread_id": thread.id,
            "threadId": thread.id,
            "status": status,
            "deliveryMode": sender_payload.get("deliveryMode") or script_path.stem,
            "returncode": completed.returncode,
            "stdout": completed.stdout[-4000:],
            "stderr": completed.stderr[-4000:],
            **sender_payload,
            "error": sender_payload.get("error") or (completed.stderr[-4000:] if status == "failed" else ""),
        }

    def create_thread(
        self,
        seed_thread: ThreadRecord | None,
        message: str,
        cwd: str = "",
        model: str = "",
        reasoning_effort: str = "",
    ) -> dict[str, Any]:
        message = message.strip()
        if not message:
            raise SyncodexError("First message cannot be empty.")
        if not self.create_script_path.exists():
            raise SyncodexError(f"Create thread script is missing: {self.create_script_path}")

        target_cwd = normalize_windows_path(cwd or (seed_thread.cwd if seed_thread else ""))
        if not target_cwd:
            raise SyncodexError("Project path is required.")
        target_model = str(model or (seed_thread.model if seed_thread else "") or "").strip()
        target_reasoning_effort = str(
            reasoning_effort or (seed_thread.reasoning_effort if seed_thread else "") or ""
        ).strip()

        command = [
            "node",
            str(self.create_script_path),
            "--cwd",
            target_cwd,
            "--message",
            message,
            "--timeout-ms",
            "1800000",
        ]
        if target_model:
            command.extend(["--model", target_model])
        if target_reasoning_effort:
            command.extend(["--effort", target_reasoning_effort])

        try:
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            proc = subprocess.Popen(
                command,
                cwd=target_cwd or None,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                creationflags=creationflags,
            )
            stdout_line = proc.stdout.readline() if proc.stdout else ""
        except Exception as exc:
            return {
                "thread_id": "",
                "threadId": "",
                "status": "failed",
                "deliveryMode": "official_app_server",
                "error": f"Codex app-server create thread failed to start: {exc}",
            }

        sender_payload = parse_sender_stdout(stdout_line)
        if not sender_payload:
            returncode = proc.poll()
            if returncode is None:
                try:
                    proc.terminate()
                except Exception:
                    pass
            return {
                "thread_id": "",
                "threadId": "",
                "status": "failed",
                "deliveryMode": "official_app_server",
                "returncode": returncode,
                "stdout": stdout_line[-4000:],
                "stderr": "",
                "error": "Codex app-server did not return a create-thread result.",
            }

        if proc.stdout:
            try:
                proc.stdout.close()
            except Exception:
                pass

        status = "created"
        return {
            "thread_id": sender_payload.get("threadId") or sender_payload.get("thread_id") or "",
            "threadId": sender_payload.get("threadId") or sender_payload.get("thread_id") or "",
            "session_id": sender_payload.get("sessionId") or sender_payload.get("session_id") or sender_payload.get("threadId") or "",
            "sessionId": sender_payload.get("sessionId") or sender_payload.get("session_id") or sender_payload.get("threadId") or "",
            "turn_id": sender_payload.get("turnId") or sender_payload.get("turn_id"),
            "turnId": sender_payload.get("turnId") or sender_payload.get("turn_id"),
            "status": sender_payload.get("status") or status,
            "deliveryMode": sender_payload.get("deliveryMode") or "official_app_server",
            "returncode": 0,
            "stdout": stdout_line[-4000:],
            "stderr": "",
            "backgroundPid": proc.pid,
            **sender_payload,
        }

    def _safe_ipc_fallback_reason(self, ipc_result: dict[str, Any]) -> str:
        error_text = " ".join(
            str(ipc_result.get(key) or "").strip()
            for key in ("error", "stderr", "stdout")
        ).lower()
        if not error_text:
            return ""
        if "no-client-found" in error_text or "no client found" in error_text:
            return "desktop IPC could not find a Codex client for this thread"
        return ""


    def _run_sender(
        self,
        script_path: Path,
        thread: ThreadRecord,
        message: str,
        timeout_seconds: int,
        extra_args: list[str],
    ) -> dict[str, Any]:
        if not script_path.exists():
            return {
                "thread_id": thread.id,
                "threadId": thread.id,
                "status": "failed",
                "error": f"Sender script is not implemented yet: {script_path}",
            }

        command = [
            "node",
            str(script_path),
            "--thread-id",
            thread.id,
            "--message",
            message,
            "--timeout-ms",
            str(timeout_seconds * 1000),
            *extra_args,
        ]
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            completed = subprocess.run(
                command,
                cwd=normalize_windows_path(thread.cwd) or None,
                text=True,
                capture_output=True,
                timeout=1800,
                check=False,
                creationflags=creationflags,
            )
        except Exception as exc:
            return {
                "thread_id": thread.id,
                "threadId": thread.id,
                "status": "failed",
                "error": str(exc),
            }

        status = "sent" if completed.returncode == 0 else "failed"
        sender_payload = parse_sender_stdout(completed.stdout)
        turn_id = sender_payload.get("turnId") or sender_payload.get("turn_id")
        stderr_tail = completed.stderr[-4000:]
        error_text = sender_payload.get("error") or ""
        if status == "failed" and not error_text and "no active turn to steer" in stderr_tail.lower():
            error_text = (
                "Codex desktop reported: no active turn to steer. "
                "Please wait for the current desktop state to settle, then send again."
            )
        return {
            "thread_id": thread.id,
            "threadId": thread.id,
            "turn_id": turn_id,
            "turnId": turn_id,
            "status": status,
            "deliveryMode": sender_payload.get("deliveryMode") or script_path.stem,
            "returncode": completed.returncode,
            "stdout": completed.stdout[-4000:],
            "stderr": stderr_tail,
            **sender_payload,
            "error": error_text,
        }

    def _run_sender_background(
        self,
        script_path: Path,
        thread: ThreadRecord,
        message: str,
        timeout_seconds: int,
    ) -> dict[str, Any]:
        if not script_path.exists():
            return {
                "thread_id": thread.id,
                "threadId": thread.id,
                "status": "failed",
                "error": f"Sender script is not implemented yet: {script_path}",
            }

        command = [
            "node",
            str(script_path),
            "--thread-id",
            thread.id,
            "--message",
            message,
            "--timeout-ms",
            str(timeout_seconds * 1000),
        ]
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            proc = subprocess.Popen(
                command,
                cwd=normalize_windows_path(thread.cwd) or None,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                creationflags=creationflags,
            )
            stdout_line = proc.stdout.readline() if proc.stdout else ""
        except Exception as exc:
            return {
                "thread_id": thread.id,
                "threadId": thread.id,
                "status": "failed",
                "error": str(exc),
            }

        sender_payload = parse_sender_stdout(stdout_line)
        if not sender_payload:
            returncode = proc.poll()
            if returncode is None:
                try:
                    proc.terminate()
                except Exception:
                    pass
            return {
                "thread_id": thread.id,
                "threadId": thread.id,
                "status": "failed",
                "deliveryMode": "official_app_server",
                "returncode": returncode,
                "stdout": stdout_line[-4000:],
                "stderr": "",
                "error": "Codex app-server did not accept the message.",
            }

        if proc.stdout:
            try:
                proc.stdout.close()
            except Exception:
                pass

        turn_id = sender_payload.get("turnId") or sender_payload.get("turn_id")
        return {
            "thread_id": thread.id,
            "threadId": thread.id,
            "turn_id": turn_id,
            "turnId": turn_id,
            "status": "sent",
            "deliveryMode": sender_payload.get("deliveryMode") or "official_app_server",
            "returncode": 0,
            "stdout": stdout_line[-4000:],
            "stderr": "",
            "backgroundPid": proc.pid,
            **sender_payload,
        }

    def _summarize_attempt(self, name: str, result: dict[str, Any]) -> dict[str, Any]:
        return {
            "transport": name,
            "status": result.get("status"),
            "deliveryMode": result.get("deliveryMode"),
            "returncode": result.get("returncode"),
            "error": result.get("error") or (result.get("stderr") or "").strip()[-500:],
        }


class SyncodexCore:
    def __init__(self, codex_home: Path = DEFAULT_CODEX_HOME) -> None:
        self.reader = CodexStateReader(codex_home)
        self.parser = RolloutParser()
        self.sender = ThreadMessageSender()
        tts_dir = os.environ.get("SYNCODEX_TTS_DIR")
        self.tts_dir = Path(tts_dir).expanduser() if tts_dir else codex_home / "syncodex_tts"
        self.tts_fallback_dir = Path(tempfile.gettempdir()) / "syncodex_tts"
        self.pending_created_sessions: dict[str, dict[str, Any]] = {}
        self._recent_send_lock = threading.RLock()
        self._recent_sends: dict[str, dict[str, Any]] = {}
        self._recent_send_locks: dict[str, threading.Lock] = {}
        self._forced_idle_sessions: dict[str, dict[str, Any]] = {}
        self._tts_lock = threading.RLock()
        self._tts_generation_locks: dict[str, threading.Lock] = {}

    def _send_dedupe_lock(self, dedupe_key: str) -> threading.Lock:
        with self._recent_send_lock:
            lock = self._recent_send_locks.get(dedupe_key)
            if lock is None:
                lock = threading.Lock()
                self._recent_send_locks[dedupe_key] = lock
            return lock

    def _log_send_event(self, event: str, **fields: Any) -> None:
        payload = {
            "event": event,
            "ts": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            **fields,
        }
        try:
            print("[syncodex-send] " + json.dumps(payload, ensure_ascii=False, sort_keys=True), flush=True)
        except Exception:
            print(f"[syncodex-send] {event} {fields}", flush=True)

    def _find_recent_send(
        self,
        keys: list[tuple[str, str, int]],
        now: float,
    ) -> dict[str, Any] | None:
        for kind, key, ttl_seconds in keys:
            recent = self._recent_sends.get(key)
            if not recent:
                continue
            recent_ttl = int(recent.get("ttlSeconds") or ttl_seconds)
            if now - float(recent.get("createdAt", 0)) < recent_ttl:
                result = dict(recent.get("result") or {})
                result["deduplicated"] = True
                result["dedupeKind"] = kind
                result["status"] = result.get("status") or "sent"
                return result
        return None

    def _remember_recent_send(
        self,
        keys: list[tuple[str, str, int]],
        result: dict[str, Any],
    ) -> None:
        now = time.time()
        for kind, key, ttl_seconds in keys:
            self._recent_sends[key] = {
                "kind": kind,
                "ttlSeconds": ttl_seconds,
                "createdAt": now,
                "result": dict(result),
            }

    def _iter_tts_dirs(self) -> list[Path]:
        roots: list[Path] = []
        for path in (self.tts_dir, self.tts_fallback_dir):
            expanded = Path(path).expanduser()
            if expanded not in roots:
                roots.append(expanded)
        return roots

    def _ensure_writable_tts_dir(self) -> Path:
        errors: list[str] = []
        for root in self._iter_tts_dirs():
            try:
                root.mkdir(parents=True, exist_ok=True)
                probe = root / f".syncodex-write-test-{uuid.uuid4().hex[:12]}.tmp"
                probe.write_text("ok", encoding="utf-8")
                try:
                    probe.unlink(missing_ok=True)
                except OSError:
                    pass
                self.tts_dir = root
                return root
            except OSError as exc:
                errors.append(f"{root}: {exc}")
        detail = " | ".join(errors)[-800:]
        raise SyncodexError(f"Cannot create writable TTS cache directory. {detail}")

    def _tts_digest_lock(self, digest: str) -> threading.Lock:
        key = str(digest or "").strip() or "default"
        with self._tts_lock:
            lock = self._tts_generation_locks.get(key)
            if lock is None:
                lock = threading.Lock()
                self._tts_generation_locks[key] = lock
            return lock

    def _prune_tts_cache(self) -> None:
        cutoff = time.time() - TTS_CACHE_MAX_AGE_SECONDS
        for root in self._iter_tts_dirs():
            try:
                if not root.exists():
                    continue
                for path in root.glob("*.wav"):
                    try:
                        if path.stat().st_mtime < cutoff:
                            path.unlink(missing_ok=True)
                    except OSError:
                        continue
            except OSError:
                continue

    def create_tts_audio(self, text: str) -> dict[str, Any]:
        source_text = str(text or "").strip()
        if not source_text:
            raise SyncodexError("TTS text cannot be empty.")
        if len(source_text) > MAX_TTS_TEXT_CHARS:
            source_text = source_text[:MAX_TTS_TEXT_CHARS]
        self._prune_tts_cache()
        digest = hashlib.sha256(source_text.encode("utf-8", errors="replace")).hexdigest()[:32]
        audio_name = f"{digest}.wav"
        text_name = f"{digest}.{uuid.uuid4().hex[:8]}.txt"
        for root in self._iter_tts_dirs():
            cached_audio_path = root / audio_name
            if cached_audio_path.exists() and cached_audio_path.stat().st_size >= MIN_TTS_AUDIO_BYTES:
                self.tts_dir = root
                return {
                    "ok": True,
                    "cached": True,
                    "audioUrl": f"/api/tts/audio/{audio_name}",
                    "mimeType": "audio/wav",
                    "bytes": cached_audio_path.stat().st_size,
                    "engine": "windows-system-speech",
                }

        write_root = self._ensure_writable_tts_dir()
        audio_path = write_root / audio_name
        text_path = write_root / text_name

        try:
            text_path.write_text(source_text, encoding="utf-8")
        except OSError as exc:
            raise SyncodexError(f"Cannot write TTS input file: {exc}") from exc
        errors: list[str] = []
        engines = [
            (
                "windows-sapi",
                (
                    "$ErrorActionPreference = 'Stop';"
                    "$text = Get-Content -LiteralPath $env:SYNCODEX_TTS_TEXT -Raw -Encoding UTF8;"
                    "$voice = New-Object -ComObject SAPI.SpVoice;"
                    "foreach ($token in @($voice.GetVoices())) {"
                    "  $desc = [string]$token.GetDescription();"
                    "  if ($desc -match 'Chinese|Huihui|Kangkang|Yaoyao|中文|China|zh-') {"
                    "    $voice.Voice = $token;"
                    "    break;"
                    "  }"
                    "}"
                    "$stream = New-Object -ComObject SAPI.SpFileStream;"
                    "$stream.Open($env:SYNCODEX_TTS_OUT, 3, $false);"
                    "$voice.AudioOutputStream = $stream;"
                    "[void]$voice.Speak($text, 0);"
                    "$stream.Close();"
                    "[void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($stream);"
                    "[void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($voice);"
                ),
            ),
            (
                "windows-system-speech",
                (
                    "$ErrorActionPreference = 'Stop';"
                    "Add-Type -AssemblyName System.Speech;"
                    "$text = Get-Content -LiteralPath $env:SYNCODEX_TTS_TEXT -Raw -Encoding UTF8;"
                    "$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer;"
                    "$speaker.Rate = 0;"
                    "$speaker.Volume = 100;"
                    "try {"
                    "  $voices = @($speaker.GetInstalledVoices() | Where-Object { $_.Enabled });"
                    "  foreach ($voice in $voices) {"
                    "    if ($voice.VoiceInfo.Culture.Name -like 'zh-*') {"
                    "      $speaker.SelectVoice($voice.VoiceInfo.Name);"
                    "      break;"
                    "    }"
                    "  }"
                    "} catch {}"
                    "$speaker.SetOutputToWaveFile($env:SYNCODEX_TTS_OUT);"
                    "$speaker.Speak($text);"
                    "$speaker.Dispose();"
                ),
            ),
        ]
        env = os.environ.copy()
        env["SYNCODEX_TTS_TEXT"] = str(text_path)
        env["SYNCODEX_TTS_OUT"] = str(audio_path)
        try:
            digest_lock = self._tts_digest_lock(digest)
            digest_lock.acquire()
            try:
                if audio_path.exists() and audio_path.stat().st_size >= MIN_TTS_AUDIO_BYTES:
                    return {
                        "ok": True,
                        "cached": True,
                        "audioUrl": f"/api/tts/audio/{audio_name}",
                        "mimeType": "audio/wav",
                        "bytes": audio_path.stat().st_size,
                        "engine": "windows-system-speech",
                    }
                for engine, script in engines:
                    try:
                        audio_path.unlink(missing_ok=True)
                    except OSError:
                        pass
                    try:
                        completed = subprocess.run(
                            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
                            text=True,
                            capture_output=True,
                            timeout=120,
                            check=False,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                            env=env,
                        )
                    except Exception as exc:
                        errors.append(f"{engine}: failed to start: {exc}")
                        continue

                    size = audio_path.stat().st_size if audio_path.exists() else 0
                    if completed.returncode == 0 and size >= MIN_TTS_AUDIO_BYTES:
                        return {
                            "ok": True,
                            "cached": False,
                            "audioUrl": f"/api/tts/audio/{audio_name}",
                            "mimeType": "audio/wav",
                            "bytes": size,
                            "engine": engine,
                        }
                    error_text = (completed.stderr or completed.stdout or "no audio was generated").strip()
                    if size:
                        error_text = f"{error_text} (generated {size} bytes)"
                    first_line = next((line.strip() for line in error_text.splitlines() if line.strip()), "")
                    errors.append(f"{engine}: {first_line[:260] or 'no audio was generated'}")
                    try:
                        audio_path.unlink(missing_ok=True)
                    except OSError:
                        pass
            finally:
                digest_lock.release()
        finally:
            try:
                text_path.unlink(missing_ok=True)
            except OSError:
                pass

        details = " | ".join(error for error in errors if error)[-1200:]
        raise SyncodexError(
            "Windows local speech is unavailable, so Syncodex could not generate audio. "
            "Browser speech fallback can still be used when the browser supports it. "
            f"Diagnostics: {details}"
        )

    def get_tts_audio_path(self, filename: str) -> Path:
        name = str(filename or "").strip()
        if not re.fullmatch(r"[0-9a-f]{32}\.wav", name):
            raise NotFoundError("TTS audio not found.")
        for root in self._iter_tts_dirs():
            path = (root / name).resolve()
            root_resolved = root.resolve()
            if root_resolved in path.parents and path.exists() and path.is_file():
                self.tts_dir = root_resolved
                return path
        raise NotFoundError("TTS audio not found.")

    def save_attachments(self, session_id: str, attachments: list[dict[str, Any]]) -> dict[str, Any]:
        thread = self.reader.get_thread(session_id)
        if not isinstance(attachments, list):
            raise SyncodexError("Attachments must be a list.")
        if len(attachments) > MAX_ATTACHMENT_COUNT:
            raise SyncodexError(f"Too many attachments. Maximum is {MAX_ATTACHMENT_COUNT}.")

        upload_root = self.reader.codex_home / "syncodex_uploads" / thread.id
        upload_root.mkdir(parents=True, exist_ok=True)

        saved: list[dict[str, Any]] = []
        total_bytes = 0
        stamp = time.strftime("%Y%m%d-%H%M%S", time.localtime())
        for index, item in enumerate(attachments, start=1):
            if not isinstance(item, dict):
                continue
            name = safe_attachment_name(str(item.get("name") or f"attachment-{index}"))
            mime_type = str(item.get("mimeType") or item.get("type") or mimetypes.guess_type(name)[0] or "").strip()
            data = decode_attachment_data(str(item.get("data") or item.get("base64") or ""))
            if not data:
                continue
            if len(data) > MAX_ATTACHMENT_BYTES:
                raise SyncodexError(f"Attachment is too large: {name}")
            total_bytes += len(data)
            if total_bytes > MAX_ATTACHMENT_TOTAL_BYTES:
                raise SyncodexError("Total attachment size is too large.")

            target_name = f"{stamp}-{index:02d}-{uuid.uuid4().hex[:8]}-{name}"
            target = (upload_root / target_name).resolve()
            if upload_root.resolve() not in target.parents:
                raise SyncodexError("Invalid attachment path.")
            target.write_bytes(data)
            path = str(target)
            saved.append(
                {
                    "id": str(item.get("id") or uuid.uuid4()),
                    "name": name,
                    "mimeType": mime_type,
                    "size": len(data),
                    "path": path,
                    "isImage": mime_type.startswith("image/"),
                }
            )

        return {"items": saved, "attachments": saved, "count": len(saved)}

    def health(self) -> dict[str, Any]:
        state = self.reader.health()
        sender_script = self.sender.script_path
        return {
            "ok": all(
                [
                    state["codex_home_exists"],
                    state["state_db_exists"],
                    state["sessions_dir_exists"],
                    sender_script.exists(),
                    self.sender.create_script_path.exists(),
                    shutil.which("node") is not None,
                    shutil.which("codex") is not None,
                ]
            ),
            "service": "syncodex-bridge",
            "time_ms": utc_ms(),
            "python": sys.version,
            "node": shutil.which("node"),
            "codex": shutil.which("codex"),
            "sender_script": str(sender_script),
            "sender_script_exists": sender_script.exists(),
            "desktop_ipc_sender_script": str(self.sender.ipc_script_path),
            "desktop_ipc_sender_script_exists": self.sender.ipc_script_path.exists(),
            "desktop_ipc_interrupt_script": str(self.sender.interrupt_script_path),
            "desktop_ipc_interrupt_script_exists": self.sender.interrupt_script_path.exists(),
            "create_thread_script": str(self.sender.create_script_path),
            "create_thread_script_exists": self.sender.create_script_path.exists(),
            **state,
        }

    def list_sessions(self) -> dict[str, Any]:
        sessions: list[dict[str, Any]] = []
        official_queues = self.reader.read_queued_followups()
        for thread in self.reader.list_threads():
            session = thread.to_session()
            session.update(self.parser.summarize_thread(thread))
            session = self._attach_official_queue(session, official_queues, include_items=False)
            session = self._apply_forced_idle(session)
            sessions.append(session)

        existing_ids = {str(session.get("id") or session.get("sessionId") or "") for session in sessions}
        for session_id, pending in list(self.pending_created_sessions.items()):
            if session_id in existing_ids:
                self.pending_created_sessions.pop(session_id, None)
                continue
            try:
                thread = self.reader.get_thread(session_id)
            except NotFoundError:
                sessions.append(dict(pending))
                continue

            session = thread.to_session()
            session.update(self.parser.summarize_thread(thread))
            session = self._attach_official_queue(session, official_queues, include_items=False)
            session = self._apply_forced_idle(session)
            sessions.append(session)
            self.pending_created_sessions.pop(session_id, None)

        return {"sessions": sessions, "items": sessions, "count": len(sessions)}

    def list_projects(self) -> dict[str, Any]:
        projects: dict[str, dict[str, Any]] = {}
        for thread in self.reader.list_threads():
            path = normalize_windows_path(thread.cwd)
            project_id = project_id_for_path(path)
            if project_id not in projects:
                projects[project_id] = {
                    "id": project_id,
                    "projectId": project_id,
                    "name": project_name_for_path(path),
                    "path": path,
                    "createdAt": seconds_to_iso(thread.created_at),
                    "updatedAt": seconds_to_iso(thread.updated_at),
                }
        items = list(projects.values())
        return {"items": items, "projects": items, "count": len(items)}

    def _get_project_seed_thread(self, project_id: str) -> ThreadRecord:
        project_id = str(project_id or "").strip()
        if not project_id:
            raise SyncodexError("Project id is required.")
        for thread in self.reader.list_threads():
            if project_id_for_path(thread.cwd) == project_id:
                return thread
        raise NotFoundError(f"Project not found: {project_id}")

    def _get_fallback_seed_thread(self) -> ThreadRecord:
        threads = self.reader.list_threads(limit=1)
        if not threads:
            raise NotFoundError("No Codex thread is available to inherit creation settings.")
        return threads[0]

    def create_session(
        self,
        project_id: str,
        message: str,
        cwd: str = "",
        model: str = "",
        reasoning_effort: str = "",
    ) -> dict[str, Any]:
        project_id = str(project_id or "").strip()
        target_cwd = normalize_windows_path(cwd)
        seed_thread: ThreadRecord | None = None
        if project_id:
            seed_thread = self._get_project_seed_thread(project_id)
        elif not target_cwd:
            raise SyncodexError("Project id or project path is required.")

        effective_cwd = target_cwd or normalize_windows_path(seed_thread.cwd if seed_thread else "")
        if not effective_cwd:
            raise SyncodexError("Project path is required.")
        cwd_path = Path(effective_cwd)
        if not cwd_path.exists() or not cwd_path.is_dir():
            raise SyncodexError(f"Project path does not exist: {cwd_path}")

        effective_model = str(model or (seed_thread.model if seed_thread else "") or "").strip()
        effective_reasoning_effort = str(
            reasoning_effort or (seed_thread.reasoning_effort if seed_thread else "") or ""
        ).strip()

        result = self.sender.create_thread(
            seed_thread,
            message,
            cwd=effective_cwd,
            model=effective_model,
            reasoning_effort=effective_reasoning_effort,
        )
        if result.get("returncode") not in (None, 0) or not result.get("threadId"):
            error = result.get("error") or result.get("stderr") or "Codex app-server failed to create a thread."
            raise SyncodexError(str(error).strip())

        thread_id = str(result.get("threadId") or result.get("thread_id") or "").strip()
        deadline = time.time() + 10
        last_error: Exception | None = None
        while time.time() < deadline:
            try:
                session = self.get_session(thread_id)
                session.update(
                    {
                        "createdBySyncodex": True,
                        "createResult": {
                            "turnId": result.get("turnId"),
                            "deliveryMode": result.get("deliveryMode"),
                            "elapsedMs": result.get("elapsedMs"),
                        },
                    }
                )
                return session
            except Exception as exc:
                last_error = exc
                time.sleep(0.25)

        pending_session = {
            "id": thread_id,
            "session_id": thread_id,
            "sessionId": thread_id,
            "thread_id": thread_id,
            "threadId": thread_id,
            "codexThreadId": thread_id,
            "title": derive_session_title_from_message(message),
            "name": derive_session_title_from_message(message),
            "cwd": effective_cwd,
            "workspace": effective_cwd,
            "projectId": project_id_for_path(effective_cwd),
            "projectPath": effective_cwd,
            "status": "running",
            "liveBusy": True,
            "source": "official_codex_thread",
            "sourceKind": "official_codex_thread",
            "model": effective_model,
            "reasoning_effort": effective_reasoning_effort,
            "reasoningEffort": effective_reasoning_effort,
            "createdBySyncodex": True,
            "pendingOfficialCreation": True,
            "pendingUserMessage": message,
            "createResult": result,
            "warning": str(last_error) if last_error else "Created thread is not visible in state database yet.",
        }
        self.pending_created_sessions[thread_id] = pending_session
        return dict(pending_session)

    def get_session(self, session_id: str) -> dict[str, Any]:
        try:
            thread = self.reader.get_thread(session_id)
        except NotFoundError:
            pending = self.pending_created_sessions.get(session_id)
            if pending:
                return dict(pending)
            raise

        session = thread.to_session()
        session.update(self.parser.summarize_thread(thread))
        session = self._attach_official_queue(session, include_items=True)
        session = self._apply_forced_idle(session)
        self.pending_created_sessions.pop(session_id, None)
        return session

    def _attach_official_queue(
        self,
        session: dict[str, Any],
        queues: dict[str, list[dict[str, Any]]] | None = None,
        *,
        include_items: bool = False,
    ) -> dict[str, Any]:
        session_id = str(session.get("sessionId") or session.get("id") or "").strip()
        if not session_id:
            return session

        source = queues if queues is not None else self.reader.read_queued_followups()
        items = list(source.get(session_id, []))
        session["officialQueueCount"] = len(items)
        session["officialQueuedFollowupCount"] = len(items)
        session["hasOfficialQueue"] = len(items) > 0
        if include_items:
            session["officialQueuedFollowUps"] = items
        elif items:
            session["officialQueuedFollowUpsPreview"] = items[:2]
        else:
            session["officialQueuedFollowUpsPreview"] = []
        return session

    def _apply_forced_idle(self, session: dict[str, Any]) -> dict[str, Any]:
        session_id = str(session.get("sessionId") or session.get("id") or "").strip()
        if not session_id:
            return session
        forced = self._forced_idle_sessions.get(session_id)
        if not forced:
            return session

        current_count = int(session.get("eventCount") or 0)
        stopped_at_count = int(forced.get("eventCount") or 0)
        if current_count > stopped_at_count:
            self._forced_idle_sessions.pop(session_id, None)
            return session

        next_session = dict(session)
        next_session.update(
            {
                "status": "waiting_input",
                "liveBusy": False,
                "sourceRolloutHasOpenTurn": False,
                "latestPlan": None,
                "hasTaskPlan": False,
                "stopStatus": "forced_idle",
                "stopMessage": forced.get("message") or "",
            }
        )
        return next_session

    def stop_session(self, session_id: str) -> dict[str, Any]:
        thread = self.reader.get_thread(session_id)
        session = thread.to_session()
        session.update(self.parser.summarize_thread(thread))
        interrupt_result = self.sender.interrupt(thread)
        interrupted = interrupt_result.get("status") == "interrupted" or interrupt_result.get("ok") is True
        self._forced_idle_sessions[thread.id] = {
            "eventCount": int(session.get("eventCount") or 0),
            "createdAt": time.time(),
            "message": (
                "Syncodex requested an official Codex interrupt."
                if interrupted
                else "Syncodex cleared the local busy state, but the official Codex interrupt failed."
            ),
        }
        session = self._attach_official_queue(session, include_items=True)
        stopped_session = self._apply_forced_idle(session)
        stopped_session.update(
            {
                "stopStatus": "official_interrupted" if interrupted else "forced_idle",
                "stopMessage": (
                    "Syncodex requested an official Codex interrupt."
                    if interrupted
                    else "Official Codex interrupt failed; Syncodex cleared only the local busy state."
                ),
                "stopResult": interrupt_result,
            }
        )
        return stopped_session

    def get_timeline(self, session_id: str) -> dict[str, Any]:
        try:
            thread = self.reader.get_thread(session_id)
        except NotFoundError:
            pending = self.pending_created_sessions.get(session_id)
            if not pending:
                raise
            raw_events = self._pending_session_events(pending)
            return {
                "session_id": session_id,
                "thread_id": session_id,
                "timeline": [],
                "items": raw_events,
                "messages": [],
                "count": 0,
                "afterCursor": raw_events[-1]["seq"] if raw_events else 0,
                "lastSeq": raw_events[-1]["seq"] if raw_events else 0,
                "nextCursor": raw_events[-1]["seq"] if raw_events else 0,
                "beforeCursor": raw_events[0]["seq"] if raw_events else 0,
                "hasMoreBefore": False,
                "hasMoreAfter": False,
            }

        timeline = self.parser.parse_thread(thread)
        raw_events = self.parser.raw_events(thread)
        return {
            "session_id": thread.id,
            "thread_id": thread.id,
            "timeline": timeline,
            "items": raw_events,
            "messages": [item for item in timeline if item.get("type") == "message"],
            "count": len(timeline),
            "afterCursor": raw_events[-1]["seq"] if raw_events else 0,
            "lastSeq": raw_events[-1]["seq"] if raw_events else 0,
            "nextCursor": raw_events[-1]["seq"] if raw_events else 0,
            "beforeCursor": raw_events[0]["seq"] if raw_events else 0,
            "hasMoreBefore": False,
            "hasMoreAfter": False,
        }

    def get_events(
        self,
        session_id: str,
        after: int = 0,
        before: int = 0,
        limit: int = 0,
    ) -> dict[str, Any]:
        try:
            thread = self.reader.get_thread(session_id)
            events = self.parser.raw_events(thread)
            resolved_session_id = thread.id
        except NotFoundError:
            pending = self.pending_created_sessions.get(session_id)
            if not pending:
                raise
            events = self._pending_session_events(pending)
            resolved_session_id = session_id

        if after > 0:
            events = [event for event in events if int(event.get("seq") or 0) > after]
        if before > 0:
            events = [event for event in events if int(event.get("seq") or 0) < before]
        has_more_before = False
        if limit > 0 and len(events) > limit:
            if before > 0:
                has_more_before = True
                events = events[-limit:]
            elif after <= 0:
                has_more_before = True
                events = events[-limit:]
            else:
                events = events[:limit]
        return {
            "session_id": resolved_session_id,
            "thread_id": resolved_session_id,
            "items": events,
            "count": len(events),
            "afterCursor": events[-1]["seq"] if events else after,
            "lastSeq": events[-1]["seq"] if events else after,
            "nextCursor": events[-1]["seq"] if events else after,
            "beforeCursor": events[0]["seq"] if events else before,
            "hasMoreBefore": has_more_before,
            "hasMoreAfter": False,
        }

    def _pending_session_events(self, session: dict[str, Any]) -> list[dict[str, Any]]:
        session_id = str(session.get("id") or session.get("sessionId") or "")
        timestamp = session.get("updatedAt") or session.get("createdAt") or seconds_to_iso(int(time.time()))
        turn_id = None
        create_result = session.get("createResult")
        if isinstance(create_result, dict):
            turn_id = create_result.get("turnId") or create_result.get("turn_id")
        message = str(session.get("pendingUserMessage") or session.get("title") or "").strip()
        events = [
            {
                "id": f"{session_id}:pending:user",
                "seq": 1,
                "timestamp": timestamp,
                "type": "event_msg",
                "payload": {
                    "type": "user_message",
                    "message": message,
                    "turn_id": turn_id,
                },
                "sessionId": session_id,
                "session_id": session_id,
            },
            {
                "id": f"{session_id}:pending:started",
                "seq": 2,
                "timestamp": timestamp,
                "type": "event_msg",
                "payload": {
                    "type": "task_started",
                    "turn_id": turn_id,
                    "pending_official_creation": True,
                },
                "sessionId": session_id,
                "session_id": session_id,
            },
        ]
        return events

    def send_message(
        self,
        session_id: str,
        message: str,
        attachments: list[dict[str, Any]] | None = None,
        client_message_id: str = "",
    ) -> dict[str, Any]:
        thread = self.reader.get_thread(session_id)
        client_message_id = normalize_client_message_id(client_message_id)
        normalized_message = str(message or "").strip()
        normalized_attachments = [
            item
            for item in (normalize_attachment_record(item) for item in (attachments or []))
            if item
        ]
        if normalized_attachments:
            normalized_message = f"{normalized_message}{build_attachment_message_suffix(normalized_attachments)}".strip()
        content_hash = hashlib.sha256(normalized_message.encode("utf-8", errors="replace")).hexdigest()
        content_dedupe_key = hashlib.sha256(
            f"{thread.id}\0content\0{normalized_message}".encode("utf-8", errors="replace")
        ).hexdigest()
        dedupe_keys: list[tuple[str, str, int]] = []
        if client_message_id:
            client_dedupe_key = hashlib.sha256(
                f"{thread.id}\0client\0{client_message_id}".encode("utf-8", errors="replace")
            ).hexdigest()
            dedupe_keys.append(("clientMessageId", client_dedupe_key, SEND_CLIENT_DEDUPE_SECONDS))
        dedupe_keys.append(("content", content_dedupe_key, SEND_CONTENT_DEDUPE_SECONDS))
        lock_key = dedupe_keys[0][1]
        now = time.time()
        with self._recent_send_lock:
            self._recent_sends = {
                key: value
                for key, value in self._recent_sends.items()
                if now - float(value.get("createdAt", 0)) < int(value.get("ttlSeconds") or 30)
            }
            result = self._find_recent_send(dedupe_keys, now)
            if result:
                self._log_send_event(
                    "deduplicated",
                    sessionId=thread.id,
                    clientMessageId=client_message_id,
                    dedupeKind=result.get("dedupeKind"),
                    contentHash=content_hash[:12],
                )
                return result

        self._log_send_event(
            "received",
            sessionId=thread.id,
            clientMessageId=client_message_id,
            contentHash=content_hash[:12],
            textBytes=len(normalized_message.encode("utf-8", errors="replace")),
            attachments=len(normalized_attachments),
        )

        send_lock = self._send_dedupe_lock(lock_key)
        if not send_lock.acquire(blocking=False):
            acquired_after_wait = send_lock.acquire(timeout=10)
            if acquired_after_wait:
                send_lock.release()
            now = time.time()
            with self._recent_send_lock:
                result = self._find_recent_send(dedupe_keys, now)
                if result:
                    self._log_send_event(
                        "deduplicated_after_wait",
                        sessionId=thread.id,
                        clientMessageId=client_message_id,
                        dedupeKind=result.get("dedupeKind"),
                        contentHash=content_hash[:12],
                    )
                    return result
            self._log_send_event(
                "deduplicated_inflight",
                sessionId=thread.id,
                clientMessageId=client_message_id,
                contentHash=content_hash[:12],
            )
            return {
                "ok": True,
                "status": "sent",
                "deduplicated": True,
                "client_message_id": client_message_id,
                "clientMessageId": client_message_id,
            }

        try:
            now = time.time()
            with self._recent_send_lock:
                result = self._find_recent_send(dedupe_keys, now)
                if result:
                    self._log_send_event(
                        "deduplicated_locked",
                        sessionId=thread.id,
                        clientMessageId=client_message_id,
                        dedupeKind=result.get("dedupeKind"),
                        contentHash=content_hash[:12],
                    )
                    return result

            result = self.sender.send(thread, normalized_message, client_message_id=client_message_id)
            result.setdefault("client_message_id", client_message_id)
            result.setdefault("clientMessageId", client_message_id)
            with self._recent_send_lock:
                self._remember_recent_send(dedupe_keys, result)
            self._log_send_event(
                "submitted",
                sessionId=thread.id,
                clientMessageId=client_message_id,
                contentHash=content_hash[:12],
                status=result.get("status"),
                deliveryMode=result.get("deliveryMode"),
                deduplicated=bool(result.get("deduplicated")),
            )
            return result
        finally:
            send_lock.release()

    def get_codex_status(self, session_id: str = "", thread_id: str = "") -> dict[str, Any]:
        target_id = thread_id or session_id
        if not target_id:
            return {
                "ok": True,
                "status": "available",
                "mode": "official-thread-bridge",
                "host": "local",
            }

        thread = self.reader.get_thread(target_id)
        session = thread.to_session()
        return {
            "ok": True,
            "status": "available",
            "mode": "official-thread-bridge",
            "host": "local",
            "thread": session["thread"],
            "codexLaunch": session["codexLaunch"],
        }


def seconds_to_iso(value: int) -> str | None:
    if not value:
        return None
    try:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(value))
    except Exception:
        return None


def ms_to_iso(value: int) -> str | None:
    if not value:
        return None
    try:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(value / 1000))
    except Exception:
        return None


def iso_to_seconds(value: str) -> int | None:
    value = str(value or "").strip()
    if not value:
        return None
    try:
        normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
        return int(datetime.fromisoformat(normalized).timestamp())
    except Exception:
        return None


def rollout_thread_id_from_path(path: Path) -> str:
    match = re.search(
        r"rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-([0-9a-fA-F-]{36})\.jsonl$",
        path.name,
    )
    return match.group(1) if match else ""


def project_id_for_path(path: str | None) -> str:
    normalized = normalize_windows_path(path).strip().lower()
    if not normalized:
        return "codex-default"
    digest = hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]
    return f"codex-{digest}"


def project_name_for_path(path: str | None) -> str:
    normalized = normalize_windows_path(path).rstrip("\\/")
    if not normalized:
        return "Codex"
    name = Path(normalized).name
    return name or normalized


def derive_session_title_from_message(message: str) -> str:
    title = normalize_message_text(message)
    if not title:
        return "(untitled Codex thread)"
    return compact_text(title, 40)


def count_unified_diff_stats(diff_text: str) -> dict[str, int]:
    added = 0
    removed = 0
    for line in diff_text.splitlines():
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            added += 1
        elif line.startswith("-"):
            removed += 1
    return {"added": added, "removed": removed}


def parse_sender_stdout(stdout: str) -> dict[str, Any]:
    for line in reversed(str(stdout or "").splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return {}
