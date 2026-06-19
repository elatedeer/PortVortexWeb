#!/usr/bin/env python3
"""Forward one local COM port through the PortVortex live-chat channel.

Example:
  python scripts/serial_forward.py pv_device_id COM3 --mode uart
  python scripts/serial_forward.py pv_device_id --mode rs485 --auto-com0com
"""

import argparse
import base64
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib import request
from urllib.error import HTTPError, URLError

try:
    import serial
except ImportError:
    serial = None


def app_base_dir():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def bundled_resource(*parts):
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS).joinpath(*parts)
    return app_base_dir().joinpath(*parts)


def parse_args():
    parser = argparse.ArgumentParser(description="PortVortex serial forwarding bridge")
    parser.add_argument("key", help="Device ID / forwarding key")
    parser.add_argument("com", nargs="?", help="Serial port to bridge, for example COM3")
    parser.add_argument("--mode", choices=["uart", "rs485"], default="uart", help="Forwarding channel")
    parser.add_argument("--server", default="http://localhost:3000", help="PortVortex server URL")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baud rate")
    parser.add_argument("--timeout", type=float, default=0.05, help="Serial read timeout in seconds")
    parser.add_argument("--auto-com0com", action="store_true", help="Create or reuse a com0com virtual pair automatically")
    parser.add_argument("--setupc", default="", help="Path to com0com setupc.exe")
    parser.add_argument("--install-com0com", default="", help="Path to a local com0com installer to launch with elevation")
    parser.add_argument("--user-port", default="COM#", help="Requested user-side virtual port for --auto-com0com")
    parser.add_argument("--bridge-port", default="COM#", help="Requested script-side virtual port for --auto-com0com")
    parser.add_argument("--pair-state", default="", help="Path to remember the auto-created com0com pair")
    parser.add_argument("--cleanup-com0com", action="store_true", help="Remove the remembered com0com pair and exit")
    return parser.parse_args()


def default_pair_state():
    base = os.environ.get("LOCALAPPDATA") or str(Path.home())
    return Path(base) / "PortVortex" / "serial-forward-com0com.json"


def normalize_port(value):
    text = str(value or "").strip()
    if not text:
        return ""
    return text.upper() if re.fullmatch(r"com\d+", text, re.IGNORECASE) else text


def load_pair_state(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_pair_state(path, state):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(state, indent=2), encoding="utf-8")


