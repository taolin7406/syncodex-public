from __future__ import annotations

import argparse
import ctypes
import json
import os
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from pathlib import Path
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener
import winreg

from mobile_access import MobileAccessController, MobileAccessError


ROOT = Path(__file__).resolve().parents[2]
BRIDGE_DIR = ROOT / "apps" / "bridge"
if str(BRIDGE_DIR) not in sys.path:
    sys.path.insert(0, str(BRIDGE_DIR))


APP_NAME = "Syncodex"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_VALUE_NAME = "Syncodex"
INSTANCE_MUTEX_NAME = "Local\\SyncodexTrayInstance"
ERROR_ALREADY_EXISTS = 183

WM_USER = 0x0400
WM_TRAYICON = WM_USER + 20
WM_COMMAND = 0x0111
WM_DESTROY = 0x0002
WM_CLOSE = 0x0010
WM_LBUTTONDBLCLK = 0x0203
WM_RBUTTONUP = 0x0205

NIM_ADD = 0x00000000
NIM_MODIFY = 0x00000001
NIM_DELETE = 0x00000002
NIF_MESSAGE = 0x00000001
NIF_ICON = 0x00000002
NIF_TIP = 0x00000004
NIF_INFO = 0x00000010

IDI_APPLICATION = 32512
TPM_RIGHTBUTTON = 0x0002
TPM_BOTTOMALIGN = 0x0020
MF_STRING = 0x0000
MF_SEPARATOR = 0x0800
MF_CHECKED = 0x0008
MF_GRAYED = 0x0001

SW_HIDE = 0
SW_SHOWNORMAL = 1

OPEN_ID = 1001
START_ID = 1002
STOP_ID = 1003
RESTART_ID = 1004
AUTOSTART_ID = 1005
STATUS_ID = 1006
EXIT_ID = 1007
MOBILE_START_ID = 1008
MOBILE_STOP_ID = 1009
OPEN_LOGS_ID = 1010
DIAGNOSTICS_ID = 1011


user32 = ctypes.windll.user32
shell32 = ctypes.windll.shell32
kernel32 = ctypes.windll.kernel32
_INSTANCE_MUTEX_HANDLE: int | None = None
LOCAL_OPENER = build_opener(ProxyHandler({}))


class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]


class MSG(ctypes.Structure):
    _fields_ = [
        ("hwnd", ctypes.c_void_p),
        ("message", ctypes.c_uint),
        ("wParam", ctypes.c_size_t),
        ("lParam", ctypes.c_ssize_t),
        ("time", ctypes.c_uint),
        ("pt", POINT),
    ]


class WNDCLASS(ctypes.Structure):
    _fields_ = [
        ("style", ctypes.c_uint),
        ("lpfnWndProc", ctypes.c_void_p),
        ("cbClsExtra", ctypes.c_int),
        ("cbWndExtra", ctypes.c_int),
        ("hInstance", ctypes.c_void_p),
        ("hIcon", ctypes.c_void_p),
        ("hCursor", ctypes.c_void_p),
        ("hbrBackground", ctypes.c_void_p),
        ("lpszMenuName", ctypes.c_wchar_p),
        ("lpszClassName", ctypes.c_wchar_p),
    ]


class NOTIFYICONDATA(ctypes.Structure):
    _fields_ = [
        ("cbSize", ctypes.c_uint),
        ("hWnd", ctypes.c_void_p),
        ("uID", ctypes.c_uint),
        ("uFlags", ctypes.c_uint),
        ("uCallbackMessage", ctypes.c_uint),
        ("hIcon", ctypes.c_void_p),
        ("szTip", ctypes.c_wchar * 128),
        ("dwState", ctypes.c_uint),
        ("dwStateMask", ctypes.c_uint),
        ("szInfo", ctypes.c_wchar * 256),
        ("uTimeoutOrVersion", ctypes.c_uint),
        ("szInfoTitle", ctypes.c_wchar * 64),
        ("dwInfoFlags", ctypes.c_uint),
        ("guidItem", ctypes.c_byte * 16),
        ("hBalloonIcon", ctypes.c_void_p),
    ]


WNDPROC = ctypes.WINFUNCTYPE(
    ctypes.c_ssize_t,
    ctypes.c_void_p,
    ctypes.c_uint,
    ctypes.c_size_t,
    ctypes.c_ssize_t,
)


