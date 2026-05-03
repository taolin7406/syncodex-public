from __future__ import annotations

import html
import io
import json
import os
import re
import secrets
import socket
import subprocess
import threading
import time
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from urllib.request import ProxyHandler, Request, build_opener, urlretrieve


CLOUDFLARED_DOWNLOAD_URL = (
    "https://github.com/cloudflare/cloudflared/releases/latest/download/"
    "cloudflared-windows-amd64.exe"
)
TOKEN_QUERY_NAMES = {"syncodex_token", "access", "token"}
ACCESS_COOKIE_NAME = "syncodex_access"
ACCESS_COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60
LOCAL_OPENER = build_opener(ProxyHandler({}))


class MobileAccessError(Exception):
    """Raised when the public mobile access tunnel cannot be started."""


class AuthProxyHandler(BaseHTTPRequestHandler):
    target_host: str = "127.0.0.1"
    target_port: int = 8765
    token: str = ""

    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:
        self._handle_proxy()

    def do_POST(self) -> None:
        self._handle_proxy()

    def do_PATCH(self) -> None:
        self._handle_proxy()

    def do_DELETE(self) -> None:
        self._handle_proxy()

    def do_HEAD(self) -> None:
        self._handle_proxy()

    def _handle_proxy(self) -> None:
        token_ok, should_redirect = self._authenticate()
        if not token_ok:
            return self._forbidden()

        if should_redirect and self.command == "GET":
            return self._redirect_without_token()

        return self._proxy_request()

    def _authenticate(self) -> tuple[bool, bool]:
        parsed = urlparse(self.path)
        query_token = ""
        for name, value in parse_qsl(parsed.query, keep_blank_values=True):
            if name in TOKEN_QUERY_NAMES and value:
                query_token = value
                break

        if secrets.compare_digest(query_token, self.token):
            return True, True

        cookie_header = self.headers.get("Cookie") or ""
        for chunk in cookie_header.split(";"):
            name, _, value = chunk.strip().partition("=")
            if name == ACCESS_COOKIE_NAME and secrets.compare_digest(value, self.token):
                return True, False

        return False, False

    def _redirect_without_token(self) -> None:
        parsed = urlparse(self.path)
        query = urlencode(
            [
                (name, value)
                for name, value in parse_qsl(parsed.query, keep_blank_values=True)
                if name not in TOKEN_QUERY_NAMES
            ]
        )
        target = urlunparse(("", "", parsed.path or "/", parsed.params, query, parsed.fragment))
        self.send_response(HTTPStatus.FOUND)
        self.send_header("Location", target or "/")
        self._send_access_cookie()
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _send_access_cookie(self) -> None:
        self.send_header(
            "Set-Cookie",
            (
                f"{ACCESS_COOKIE_NAME}={self.token}; Path=/; "
                f"Max-Age={ACCESS_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax"
            ),
        )

    def _forbidden(self) -> None:
        body = (
            "<!doctype html><meta charset='utf-8'>"
            "<title>Syncodex</title>"
            "<style>body{font-family:system-ui,sans-serif;margin:2rem;line-height:1.5}"
            "code{background:#f3f3f3;padding:.2rem .35rem;border-radius:.35rem}</style>"
            "<h1>Syncodex 手机访问未授权</h1>"
            "<p>请从电脑端 Syncodex 的二维码或访问链接重新打开。</p>"
        ).encode("utf-8")
        self.send_response(HTTPStatus.FORBIDDEN)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _proxy_request(self, *, strip_access_token: bool = False) -> None:
        body = None
        if self.command in {"POST", "PUT", "PATCH", "DELETE"}:
            length = int(self.headers.get("Content-Length") or "0")
            body = self.rfile.read(length) if length > 0 else b""

        target_path = self._path_without_access_token() if strip_access_token else self.path
        target_url = f"http://{self.target_host}:{self.target_port}{target_path}"
        request = Request(target_url, data=body, method=self.command)
        for key, value in self.headers.items():
            lowered = key.lower()
            if lowered in {
                "host",
                "connection",
                "content-length",
                "accept-encoding",
                "proxy-connection",
                "upgrade",
            }:
                continue
            request.add_header(key, value)

        try:
            with LOCAL_OPENER.open(request, timeout=60) as response:
                data = response.read()
                self.send_response(response.status)
                self._copy_response_headers(response.headers.items(), len(data))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(data)
        except HTTPError as exc:
            data = exc.read()
            self.send_response(exc.code)
            self._copy_response_headers(exc.headers.items(), len(data))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)
        except (OSError, URLError) as exc:
            payload = f"Syncodex local service is unavailable: {exc}".encode("utf-8")
            self.send_response(HTTPStatus.BAD_GATEWAY)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    def _path_without_access_token(self) -> str:
        parsed = urlparse(self.path)
        query = urlencode(
            [
                (name, value)
                for name, value in parse_qsl(parsed.query, keep_blank_values=True)
                if name not in TOKEN_QUERY_NAMES
            ]
        )
        return urlunparse(("", "", parsed.path or "/", parsed.params, query, parsed.fragment))

    def _copy_response_headers(self, headers: object, content_length: int) -> None:
        blocked = {
            "connection",
            "content-length",
            "transfer-encoding",
            "content-encoding",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailer",
            "upgrade",
        }
        for key, value in headers:
            if key.lower() in blocked:
                continue
            self.send_header(key, value)
        self._send_access_cookie()
        self.send_header("Content-Length", str(content_length))

    def log_message(self, format: str, *args: object) -> None:
        return