def find_setupc(explicit=""):
    candidates = []
    if explicit:
        candidates.append(explicit)
    from_path = shutil.which("setupc.exe") or shutil.which("setupc")
    if from_path:
        candidates.append(from_path)
    program_files = [os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")]
    for root in program_files:
        if root:
            candidates.extend([
                str(Path(root) / "com0com" / "setupc.exe"),
            ])
    candidates.extend([
        str(bundled_resource("com0com", "setupc.exe")),
        str(app_base_dir() / "com0com" / "setupc.exe"),
        str(Path.cwd() / "tools" / "com0com" / "setupc.exe"),
    ])
    for item in candidates:
        if item and Path(item).exists():
            return str(Path(item))
    return ""


def find_com0com_installer(explicit=""):
    candidates = []
    if explicit:
        candidates.append(explicit)
    search_dirs = [
        bundled_resource("com0com"),
        app_base_dir() / "com0com",
        Path.cwd() / "tools" / "com0com",
    ]
    for root in search_dirs:
        if not root.exists():
            continue
        candidates.extend(sorted(root.glob("*.exe")))
    for item in candidates:
        path = Path(item)
        if path.exists() and path.name.lower() != "setupc.exe":
            return str(path)
    return ""


def launch_installer(installer):
    if not installer:
        return False
    installer_path = Path(installer)
    if not installer_path.exists():
        raise FileNotFoundError(f"com0com installer not found: {installer}")
    if os.name == "nt":
        import ctypes
        result = ctypes.windll.shell32.ShellExecuteW(None, "runas", str(installer_path), None, None, 1)
        if result <= 32:
            raise RuntimeError(f"Failed to launch com0com installer, ShellExecuteW={result}")
        print("com0com installer launched. Finish the installer, then rerun this command.")
        return True
    subprocess.Popen([str(installer_path)])
    print("com0com installer launched. Finish the installer, then rerun this command.")
    return True


def run_setupc(setupc, *args):
    setupc_path = Path(setupc)
    proc = subprocess.run(
        [str(setupc_path), *args],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=str(setupc_path.parent),
    )
    output = "\n".join(part for part in [proc.stdout, proc.stderr] if part).strip()
    if proc.returncode != 0:
        raise RuntimeError(
            f"com0com setupc {' '.join(args)} failed with code {proc.returncode}.\n"
            f"{output}\n"
            "If this operation creates or changes ports, run the terminal as Administrator."
        )
    return output


def parse_port_attrs(line):
    attrs = {}
    for key, value in re.findall(r"([A-Za-z][A-Za-z0-9_]*)=([^,\s]+)", line):
        attrs[key] = value
    return attrs


def parse_setupc_list(text):
    ports = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        name_match = re.match(r"^(CNC[AB]\d+)\b", line, re.IGNORECASE)
        if not name_match:
            continue
        name = name_match.group(1).upper()
        attrs = parse_port_attrs(line)
        attrs["name"] = name
        attrs["real"] = normalize_port(attrs.get("RealPortName") or attrs.get("PortName") or name)
        ports[name] = attrs
    pairs = []
    for name, left in sorted(ports.items()):
        pair_match = re.match(r"^CNCA(\d+)$", name, re.IGNORECASE)
        if not pair_match:
            continue
        right = ports.get(f"CNCB{pair_match.group(1)}")
        if right:
            pairs.append({"left": left, "right": right})
    return pairs


def list_com0com_pairs(setupc):
    return parse_setupc_list(run_setupc(setupc, "list"))


def port_names(pair):
    return {
        "left_name": pair["left"]["name"],
        "right_name": pair["right"]["name"],
        "left_port": pair["left"]["real"],
        "right_port": pair["right"]["real"],
    }


def find_pair_by_names(pairs, left_name, right_name):
    for pair in pairs:
        names = port_names(pair)
        if names["left_name"] == left_name and names["right_name"] == right_name:
            return names
    return None


def remove_pair(setupc, pair_state_path):
    state = load_pair_state(pair_state_path)
    left_name = normalize_port(state.get("left_name"))
    if not left_name:
        print("No remembered com0com pair to clean up.")
        return 0
    run_setupc(setupc, "remove", left_name)
    try:
        Path(pair_state_path).unlink()
    except OSError:
        pass
    print(f"Removed remembered com0com pair starting at {left_name}.")
    return 0


def create_pair(setupc, user_port, bridge_port):
    before = {(item["left_name"], item["right_name"]) for item in map(port_names, list_com0com_pairs(setupc))}
    run_setupc(setupc, "install", f"PortName={user_port}", f"PortName={bridge_port}")
    time.sleep(0.5)
    after = list_com0com_pairs(setupc)
    for pair in after:
        names = port_names(pair)
        if (names["left_name"], names["right_name"]) not in before:
            return names
    if after:
        return port_names(after[-1])
    raise RuntimeError("com0com pair was not created")


def resolve_auto_com(args):
    pair_state_path = Path(args.pair_state) if args.pair_state else default_pair_state()
    setupc = find_setupc(args.setupc)
    if args.install_com0com and setupc:
        print(f"com0com setupc.exe is already available: {setupc}")
        return None
    if not setupc:
        installer = find_com0com_installer(args.install_com0com)
        if launch_installer(installer):
            return None
        raise RuntimeError(
            "com0com setupc.exe was not found. Install com0com first, add setupc.exe to PATH, "
            "put a com0com installer under tools\\com0com, pass --setupc C:\\path\\setupc.exe, "
            "or pass --install-com0com C:\\path\\installer.exe."
        )
    if args.cleanup_com0com:
        remove_pair(setupc, pair_state_path)
        return None
    state = load_pair_state(pair_state_path)
    pairs = list_com0com_pairs(setupc)
    remembered = find_pair_by_names(
        pairs,
        normalize_port(state.get("left_name")),
        normalize_port(state.get("right_name")),
    )
    if remembered:
        if remembered["left_port"].upper() == "COM#" or remembered["right_port"].upper() == "COM#":
            raise RuntimeError("com0com did not report real COM ports. Run setupc list and check RealPortName.")
        print(f"Reusing com0com pair: user {remembered['left_port']} <-> bridge {remembered['right_port']}")
        print(f"Connect your serial tool to {remembered['left_port']}.")
        return remembered["right_port"]
    created = create_pair(setupc, args.user_port, args.bridge_port)
    if created["left_port"].upper() == "COM#" or created["right_port"].upper() == "COM#":
        raise RuntimeError("com0com did not report real COM ports. Run setupc list and check RealPortName.")
    save_pair_state(pair_state_path, created)
    print(f"Created com0com pair: user {created['left_port']} <-> bridge {created['right_port']}")
    print(f"Connect your serial tool to {created['left_port']}.")
    return created["right_port"]


def http_json(url, payload):
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=15) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body or "{}")