kernel32.GetModuleHandleW.argtypes = [ctypes.c_wchar_p]
kernel32.GetModuleHandleW.restype = ctypes.c_void_p
kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
kernel32.CreateMutexW.restype = ctypes.c_void_p
kernel32.GetLastError.restype = ctypes.c_uint
kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
kernel32.CloseHandle.restype = ctypes.c_bool
user32.RegisterClassW.argtypes = [ctypes.POINTER(WNDCLASS)]
user32.RegisterClassW.restype = ctypes.c_ushort
user32.CreateWindowExW.argtypes = [
    ctypes.c_uint,
    ctypes.c_wchar_p,
    ctypes.c_wchar_p,
    ctypes.c_uint,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_void_p,
]
user32.CreateWindowExW.restype = ctypes.c_void_p
user32.DefWindowProcW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_size_t, ctypes.c_ssize_t]
user32.DefWindowProcW.restype = ctypes.c_ssize_t
user32.LoadIconW.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
user32.LoadIconW.restype = ctypes.c_void_p
user32.CreatePopupMenu.restype = ctypes.c_void_p
shell32.Shell_NotifyIconW.argtypes = [ctypes.c_uint, ctypes.POINTER(NOTIFYICONDATA)]
shell32.Shell_NotifyIconW.restype = ctypes.c_bool


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def bundle_root() -> Path:
    if is_frozen() and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return ROOT


def runtime_root() -> Path:
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return ROOT


def app_url(host: str, port: int) -> str:
    return f"http://{host}:{port}"


def append_runtime_log(name: str, message: str) -> None:
    try:
        path = runtime_root() / name
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with path.open("a", encoding="utf-8") as handle:
            handle.write(f"[{timestamp}] {message.rstrip()}\n")
    except Exception:
        pass


def startup_command() -> str:
    if is_frozen():
        return f'"{sys.executable}" --minimized'
    script = Path(__file__).resolve()
    return f'"{sys.executable}" "{script}" --minimized'


def open_path(path: Path) -> None:
    try:
        os.startfile(str(path))  # type: ignore[attr-defined]
    except Exception:
        webbrowser.open(path.resolve().as_uri())


def run_at_startup_enabled() -> bool:
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_READ) as key:
            value, _ = winreg.QueryValueEx(key, RUN_VALUE_NAME)
            return str(value).strip().lower() == startup_command().strip().lower()
    except FileNotFoundError:
        return False
    except OSError:
        return False


def set_run_at_startup(enabled: bool) -> None:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
        if enabled:
            winreg.SetValueEx(key, RUN_VALUE_NAME, 0, winreg.REG_SZ, startup_command())
        else:
            try:
                winreg.DeleteValue(key, RUN_VALUE_NAME)
            except FileNotFoundError:
                pass


def bridge_main(argv: list[str]) -> int:
    os.environ["SYNCODEX_BUNDLE_ROOT"] = str(bundle_root())
    from syncodex_server import main

    old_argv = sys.argv[:]
    try:
        sys.argv = [old_argv[0], *argv]
        return int(main() or 0)
    finally:
        sys.argv = old_argv


def acquire_single_instance(host: str, port: int) -> bool:
    global _INSTANCE_MUTEX_HANDLE
    handle = kernel32.CreateMutexW(None, True, INSTANCE_MUTEX_NAME)
    if not handle:
        raise ctypes.WinError()
    _INSTANCE_MUTEX_HANDLE = handle
    if kernel32.GetLastError() != ERROR_ALREADY_EXISTS:
        return True

    webbrowser.open(app_url(host, port))
    return False


def release_single_instance() -> None:
    global _INSTANCE_MUTEX_HANDLE
    if _INSTANCE_MUTEX_HANDLE:
        kernel32.CloseHandle(_INSTANCE_MUTEX_HANDLE)
        _INSTANCE_MUTEX_HANDLE = None