class MobileAccessController:
    def __init__(self, runtime_dir: Path, target_host: str, target_port: int) -> None:
        self.runtime_dir = runtime_dir
        self.target_host = target_host
        self.target_port = target_port
        self.proxy_server: ThreadingHTTPServer | None = None
        self.proxy_thread: threading.Thread | None = None
        self.proxy_port = 0
        self.cloudflared_process: subprocess.Popen[str] | None = None
        self.public_url = ""
        self.mobile_url = ""
        self.token = ""
        self.last_error = ""
        self.status = "stopped"
        self.started_at: float | None = None
        self.download_status = "idle"
        self.download_detail = ""
        self.download_received = 0
        self.download_total = 0
        self.status_server: ThreadingHTTPServer | None = None
        self.status_thread: threading.Thread | None = None
        self.status_port = 0
        self._lock = threading.RLock()
        self._url_event = threading.Event()

    def is_running(self) -> bool:
        process = self.cloudflared_process
        if self.mobile_url and process and process.poll() is None:
            return True
        return bool(
            self.mobile_url
            and self.proxy_server
            and self.proxy_port
            and self._find_cloudflared_pid_for_proxy_port(self.proxy_port)
        )

    @property
    def status_url(self) -> str:
        self._ensure_status_server()
        return f"http://127.0.0.1:{self.status_port}/"

    def start(self, *, open_page: bool = True) -> str:
        self._ensure_status_server()
        with self._lock:
            if self.is_running():
                if open_page:
                    self.open_access_page()
                return self.mobile_url

            self.last_error = ""
            self.status = "starting"
            self.started_at = None
            saved = self._load_persisted_state()
            self.token = str(saved.get("token") or "") or secrets.token_urlsafe(24)
            try:
                saved_proxy_port = int(saved.get("proxyPort") or 0)
            except (TypeError, ValueError):
                saved_proxy_port = 0
            saved_public_url = str(saved.get("publicUrl") or "").strip().rstrip("/")
            try:
                if (
                    saved_proxy_port
                    and saved_public_url
                    and self._find_cloudflared_pid_for_proxy_port(saved_proxy_port)
                ):
                    self._start_proxy(preferred_port=saved_proxy_port)
                    self.public_url = saved_public_url
                    self.mobile_url = f"{self.public_url}/?syncodex_token={self.token}"
                    self.status = "running"
                    self.started_at = time.time()
                    self._url_event.set()
                    self._save_persisted_state()
                    self._write_access_page()
                    if open_page:
                        self.open_access_page()
                    return self.mobile_url

                self._stop_components_locked(clear_status=False, clear_state=False)
                self.token = str(saved.get("token") or "") or self.token or secrets.token_urlsafe(24)
                self._start_proxy(preferred_port=saved_proxy_port)
                cloudflared = self._ensure_cloudflared()
                self._start_cloudflared(cloudflared)
            except Exception as exc:
                self.last_error = str(exc)
                self.status = "failed"
                self._stop_components_locked(clear_status=False, clear_state=False)
                raise MobileAccessError(str(exc)) from exc

        if not self._url_event.wait(timeout=45):
            with self._lock:
                self.last_error = "启动公网隧道超时，请稍后重试。"
                self.status = "failed"
                self._stop_components_locked(clear_status=False, clear_state=False)
            raise MobileAccessError("启动公网隧道超时，请稍后重试。")

        with self._lock:
            if not self.mobile_url:
                error = self.last_error or "没有获取到公网访问地址。"
                self.status = "failed"
                self._stop_components_locked(clear_status=False, clear_state=False)
                raise MobileAccessError(error)
            self.status = "running"
            self.started_at = time.time()
            self._save_persisted_state()
            self._write_access_page()
            if open_page:
                self.open_access_page()
            return self.mobile_url

    def resume_existing(self) -> str:
        self._ensure_status_server()
        with self._lock:
            if self.is_running():
                self._append_mobile_log("resume_existing: already running")
                return self.mobile_url

            saved = self._load_persisted_state()
            try:
                saved_proxy_port = int(saved.get("proxyPort") or 0)
            except (TypeError, ValueError):
                saved_proxy_port = 0
            saved_public_url = str(saved.get("publicUrl") or "").strip().rstrip("/")
            saved_token = str(saved.get("token") or "").strip()

            resume_skip_reason = ""
            if not saved_proxy_port:
                resume_skip_reason = "missing saved proxy port"
            elif not saved_public_url:
                resume_skip_reason = "missing saved public url"
            elif not saved_token:
                resume_skip_reason = "missing saved token"
            elif not self._find_cloudflared_pid_for_proxy_port(saved_proxy_port):
                resume_skip_reason = f"cloudflared for proxy port {saved_proxy_port} is not running"

            if resume_skip_reason:
                self.last_error = resume_skip_reason
                self.status = "stopped"
                self._append_mobile_log(f"resume_existing: skipped: {resume_skip_reason}")
                self._write_access_page()
                return ""

            self.last_error = ""
            self.token = saved_token
            self._start_proxy(preferred_port=saved_proxy_port)
            self.public_url = saved_public_url
            self.mobile_url = f"{self.public_url}/?syncodex_token={self.token}"
            self.status = "running"
            self.started_at = time.time()
            self._url_event.set()
            self._save_persisted_state()
            self._write_access_page()
            self._append_mobile_log(
                f"resume_existing: restored publicUrl={self.public_url} proxyPort={self.proxy_port}"
            )
            return self.mobile_url

    def stop(self) -> None:
        self._ensure_status_server()
        with self._lock:
            self.status = "stopping" if self.is_running() else "stopped"
            self._stop_components_locked(clear_status=True, clear_state=True)

    def open_access_page(self) -> None:
        webbrowser.open(self.status_url)

    def regenerate(self) -> None:
        self.stop()
        self._clear_persisted_state()
        self.start(open_page=False)

    def close(self) -> None:
        self.stop()
        with self._lock:
            if self.status_server:
                try:
                    self.status_server.shutdown()
                    self.status_server.server_close()
                except Exception:
                    pass
            self.status_server = None
            self.status_thread = None
            self.status_port = 0

    def _stop_components_locked(self, *, clear_status: bool, clear_state: bool = False) -> None:
        if self.cloudflared_process and self.cloudflared_process.poll() is None:
            try:
                self.cloudflared_process.terminate()
                self.cloudflared_process.wait(timeout=3)
            except Exception:
                try:
                    self.cloudflared_process.kill()
                except Exception:
                    pass
        elif self.proxy_port:
            self._kill_cloudflared_for_proxy_port(self.proxy_port)
        self.cloudflared_process = None

        if self.proxy_server:
            try:
                self.proxy_server.shutdown()
                self.proxy_server.server_close()
            except Exception:
                pass
        self.proxy_server = None
        self.proxy_thread = None
        self.proxy_port = 0
        self.public_url = ""
        self.mobile_url = ""
        self.token = ""
        self.started_at = None
        self._url_event.clear()
        if clear_status:
            self.status = "stopped"
        if clear_state:
            self._clear_persisted_state()

    def _ensure_status_server(self) -> None:
        with self._lock:
            if self.status_server:
                return

            controller = self

            class MobileStatusHandler(BaseHTTPRequestHandler):
                protocol_version = "HTTP/1.1"

                def do_GET(self) -> None:
                    parsed = urlparse(self.path)
                    if parsed.path in {"", "/"}:
                        return self._send_html(controller._status_page_html())
                    if parsed.path == "/api/status":
                        return self._send_json(controller.status_snapshot())
                    if parsed.path == "/api/qr":
                        return self._send_svg(controller.status_qr_svg())
                    if parsed.path == "/logs/mobile":
                        return self._send_text(controller.read_mobile_log_tail())
                    self.send_error(HTTPStatus.NOT_FOUND)

                def do_POST(self) -> None:
                    parsed = urlparse(self.path)
                    if parsed.path == "/api/stop":
                        controller.stop()
                        return self._send_json({"ok": True})
                    if parsed.path == "/api/regenerate":
                        threading.Thread(
                            target=controller._regenerate_background,
                            name="SyncodexMobileRegenerate",
                            daemon=True,
                        ).start()
                        return self._send_json({"ok": True})
                    self.send_error(HTTPStatus.NOT_FOUND)

                def _send_html(self, text: str) -> None:
                    self._send_bytes(text.encode("utf-8"), "text/html; charset=utf-8")

                def _send_json(self, payload: object) -> None:
                    self._send_bytes(
                        json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                        "application/json; charset=utf-8",
                    )

                def _send_svg(self, text: str) -> None:
                    self._send_bytes(text.encode("utf-8"), "image/svg+xml; charset=utf-8")

                def _send_text(self, text: str) -> None:
                    self._send_bytes(text.encode("utf-8"), "text/plain; charset=utf-8")

                def _send_bytes(self, payload: bytes, content_type: str) -> None:
                    self.send_response(HTTPStatus.OK)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    if self.command != "HEAD":
                        self.wfile.write(payload)

                def log_message(self, format: str, *args: object) -> None:
                    return

            self.status_server = ThreadingHTTPServer(("127.0.0.1", 0), MobileStatusHandler)
            self.status_port = int(self.status_server.server_address[1])
            self.status_thread = threading.Thread(
                target=self.status_server.serve_forever,
                name="SyncodexMobileStatusWindow",
                daemon=True,
            )
            self.status_thread.start()

    def _regenerate_background(self) -> None:
        try:
            self.regenerate()
        except Exception as exc:
            with self._lock:
                self.last_error = str(exc)
                self.status = "failed"

    def status_snapshot(self) -> dict[str, object]:
        with self._lock:
            if self.status == "running" and not self.is_running():
                self.status = "failed"
                if not self.last_error:
                    self.last_error = "公网隧道已停止，请重新生成。"
            now = time.time()
            uptime = int(now - self.started_at) if self.started_at else 0
            return {
                "status": self.status,
                "statusLabel": self._status_label(self.status),
                "publicUrl": self.public_url,
                "mobileUrl": self.mobile_url,
                "startedAt": format_local_time(self.started_at),
                "uptimeSeconds": uptime,
                "bridgeUrl": f"http://{self.target_host}:{self.target_port}",
                "proxyUrl": f"http://127.0.0.1:{self.proxy_port}" if self.proxy_port else "",
                "lastError": self.last_error,
                "downloadStatus": self.download_status,
                "downloadLabel": self._download_label(self.download_status),
                "downloadDetail": self.download_detail,
                "downloadReceived": self.download_received,
                "downloadTotal": self.download_total,
                "logPath": str(self._mobile_log_path()),
            }

    def status_qr_svg(self) -> str:
        with self._lock:
            value = self.mobile_url
        if not value:
            return (
                "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 280'>"
                "<rect width='280' height='280' rx='12' fill='#f3f4f6'/>"
                "<text x='140' y='136' text-anchor='middle' fill='#6b7280' "
                "font-family='Segoe UI, sans-serif' font-size='15'>等待公网链接</text>"
                "</svg>"
            )
        return render_qr_svg(value)

    def read_mobile_log_tail(self, max_bytes: int = 80_000) -> str:
        path = self._mobile_log_path()
        if not path.exists():
            return "手机访问日志还没有生成。"
        try:
            with path.open("rb") as handle:
                if path.stat().st_size > max_bytes:
                    handle.seek(-max_bytes, os.SEEK_END)
                return handle.read().decode("utf-8", errors="replace")
        except Exception as exc:
            return f"无法读取日志: {exc}"

    def _status_page_html(self) -> str:
        return """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Syncodex 手机访问状态</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --text: #111827;
      --muted: #5b6472;
      --line: #d9e0ea;
      --accent: #0f766e;
      --accent-strong: #115e59;
      --danger: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
    }
    main {
      width: min(920px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }
    h1 { margin: 0; font-size: 24px; line-height: 1.2; }
    .pill {
      min-width: 92px;
      padding: 7px 11px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #eef8f6;
      color: var(--accent-strong);
      text-align: center;
      font-size: 14px;
      font-weight: 600;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(280px, 340px) 1fr;
      gap: 18px;
      align-items: start;
    }
    .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 12px 30px rgba(17, 24, 39, 0.08);
    }
    .qr {
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      padding: 18px;
    }
    .qr svg { width: 100%; height: 100%; }
    .details { padding: 20px; }
    dl {
      display: grid;
      grid-template-columns: 112px 1fr;
      gap: 12px 14px;
      margin: 0;
    }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    a { color: #075985; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
    }
    button, .button {
      min-height: 38px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: #fff;
      color: var(--text);
      font: inherit;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
    }
    button.danger {
      border-color: rgba(180, 35, 24, 0.3);
      color: var(--danger);
    }
    button:disabled {
      cursor: default;
      opacity: 0.55;
    }
    .error {
      margin-top: 14px;
      padding: 10px 12px;
      border: 1px solid rgba(180, 35, 24, 0.22);
      border-radius: 7px;
      background: #fff5f3;
      color: var(--danger);
      display: none;
      overflow-wrap: anywhere;
    }
    @media (max-width: 760px) {
      main { width: min(100vw - 24px, 560px); padding: 18px 0; }
      header { align-items: flex-start; flex-direction: column; }
      .layout { grid-template-columns: 1fr; }
      dl { grid-template-columns: 92px 1fr; }
      .actions > * { flex: 1 1 148px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Syncodex 手机访问状态</h1>
      <div id="status" class="pill">检查中</div>
    </header>
    <section class="layout">
      <div class="panel qr" id="qr"></div>
      <div class="panel details">
        <dl>
          <dt>公网地址</dt>
          <dd><a id="mobileUrl" href="#" target="_blank" rel="noreferrer">未生成</a></dd>
          <dt>启动时间</dt>
          <dd id="startedAt">-</dd>
          <dt>运行时长</dt>
          <dd id="uptime">-</dd>
          <dt>Bridge</dt>
          <dd><a id="bridgeUrl" href="#" target="_blank" rel="noreferrer">-</a></dd>
          <dt>本机代理</dt>
          <dd id="proxyUrl">-</dd>
          <dt>下载状态</dt>
          <dd id="download">-</dd>
          <dt>日志路径</dt>
          <dd id="logPath">-</dd>
        </dl>
        <div class="actions">
          <button class="primary" id="copyBtn" type="button">复制链接</button>
          <button id="regenBtn" type="button">重新生成</button>
          <button class="danger" id="stopBtn" type="button">停止访问</button>
          <a class="button" href="/logs/mobile" target="_blank" rel="noreferrer">打开日志</a>
        </div>
        <div id="error" class="error"></div>
      </div>
    </section>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    const state = { mobileUrl: "", qrMobileUrl: "" };

    function formatDuration(seconds) {
      if (!seconds) return "-";
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      if (h) return `${h} 小时 ${m} 分 ${s} 秒`;
      if (m) return `${m} 分 ${s} 秒`;
      return `${s} 秒`;
    }

    async function post(path) {
      await fetch(path, { method: "POST", cache: "no-store" });
      await refresh();
    }

    async function refresh() {
      const response = await fetch("/api/status", { cache: "no-store" });
      const data = await response.json();
      const nextMobileUrl = data.mobileUrl || "";
      const qrNeedsRefresh = nextMobileUrl !== state.qrMobileUrl;
      state.mobileUrl = nextMobileUrl;
      $("status").textContent = data.statusLabel || data.status || "未知";
      $("mobileUrl").textContent = state.mobileUrl || "未生成";
      $("mobileUrl").href = state.mobileUrl || "#";
      $("startedAt").textContent = data.startedAt || "-";
      $("uptime").textContent = formatDuration(data.uptimeSeconds || 0);
      $("bridgeUrl").textContent = data.bridgeUrl || "-";
      $("bridgeUrl").href = data.bridgeUrl || "#";
      $("proxyUrl").textContent = data.proxyUrl || "-";
      $("download").textContent = [data.downloadLabel, data.downloadDetail].filter(Boolean).join(" · ") || "-";
      $("logPath").textContent = data.logPath || "-";
      $("copyBtn").disabled = !state.mobileUrl;
      $("stopBtn").disabled = !["running", "starting", "failed"].includes(data.status);
      $("regenBtn").disabled = data.status === "starting" || data.status === "stopping";
      $("error").style.display = data.lastError ? "block" : "none";
      $("error").textContent = data.lastError || "";
      if (qrNeedsRefresh) {
        state.qrMobileUrl = nextMobileUrl;
        const qr = await fetch("/api/qr?ts=" + Date.now(), { cache: "no-store" });
        $("qr").innerHTML = await qr.text();
      }
    }

    $("copyBtn").addEventListener("click", async () => {
      if (!state.mobileUrl) return;
      await navigator.clipboard.writeText(state.mobileUrl);
      $("copyBtn").textContent = "已复制";
      setTimeout(() => $("copyBtn").textContent = "复制链接", 1200);
    });
    $("stopBtn").addEventListener("click", () => post("/api/stop"));
    $("regenBtn").addEventListener("click", () => post("/api/regenerate"));
    refresh();
    setInterval(refresh, 1000);
  </script>
</body>
</html>
"""

    def _status_label(self, status: str) -> str:
        return {
            "stopped": "已停止",
            "starting": "启动中",
            "running": "已开启",
            "failed": "启动失败",
            "stopping": "停止中",
        }.get(status, status)

    def _download_label(self, status: str) -> str:
        return {
            "idle": "未开始",
            "checking": "检查中",
            "found": "已找到 cloudflared.exe",
            "connecting": "正在连接",
            "downloading": "正在下载",
            "complete": "下载完成",
            "failed": "下载失败",
        }.get(status, status)

    def _state_path(self) -> Path:
        return self.runtime_dir / ".syncodex-mobile-access.json"

    def _load_persisted_state(self) -> dict[str, object]:
        path = self._state_path()
        if not path.exists():
            return {}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return {}
        return data if isinstance(data, dict) else {}

    def _save_persisted_state(self) -> None:
        if not self.public_url or not self.mobile_url or not self.token or not self.proxy_port:
            return
        payload = {
            "publicUrl": self.public_url,
            "mobileUrl": self.mobile_url,
            "token": self.token,
            "proxyPort": self.proxy_port,
            "updatedAt": time.time(),
        }
        try:
            self._state_path().write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass

    def _clear_persisted_state(self) -> None:
        try:
            self._state_path().unlink()
        except FileNotFoundError:
            pass
        except Exception:
            pass

    def _find_cloudflared_pid_for_proxy_port(self, port: int) -> int:
        if os.name != "nt" or not port:
            return 0
        command = (
            "$port='" + str(int(port)) + "';"
            "Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" | "
            "Where-Object { $_.CommandLine -like ('*http://127.0.0.1:' + $port + '*') } | "
            "Select-Object -First 1 -ExpandProperty ProcessId"
        )
        try:
            completed = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
                text=True,
                capture_output=True,
                timeout=5,
                check=False,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        except Exception:
            return 0
        try:
            return int((completed.stdout or "").strip().splitlines()[0])
        except Exception:
            fallback_command = "Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id"
            try:
                fallback = subprocess.run(
                    ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", fallback_command],
                    text=True,
                    capture_output=True,
                    timeout=5,
                    check=False,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                return int((fallback.stdout or "").strip().splitlines()[0])
            except Exception:
                return 0

    def _kill_cloudflared_for_proxy_port(self, port: int) -> None:
        pid = self._find_cloudflared_pid_for_proxy_port(port)
        if not pid:
            return
        try:
            subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", f"Stop-Process -Id {pid} -Force"],
                text=True,
                capture_output=True,
                timeout=5,
                check=False,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        except Exception:
            pass

    def _mobile_log_path(self) -> Path:
        return self.runtime_dir / ".syncodex-mobile-access.log"

    def _append_mobile_log(self, message: str) -> None:
        try:
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            with self._mobile_log_path().open("a", encoding="utf-8") as handle:
                handle.write(f"[{timestamp}] {message.rstrip()}\n")
        except Exception:
            pass

    def _start_proxy(self, preferred_port: int = 0) -> None:
        handler = type(
            "SyncodexMobileAuthProxyHandler",
            (AuthProxyHandler,),
            {
                "target_host": self.target_host,
                "target_port": self.target_port,
                "token": self.token,
            },
        )
        bind_port = int(preferred_port or 0)
        try:
            self.proxy_server = ThreadingHTTPServer(("127.0.0.1", bind_port), handler)
        except OSError:
            if bind_port == 0:
                raise
            self.proxy_server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.proxy_port = int(self.proxy_server.server_address[1])
        self.proxy_thread = threading.Thread(
            target=self.proxy_server.serve_forever,
            name="SyncodexMobileAuthProxy",
            daemon=True,
        )
        self.proxy_thread.start()

    def _ensure_cloudflared(self) -> Path:
        tools_dir = self.runtime_dir / "tools"
        tools_dir.mkdir(parents=True, exist_ok=True)
        target = tools_dir / "cloudflared.exe"
        self.download_status = "checking"
        self.download_detail = ""
        self.download_received = 0
        self.download_total = 0
        if target.exists() and target.stat().st_size > 1024 * 1024:
            self.download_status = "found"
            self.download_detail = str(target)
            return target

        tmp = tools_dir / "cloudflared.exe.download"
        if tmp.exists():
            tmp.unlink()
        self.download_status = "connecting"
        try:
            def reporthook(block_count: int, block_size: int, total_size: int) -> None:
                self.download_status = "downloading"
                self.download_received = max(0, block_count * block_size)
                self.download_total = max(0, total_size)
                if total_size > 0:
                    pct = min(100, int(self.download_received * 100 / total_size))
                    self.download_detail = f"{pct}%"
                else:
                    self.download_detail = f"{self.download_received // 1024} KB"

            urlretrieve(CLOUDFLARED_DOWNLOAD_URL, tmp, reporthook)
            tmp.replace(target)
            self.download_status = "complete"
            self.download_detail = str(target)
        except Exception:
            self.download_status = "failed"
            self.download_detail = "请检查网络、代理或安全软件拦截。"
            raise
        return target

    def _start_cloudflared(self, cloudflared: Path) -> None:
        self._url_event.clear()
        command = [
            str(cloudflared),
            "tunnel",
            "--url",
            f"http://127.0.0.1:{self.proxy_port}",
            "--no-autoupdate",
        ]
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        log_path = self._mobile_log_path()
        log = log_path.open("a", encoding="utf-8", errors="replace")
        self.cloudflared_process = subprocess.Popen(
            command,
            cwd=str(self.runtime_dir),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=creationflags,
        )
        threading.Thread(
            target=self._read_cloudflared_output,
            args=(self.cloudflared_process, log),
            name="SyncodexCloudflaredOutput",
            daemon=True,
        ).start()

    def _read_cloudflared_output(self, process: subprocess.Popen[str], log: object) -> None:
        url_pattern = re.compile(r"https://[A-Za-z0-9-]+\.trycloudflare\.com")
        try:
            assert process.stdout is not None
            for line in process.stdout:
                try:
                    log.write(line)
                    log.flush()
                except Exception:
                    pass
                match = url_pattern.search(line)
                if match:
                    with self._lock:
                        self.public_url = match.group(0).rstrip("/")
                        self.mobile_url = f"{self.public_url}/?syncodex_token={self.token}"
                        self._save_persisted_state()
                        self._url_event.set()
            returncode = process.poll()
            if returncode not in {None, 0} and not self.mobile_url:
                with self._lock:
                    self.last_error = f"公网隧道进程已退出，退出码 {returncode}。"
                    self.status = "failed"
                    self._url_event.set()
        finally:
            try:
                log.close()
            except Exception:
                pass

    def _write_access_page(self) -> None:
        escaped_status_url = html.escape(self.status_url, quote=True)
        html_text = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url={escaped_status_url}">
  <title>Syncodex 手机访问</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #f7f3ea;
      color: #1d1d1b;
      font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
    }}
    main {{ width: min(560px, calc(100vw - 32px)); padding: 28px; }}
    h1 {{ margin: 0 0 8px; font-size: 24px; }}
    p {{ margin: 8px 0; color: #5b5447; line-height: 1.55; }}
    a {{
      display: block;
      word-break: break-all;
      color: #8f3f1b;
      line-height: 1.45;
    }}
    .hint {{ font-size: 13px; }}
  </style>
</head>
<body>
  <main>
    <h1>Syncodex 手机访问</h1>
    <p>正在打开手机访问状态窗口。</p>
    <a href="{escaped_status_url}">{escaped_status_url}</a>
    <p class="hint">这个兼容页面不保存公网访问链接或 token。</p>
  </main>
</body>
</html>
"""
        self._access_page_path().write_text(html_text, encoding="utf-8")

    def _access_page_path(self) -> Path:
        return self.runtime_dir / "Syncodex-mobile-access.html"


def render_qr_svg(value: str) -> str:
    try:
        import qrcode
        import qrcode.image.svg

        image = qrcode.make(value, image_factory=qrcode.image.svg.SvgPathImage)
        output = io.BytesIO()
        image.save(output)
        return output.getvalue().decode("utf-8")
    except Exception:
        escaped = html.escape(value)
        return (
            "<div style='font-size:13px;line-height:1.5;text-align:center'>"
            "二维码生成失败，请直接打开下面的链接。<br>"
            f"<code>{escaped}</code>"
            "</div>"
        )


def format_local_time(value: float | None) -> str:
    if not value:
        return ""
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(value))


def pick_unused_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])
