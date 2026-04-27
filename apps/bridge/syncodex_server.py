from __future__ import annotations

import argparse
import json
import mimetypes
import os
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

from syncodex_core import NotFoundError, SyncodexCore, SyncodexError


ROOT = Path(os.environ.get("SYNCODEX_BUNDLE_ROOT") or Path(__file__).resolve().parents[2])
WEB_ROOT = ROOT / "package" / "web"


class SyncodexHandler(BaseHTTPRequestHandler):
    core: SyncodexCore

    server_version = "SyncodexBridge/0.1"

    def do_GET(self) -> None:
        try:
            self._handle_get()
        except Exception as exc:
            self._handle_exception(exc)

    def do_POST(self) -> None:
        try:
            self._handle_post()
        except Exception as exc:
            self._handle_exception(exc)

    def _handle_get(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path in {"/api/health", "/health"}:
            return self._json(200, self.core.health())
        if path == "/api/projects":
            return self._json(200, self.core.list_projects())
        if path == "/api/local-file":
            query = parse_qs(parsed.query)
            requested_path = query.get("path", [""])[0]
            return self._local_file(self.core.get_local_file_path(requested_path))
        if path == "/api/projects/browse":
            query = parse_qs(parsed.query)
            current = query.get("path", [""])[0]
            return self._json(
                200,
                {"currentPath": current, "parentPath": "", "items": []},
            )
        if path == "/api/sessions":
            return self._json(200, self.core.list_sessions())
        if path == "/api/codex/mode":
            return self._json(
                200,
                {
                    "mode": "official-thread-bridge",
                    "executionMode": "official-thread-bridge",
                    "readonly": False,
                    "supportsNewSession": True,
                    "supportsImport": False,
                },
            )
        if path == "/api/codex/quota":
            return self._json(200, {"available": True, "source": "official-codex"})
        if path == "/api/codex/status":
            query = parse_qs(parsed.query)
            session_id = query.get("sessionId", [""])[0]
            thread_id = query.get("threadId", [""])[0]
            return self._json(200, self.core.get_codex_status(session_id, thread_id))
        if path == "/api/codex/hosts":
            return self._json(200, {"items": [{"id": "local", "label": "Local Codex"}]})
        if path == "/api/codex/importable-sessions":
            return self._json(200, {"items": []})

        parts = [unquote(part) for part in path.split("/") if part]
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "tts" and parts[2] == "audio":
            return self._audio_file(self.core.get_tts_audio_path(parts[3]))
        if len(parts) >= 3 and parts[0] == "api" and parts[1] == "sessions":
            session_id = parts[2]
            if len(parts) == 3:
                return self._json(200, self.core.get_session(session_id))
            if len(parts) == 4 and parts[3] == "timeline":
                query = parse_qs(parsed.query)
                return self._json(200, self.core.get_events(session_id, **self._event_query(query)))
            if len(parts) == 4 and parts[3] == "events":
                query = parse_qs(parsed.query)
                return self._json(200, self.core.get_events(session_id, **self._event_query(query)))
            if len(parts) == 4 and parts[3] == "messages":
                timeline = self.core.get_timeline(session_id)
                return self._json(
                    200,
                    {
                        "session_id": session_id,
                        "thread_id": session_id,
                        "messages": timeline["messages"],
                        "items": timeline["messages"],
                    },
                )

        return self._static(path)

    def _handle_post(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path == "/api/tts":
            body = self._read_json_body()
            text = body.get("text") or body.get("content") or ""
            return self._json(200, self.core.create_tts_audio(str(text)))

        if path == "/api/sessions":
            body = self._read_json_body()
            message = (
                body.get("message")
                or body.get("text")
                or body.get("content")
                or body.get("prompt")
                or ""
            )
            project_id = str(body.get("projectId") or body.get("project_id") or "").strip()
            cwd = str(body.get("cwd") or body.get("projectPath") or body.get("path") or "").strip()
            model = str(body.get("modelId") or body.get("model") or "").strip()
            reasoning_effort = str(
                body.get("reasoningId")
                or body.get("reasoningEffort")
                or body.get("effort")
                or ""
            ).strip()
            return self._json(
                200,
                self.core.create_session(
                    project_id,
                    str(message),
                    cwd=cwd,
                    model=model,
                    reasoning_effort=reasoning_effort,
                ),
            )

        parts = [unquote(part) for part in path.split("/") if part]
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "sessions" and parts[3] == "stop":
            return self._json(200, self.core.stop_session(parts[2]))
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "sessions" and parts[3] == "attachments":
            body = self._read_json_body()
            attachments = body.get("attachments") or body.get("files") or []
            return self._json(200, self.core.save_attachments(parts[2], attachments))
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "sessions" and parts[3] == "messages":
            body = self._read_json_body()
            message = (
                body.get("message")
                or body.get("text")
                or body.get("content")
                or body.get("prompt")
                or ""
            )
            attachments = body.get("attachments") or []
            client_message_id = (
                body.get("clientMessageId")
                or body.get("client_message_id")
                or body.get("eventId")
                or ""
            )
            result = self.core.send_message(
                parts[2],
                str(message),
                attachments=attachments,
                client_message_id=str(client_message_id),
            )
            if result.get("status") == "failed":
                message_text = (
                    result.get("error")
                    or str(result.get("stderr") or "").strip()
                    or "Codex did not accept the message."
                )
                return self._json(
                    400,
                    {
                        "error": "send_failed",
                        "message": message_text,
                        "result": result,
                    },
                )
            return self._json(200, result)
        return self._json(404, {"error": "not_found"})

    def _event_query(self, query: dict[str, list[str]]) -> dict[str, int]:
        def as_int(name: str) -> int:
            try:
                return int(query.get(name, ["0"])[0] or "0")
            except ValueError:
                return 0

        return {"after": as_int("after"), "before": as_int("before"), "limit": as_int("limit")}

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _static(self, path: str) -> None:
        if path == "/":
            path = "/index.html"
        relative = path.lstrip("/")
        target = (WEB_ROOT / relative).resolve()
        web_root = WEB_ROOT.resolve()
        if web_root not in target.parents and target != web_root:
            return self._json(403, {"error": "forbidden"})
        if not target.exists() or not target.is_file():
            return self._json(404, {"error": "not_found"})
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type == "application/javascript":
            content_type = f"{content_type}; charset=utf-8"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _audio_file(self, path: Path) -> None:
        file_size = path.stat().st_size
        range_header = str(self.headers.get("Range") or "").strip()
        if range_header.startswith("bytes="):
            range_value = range_header.removeprefix("bytes=").split(",", 1)[0].strip()
            start_text, _, end_text = range_value.partition("-")
            try:
                start = int(start_text) if start_text else 0
                end = int(end_text) if end_text else file_size - 1
                start = max(0, min(start, file_size - 1))
                end = max(start, min(end, file_size - 1))
            except ValueError:
                start, end = 0, file_size - 1
            length = end - start + 1
            with path.open("rb") as handle:
                handle.seek(start)
                data = handle.read(length)
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        else:
            data = path.read_bytes()
            self.send_response(200)
            length = len(data)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "public, max-age=604800")
        self.end_headers()
        self.wfile.write(data)

    def _local_file(self, path: Path) -> None:
        file_size = path.stat().st_size
        content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {
            "application/javascript",
            "application/json",
            "application/xml",
        }:
            content_type = f"{content_type}; charset=utf-8"

        filename = path.name or "download"
        encoded_name = quote(filename)

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(file_size))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Disposition", f"inline; filename*=UTF-8''{encoded_name}")
        self.send_header("X-Syncodex-Local-File", "1")
        self.end_headers()

        with path.open("rb") as handle:
            while True:
                chunk = handle.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def _json(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _handle_exception(self, exc: Exception) -> None:
        if isinstance(exc, NotFoundError):
            return self._json(404, {"error": "not_found", "message": str(exc)})
        if isinstance(exc, SyncodexError):
            return self._json(400, {"error": "syncodex_error", "message": str(exc)})
        error_log = getattr(self.server, "syncodex_error_log", None)
        if callable(error_log):
            error_log(traceback.format_exc())
        else:
            traceback.print_exc()
        return self._json(500, {"error": "internal_error", "message": str(exc)})

    def log_message(self, format: str, *args) -> None:
        message = "%s - %s" % (self.address_string(), format % args)
        access_log = getattr(self.server, "syncodex_access_log", None)
        if callable(access_log):
            access_log(message)
        else:
            print(message)


def create_server(
    host: str,
    port: int,
    *,
    codex_home: str | Path | None = None,
    access_log=None,
    error_log=None,
) -> ThreadingHTTPServer:
    codex_home = Path(codex_home).expanduser() if codex_home else None
    SyncodexHandler.core = SyncodexCore(codex_home=codex_home) if codex_home else SyncodexCore()
    server = ThreadingHTTPServer((host, port), SyncodexHandler)
    server.syncodex_access_log = access_log  # type: ignore[attr-defined]
    server.syncodex_error_log = error_log  # type: ignore[attr-defined]
    return server


def serve(
    host: str,
    port: int,
    *,
    codex_home: str | Path | None = None,
    access_log=None,
    error_log=None,
) -> int:
    server = create_server(
        host,
        port,
        codex_home=codex_home,
        access_log=access_log,
        error_log=error_log,
    )
    print(f"Syncodex bridge listening on http://{host}:{port}")
    print(f"Web root: {WEB_ROOT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping Syncodex bridge.")
        return 0
    finally:
        server.server_close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("SYNCODEX_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("SYNCODEX_PORT", "8765")))
    parser.add_argument("--codex-home", default=os.environ.get("CODEX_HOME"))
    args = parser.parse_args()

    return serve(args.host, args.port, codex_home=args.codex_home)


if __name__ == "__main__":
    raise SystemExit(main())