class BridgeController:
    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        self.process: subprocess.Popen[str] | None = None
        self.server = None
        self.thread: threading.Thread | None = None
        self._log_lock = threading.RLock()

    @property
    def url(self) -> str:
        return app_url(self.host, self.port)

    def is_running(self) -> bool:
        if self.thread and self.thread.is_alive():
            return True
        if self.process and self.process.poll() is None:
            return True
        try:
            with LOCAL_OPENER.open(f"{self.url}/health", timeout=0.7) as response:
                return response.status == 200
        except (OSError, URLError):
            return False

    def start(self) -> bool:
        if self.is_running():
            return False

        os.environ["SYNCODEX_HOST"] = self.host
        os.environ["SYNCODEX_PORT"] = str(self.port)
        os.environ["SYNCODEX_BUNDLE_ROOT"] = str(bundle_root())
        try:
            from syncodex_server import create_server

            self.server = create_server(
                self.host,
                self.port,
                access_log=self._append_bridge_log,
                error_log=self._append_bridge_error_log,
            )
        except Exception:
            self._append_bridge_error_log(traceback.format_exc())
            self.server = None
            return False

        self.thread = threading.Thread(
            target=self._serve_bridge,
            name="SyncodexBridge",
            daemon=True,
        )
        self.thread.start()

        for _ in range(30):
            if self.is_running():
                return True
            time.sleep(0.15)
        return self.is_running()

    def stop(self) -> bool:
        stopped = False
        if self.server is not None:
            server = self.server
            try:
                server.shutdown()
            except Exception:
                self._append_bridge_error_log(traceback.format_exc())
            if self.thread and self.thread.is_alive():
                self.thread.join(timeout=3)
            try:
                server.server_close()
            except Exception:
                self._append_bridge_error_log(traceback.format_exc())
            self.server = None
            self.thread = None
            stopped = True

        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
            stopped = True

        if self.is_running():
            stopped = self._stop_port_listener() or stopped

        self.process = None
        return stopped

    def restart(self) -> bool:
        self.stop()
        return self.start()

    def _stop_port_listener(self) -> bool:
        command = (
            "$p={port};"
            "$c=Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue;"
            "if($c){$c|Select-Object -ExpandProperty OwningProcess -Unique|"
            "ForEach-Object{Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue}; exit 0};"
            "exit 1"
        ).format(port=self.port)
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        return completed.returncode == 0

    def _serve_bridge(self) -> None:
        server = self.server
        if server is None:
            return
        self._append_bridge_log(f"Syncodex bridge listening on {self.url}")
        self._append_bridge_log(f"Web root: {bundle_root() / 'package' / 'web'}")
        try:
            server.serve_forever()
        except Exception:
            self._append_bridge_error_log(traceback.format_exc())
        finally:
            try:
                server.server_close()
            except Exception:
                self._append_bridge_error_log(traceback.format_exc())

    def _append_bridge_log(self, message: str) -> None:
        self._append_log(runtime_root() / ".syncodex-bridge.log", message)

    def _append_bridge_error_log(self, message: str) -> None:
        self._append_log(runtime_root() / ".syncodex-bridge.err.log", message)

    def _append_log(self, path: Path, message: str) -> None:
        line = str(message).rstrip()
        if not line:
            return
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        with self._log_lock:
            with path.open("a", encoding="utf-8") as handle:
                handle.write(f"[{timestamp}] {line}\n")