def topic_pair(key, mode):
    prefix = f"/topic/{key}"
    if mode == "rs485":
        return f"{prefix}/rs485/qos1", f"{prefix}/rs485/qos0", "rs485"
    return f"{prefix}/qos1", f"{prefix}/qos0", "uart"


def connect_session(server, key, mode):
    subscribe_topic, publish_topic, target = topic_pair(key, mode)
    payload = {
        "deviceToken": key,
        "subscribeTopic": subscribe_topic,
        "publishTopic": publish_topic,
        "channelTarget": target,
        "clientId": "",
        "receiveFormat": "base64",
        "chatQos": 0,
    }
    return http_json(f"{server.rstrip('/')}/api/chat/connect", payload)


def send_to_service(server, chat_id, data):
    if not data:
        return
    payload = {
        "message": base64.b64encode(data).decode("ascii"),
        "format": "base64",
    }
    http_json(f"{server.rstrip('/')}/api/chat/{chat_id}/send", payload)


def close_session(server, chat_id):
    try:
        http_json(f"{server.rstrip('/')}/api/chat/{chat_id}/close", {})
    except Exception:
        pass


def event_reader(server, chat_id, out_queue, stop_event):
    url = f"{server.rstrip('/')}/api/chat/{chat_id}/events"
    req = request.Request(url, headers={"Accept": "text/event-stream"})
    with request.urlopen(req, timeout=60 * 60) as resp:
        event_lines = []
        while not stop_event.is_set():
            raw = resp.readline()
            if not raw:
                break
            line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
            if line == "":
                data_lines = [item[5:].lstrip() for item in event_lines if item.startswith("data:")]
                event_lines = []
                if not data_lines:
                    continue
                try:
                    event = json.loads("\n".join(data_lines))
                except json.JSONDecodeError:
                    continue
                if event.get("type") != "message" or event.get("direction") != "in":
                    continue
                try:
                    out_queue.put(base64.b64decode(event.get("message") or "", validate=False))
                except Exception as exc:
                    print(f"SSE decode failed: {exc}", file=sys.stderr)
            else:
                event_lines.append(line)


def serial_to_service(server, chat_id, port, stop_event):
    while not stop_event.is_set():
        data = port.read(4096)
        if not data:
            continue
        send_to_service(server, chat_id, data)


def service_to_serial(port, out_queue, stop_event):
    while not stop_event.is_set():
        try:
            data = out_queue.get(timeout=0.2)
        except queue.Empty:
            continue
        if data:
            port.write(data)
            port.flush()


def main():
    args = parse_args()
    stop_event = threading.Event()
    out_queue = queue.Queue()

    try:
        if args.auto_com0com or args.cleanup_com0com or args.install_com0com:
            resolved_port = resolve_auto_com(args)
            if args.cleanup_com0com or args.install_com0com:
                return 0
            if resolved_port:
                args.com = resolved_port
        if not args.com:
            print("Serial port is required. Pass COM3 or use --auto-com0com.", file=sys.stderr)
            return 2
        if serial is None:
            print("Missing dependency: install pyserial with `python -m pip install pyserial`.", file=sys.stderr)
            return 2

        session = connect_session(args.server, args.key, args.mode)
        chat_id = session["id"]
        print(f"Connected: {chat_id}")
        print(f"{args.com} <-> service ({args.mode})")

        with serial.Serial(args.com, args.baud, timeout=args.timeout) as port:
            threads = [
                threading.Thread(target=event_reader, args=(args.server, chat_id, out_queue, stop_event), daemon=True),
                threading.Thread(target=serial_to_service, args=(args.server, chat_id, port, stop_event), daemon=True),
                threading.Thread(target=service_to_serial, args=(port, out_queue, stop_event), daemon=True),
            ]
            for thread in threads:
                thread.start()
            while all(thread.is_alive() for thread in threads):
                time.sleep(0.2)
    except KeyboardInterrupt:
        print("Stopping...")
    except (HTTPError, URLError, OSError, KeyError, RuntimeError) as exc:
        print(f"serial forward failed: {exc}", file=sys.stderr)
        return 1
    finally:
        stop_event.set()
        if "chat_id" in locals():
            close_session(args.server, chat_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