class SyncodexTrayApp:
    def __init__(self, host: str, port: int, autostart_bridge: bool) -> None:
        self.controller = BridgeController(host, port)
        self.mobile_access = MobileAccessController(runtime_root(), host, port)
        self.autostart_bridge = autostart_bridge
        self.hwnd: int | None = None
        self.hicon = user32.LoadIconW(None, ctypes.c_void_p(IDI_APPLICATION))
        self.class_name = f"SyncodexTrayWindow-{os.getpid()}"
        self.wndproc = WNDPROC(self._window_proc)
        self.running = True

    def run(self) -> int:
        append_runtime_log(".syncodex-tray.log", f"Tray run start pid={os.getpid()} autostart_bridge={self.autostart_bridge}")
        self._create_window()
        self._add_tray_icon()
        if self.autostart_bridge:
            threading.Thread(target=self._start_bridge_async, daemon=True).start()
        threading.Thread(target=self._resume_mobile_access_async, daemon=True).start()
        self._message_loop()
        return 0

    def _create_window(self) -> None:
        hinstance = kernel32.GetModuleHandleW(None)
        wc = WNDCLASS()
        wc.lpfnWndProc = ctypes.cast(self.wndproc, ctypes.c_void_p).value
        wc.hInstance = hinstance
        wc.hIcon = self.hicon
        wc.lpszClassName = self.class_name
        if not user32.RegisterClassW(ctypes.byref(wc)):
            raise ctypes.WinError()
        hwnd = user32.CreateWindowExW(
            0,
            self.class_name,
            APP_NAME,
            0,
            0,
            0,
            0,
            0,
            None,
            None,
            hinstance,
            None,
        )
        if not hwnd:
            raise ctypes.WinError()
        self.hwnd = hwnd
        user32.ShowWindow(hwnd, SW_HIDE)

    def _notify_data(self, flags: int) -> NOTIFYICONDATA:
        data = NOTIFYICONDATA()
        data.cbSize = ctypes.sizeof(NOTIFYICONDATA)
        data.hWnd = self.hwnd
        data.uID = 1
        data.uFlags = flags
        data.uCallbackMessage = WM_TRAYICON
        data.hIcon = self.hicon
        status = "running" if self.controller.is_running() else "stopped"
        data.szTip = f"{APP_NAME} bridge: {status}"
        return data

    def _add_tray_icon(self) -> None:
        data = self._notify_data(NIF_MESSAGE | NIF_ICON | NIF_TIP)
        shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(data))

    def _remove_tray_icon(self) -> None:
        if self.hwnd:
            data = self._notify_data(0)
            shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(data))

    def _balloon(self, title: str, message: str) -> None:
        data = self._notify_data(NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_INFO)
        data.szInfoTitle = title[:63]
        data.szInfo = message[:255]
        shell32.Shell_NotifyIconW(NIM_MODIFY, ctypes.byref(data))

    def _refresh_tip(self) -> None:
        data = self._notify_data(NIF_MESSAGE | NIF_ICON | NIF_TIP)
        shell32.Shell_NotifyIconW(NIM_MODIFY, ctypes.byref(data))

    def _show_menu(self) -> None:
        menu = user32.CreatePopupMenu()
        running = self.controller.is_running()
        autostart = run_at_startup_enabled()
        mobile_running = self.mobile_access.is_running()

        self._append_menu(menu, OPEN_ID, "打开 Syncodex")
        self._append_separator(menu)
        self._append_menu(menu, STATUS_ID, "状态: 运行中" if running else "状态: 已停止", disabled=True)
        self._append_menu(menu, START_ID, "启动服务", disabled=running)
        self._append_menu(menu, STOP_ID, "停止服务", disabled=not running)
        self._append_menu(menu, RESTART_ID, "重启服务")
        self._append_separator(menu)
        self._append_menu(menu, MOBILE_START_ID, "手机访问状态..." if mobile_running else "手机访问...")
        self._append_menu(menu, MOBILE_STOP_ID, "停止手机访问", disabled=not mobile_running)
        self._append_separator(menu)
        self._append_menu(menu, OPEN_LOGS_ID, "查看日志")
        self._append_menu(menu, DIAGNOSTICS_ID, "诊断")
        self._append_separator(menu)
        self._append_menu(menu, AUTOSTART_ID, "开机自动运行", checked=autostart)
        self._append_separator(menu)
        self._append_menu(menu, EXIT_ID, "退出")

        point = POINT()
        user32.GetCursorPos(ctypes.byref(point))
        user32.SetForegroundWindow(self.hwnd)
        user32.TrackPopupMenu(
            menu,
            TPM_RIGHTBUTTON | TPM_BOTTOMALIGN,
            point.x,
            point.y,
            0,
            self.hwnd,
            None,
        )
        user32.DestroyMenu(menu)

    def _append_menu(
        self,
        menu: int,
        item_id: int,
        text: str,
        *,
        checked: bool = False,
        disabled: bool = False,
    ) -> None:
        flags = MF_STRING
        if checked:
            flags |= MF_CHECKED
        if disabled:
            flags |= MF_GRAYED
        user32.AppendMenuW(menu, flags, item_id, text)

    def _append_separator(self, menu: int) -> None:
        user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)

    def _handle_command(self, command_id: int) -> None:
        if command_id == OPEN_ID:
            self._open()
        elif command_id == START_ID:
            threading.Thread(target=self._start_bridge_async, daemon=True).start()
        elif command_id == STOP_ID:
            threading.Thread(target=self._stop_bridge_async, daemon=True).start()
        elif command_id == RESTART_ID:
            threading.Thread(target=self._restart_bridge_async, daemon=True).start()
        elif command_id == MOBILE_START_ID:
            threading.Thread(target=self._start_mobile_access_async, daemon=True).start()
        elif command_id == MOBILE_STOP_ID:
            self._stop_mobile_access()
        elif command_id == OPEN_LOGS_ID:
            self._open_logs()
        elif command_id == DIAGNOSTICS_ID:
            threading.Thread(target=self._run_diagnostics_async, daemon=True).start()
        elif command_id == AUTOSTART_ID:
            self._toggle_autostart()
        elif command_id == EXIT_ID:
            self._quit()

    def _open(self) -> None:
        if not self.controller.is_running():
            self.controller.start()
        webbrowser.open(self.controller.url)
        self._refresh_tip()

    def _start_bridge_async(self) -> None:
        append_runtime_log(".syncodex-tray.log", "Bridge start requested")
        ok = self.controller.start()
        append_runtime_log(".syncodex-tray.log", f"Bridge start result ok={ok} running={self.controller.is_running()}")
        self._refresh_tip()
        self._balloon(APP_NAME, f"服务已启动: {self.controller.url}" if ok else "服务已经在运行。")

    def _stop_bridge_async(self) -> None:
        stopped = self.controller.stop()
        self._refresh_tip()
        self._balloon(APP_NAME, "服务已停止。" if stopped else "没有正在运行的服务。")

    def _restart_bridge_async(self) -> None:
        ok = self.controller.restart()
        self._refresh_tip()
        self._balloon(APP_NAME, f"服务已重启: {self.controller.url}" if ok else "服务重启失败。")

    def _start_mobile_access_async(self) -> None:
        append_runtime_log(".syncodex-tray.log", "Mobile access start requested")
        try:
            if not self.controller.is_running():
                self.controller.start()
            url = self.mobile_access.start()
            append_runtime_log(
                ".syncodex-tray.log",
                f"Mobile access start result ok=True running={self.mobile_access.is_running()} publicUrl={self.mobile_access.public_url}",
            )
            self._balloon(APP_NAME, f"手机访问已开启: {url}")
        except MobileAccessError as exc:
            append_runtime_log(".syncodex-tray.log", f"Mobile access start failed: {exc}")
            self._balloon(APP_NAME, f"手机访问启动失败: {exc}")
        except Exception as exc:
            append_runtime_log(".syncodex-tray.log", f"Mobile access start failed: {exc}")
            self._balloon(APP_NAME, f"手机访问启动失败: {exc}")
        finally:
            self._refresh_tip()

    def _resume_mobile_access_async(self) -> None:
        append_runtime_log(".syncodex-tray.log", "Mobile access resume requested")
        try:
            url = self.mobile_access.resume_existing()
            append_runtime_log(
                ".syncodex-tray.log",
                f"Mobile access resume result restored={bool(url)} running={self.mobile_access.is_running()} publicUrl={self.mobile_access.public_url}",
            )
            if url:
                self._balloon(APP_NAME, "手机访问已恢复，原链接可继续使用。")
        except Exception as exc:
            append_runtime_log(".syncodex-tray.log", f"Mobile access resume failed: {exc}")
            self._balloon(APP_NAME, f"手机访问恢复失败: {exc}")
        finally:
            self._refresh_tip()

    def _stop_mobile_access(self) -> None:
        self.mobile_access.stop()
        self._refresh_tip()
        self._balloon(APP_NAME, "手机访问已停止。")

    def _open_logs(self) -> None:
        runtime = runtime_root()
        log_paths = [
            runtime / ".syncodex-bridge.log",
            runtime / ".syncodex-bridge.err.log",
            runtime / ".syncodex-mobile-access.log",
        ]
        for path in log_paths:
            if not path.exists():
                path.touch()
        open_path(runtime)

    def _run_diagnostics_async(self) -> None:
        report_path = runtime_root() / "Syncodex-diagnostics.txt"
        lines = self._build_diagnostics_report()
        report_path.write_text("\n".join(lines), encoding="utf-8")
        open_path(report_path)
        self._balloon(APP_NAME, f"诊断已生成: {report_path.name}")

    def _build_diagnostics_report(self) -> list[str]:
        runtime = runtime_root()
        bridge_running = self.controller.is_running()
        mobile_running = self.mobile_access.is_running()
        health_payload: dict[str, object] | None = None
        health_error = ""
        try:
            with LOCAL_OPENER.open(f"{self.controller.url}/health", timeout=3) as response:
                raw = response.read().decode("utf-8", errors="replace")
                health_payload = json.loads(raw)
        except Exception as exc:
            health_error = str(exc)

        cloudflared_path = runtime / "tools" / "cloudflared.exe"
        logs = [
            runtime / ".syncodex-bridge.log",
            runtime / ".syncodex-bridge.err.log",
            runtime / ".syncodex-mobile-access.log",
        ]
        lines = [
            "Syncodex 诊断报告",
            f"生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}",
            f"运行目录: {runtime}",
            f"正式入口: {sys.executable}",
            "",
            "服务",
            f"- bridge: {'运行中' if bridge_running else '已停止'}",
            f"- bridge 地址: {self.controller.url}",
            f"- 手机访问: {'运行中' if mobile_running else '已停止'}",
            f"- cloudflared: {'存在' if cloudflared_path.exists() else '不存在'} ({cloudflared_path})",
            "",
            "健康检查",
        ]
        if health_payload:
            for key in [
                "ok",
                "service",
                "desktop_ipc_sender_script_exists",
                "codex_home_exists",
                "state_db_exists",
                "session_index_exists",
                "sessions_dir_exists",
            ]:
                lines.append(f"- {key}: {health_payload.get(key)}")
        else:
            lines.append(f"- 失败: {health_error or 'unknown'}")
        lines.extend(["", "日志文件"])
        for path in logs:
            size = path.stat().st_size if path.exists() else 0
            lines.append(f"- {path} ({size} bytes)")
        recommendations: list[str] = []
        if not bridge_running:
            recommendations.append("- bridge 未运行，请从托盘点击“启动服务”或“重启服务”。")
        if health_payload and not health_payload.get("desktop_ipc_sender_script_exists"):
            recommendations.append("- desktop IPC sender 缺失，请重新构建 Syncodex.exe。")
        if not cloudflared_path.exists():
            recommendations.append("- cloudflared 不存在，首次开启手机访问时会自动下载。")
        if not recommendations:
            recommendations.append("- 当前未发现明显配置缺失。")
        lines.extend(["", "建议", *recommendations])
        return lines

    def _toggle_autostart(self) -> None:
        next_enabled = not run_at_startup_enabled()
        set_run_at_startup(next_enabled)
        self._balloon(APP_NAME, "已开启开机自动运行。" if next_enabled else "已关闭开机自动运行。")

    def _quit(self) -> None:
        self.running = False
        self.mobile_access.close()
        self.controller.stop()
        if self.hwnd:
            user32.DestroyWindow(self.hwnd)

    def _window_proc(self, hwnd: int, msg: int, wparam: int, lparam: int) -> int:
        if msg == WM_TRAYICON:
            if lparam == WM_RBUTTONUP:
                self._show_menu()
                return 0
            if lparam == WM_LBUTTONDBLCLK:
                self._open()
                return 0
        if msg == WM_COMMAND:
            self._handle_command(wparam & 0xFFFF)
            return 0
        if msg in {WM_CLOSE, WM_DESTROY}:
            self._remove_tray_icon()
            user32.PostQuitMessage(0)
            return 0
        return user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    def _message_loop(self) -> None:
        msg = MSG()
        while self.running and user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Syncodex tray launcher")
    parser.add_argument("--bridge", action="store_true", help="run the bridge child process")
    parser.add_argument("--minimized", action="store_true", help="start directly in the tray")
    parser.add_argument("--no-start", action="store_true", help="do not start bridge on launch")
    parser.add_argument("--host", default=os.environ.get("SYNCODEX_HOST", DEFAULT_HOST))
    parser.add_argument("--port", type=int, default=int(os.environ.get("SYNCODEX_PORT", DEFAULT_PORT)))
    args, bridge_args = parser.parse_known_args(argv)
    args.bridge_args = bridge_args
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    if args.bridge:
        bridge_args = args.bridge_args
        if "--host" not in bridge_args:
            bridge_args = ["--host", args.host, *bridge_args]
        if "--port" not in bridge_args:
            bridge_args = ["--port", str(args.port), *bridge_args]
        return bridge_main(bridge_args)

    if not acquire_single_instance(args.host, args.port):
        return 0

    app = SyncodexTrayApp(args.host, args.port, autostart_bridge=not args.no_start)
    try:
        return app.run()
    finally:
        release_single_instance()


if __name__ == "__main__":
    raise SystemExit(main())
