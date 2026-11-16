#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors
"""Integrate, build, flash and monitor the Gate Relay module inside the Bruce tree.

    python firmware/scripts/gate_relay_fw.py integrate          # copy module + register it in Bruce
    python firmware/scripts/gate_relay_fw.py build              # pio run -e lilygo-t-embed-cc1101
    python firmware/scripts/gate_relay_fw.py flash --port COM5  # build + upload (app partitions only)
    python firmware/scripts/gate_relay_fw.py monitor --port COM5
    python firmware/scripts/gate_relay_fw.py test               # host unit tests (pio test -e native)

The edits to Bruce's own files are tiny and idempotent (marked with "gate-relay"),
so they survive a rebase onto a new Bruce release.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # firmware/
MODULE_SRC = ROOT / "gate_relay"
BRUCE = ROOT / "bruce"
MODULE_DST = BRUCE / "src" / "modules" / "gate_relay"
DEFAULT_ENV = "lilygo-t-embed-cc1101"
WEBSOCKETS_DEP = "links2004/WebSockets@2.7.3"
MARK = "// gate-relay"


def pio(*args: str) -> None:
    cmd = [sys.executable, "-m", "platformio", *args]
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True)


def insert_once(path: Path, anchor_regex: str, text: str, after: bool = True) -> None:
    """Inserts `text` next to the first line matching `anchor_regex`, unless already present."""
    content = path.read_text(encoding="utf-8")
    if text.strip() in content:
        print(f"  = {path.relative_to(BRUCE)} already patched")
        return
    lines = content.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if re.search(anchor_regex, line):
            lines.insert(i + 1 if after else i, text if text.endswith("\n") else text + "\n")
            path.write_text("".join(lines), encoding="utf-8")
            print(f"  + {path.relative_to(BRUCE)}")
            return
    raise SystemExit(f"Anchor not found in {path}: {anchor_regex}\nBruce changed; update this script.")


def integrate() -> None:
    if not (BRUCE / "platformio.ini").exists():
        raise SystemExit("firmware/bruce is empty. Run: git submodule update --init --recursive")

    MODULE_DST.mkdir(parents=True, exist_ok=True)
    for f in MODULE_SRC.iterdir():
        if f.suffix in (".h", ".cpp"):
            shutil.copy2(f, MODULE_DST / f.name)
    print(f"  + copied module to {MODULE_DST.relative_to(BRUCE)}")

    rf_menu = BRUCE / "src/core/menu_items/RFMenu.cpp"
    insert_once(rf_menu, r'#include "modules/rf/rf_waterfall.h"', f'#include "modules/gate_relay/gate_relay.h" {MARK}')
    insert_once(rf_menu, r'\{"Config",\s+\[this\]\(\) \{ configMenu\(\); \}\}', f'        {{"Gate Relay",      gate_relay_start          }}, {MARK}', after=False)

    startup = BRUCE / "src/core/startup_app.cpp"
    insert_once(startup, r'#include "modules/rf/rf_send.h"', f'#include "modules/gate_relay/gate_relay.h" {MARK}')
    insert_once(startup, r'_startupApps\["Custom SubGHz"\]', f'    _startupApps["Gate Relay"] = []() {{ gate_relay_start(); }}; {MARK}')

    # WebSocket client library, added to the shared [env] lib_deps.
    ini = BRUCE / "platformio.ini"
    content = ini.read_text(encoding="utf-8")
    if WEBSOCKETS_DEP not in content:
        env_start = content.index("\n[env]")
        lib_idx = content.index("lib_deps =", env_start)
        eol = content.index("\n", lib_idx)
        content = content[:eol + 1] + f"\t{WEBSOCKETS_DEP} ; gate-relay\n" + content[eol + 1:]
        ini.write_text(content, encoding="utf-8")
        print("  + platformio.ini lib_deps")
    else:
        print("  = platformio.ini already patched")
    print("Integrated. Review with: git -C firmware/bruce diff")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["integrate", "build", "flash", "monitor", "test"])
    parser.add_argument("--env", default=DEFAULT_ENV)
    parser.add_argument("--port", help="serial port, e.g. COM5 or /dev/ttyACM0")
    args = parser.parse_args()

    if args.command == "integrate":
        integrate()
    elif args.command == "build":
        integrate()
        pio("run", "-d", str(BRUCE), "-e", args.env)
    elif args.command == "flash":
        if not args.port:
            raise SystemExit("--port is required (e.g. --port COM5)")
        integrate()
        # "upload" writes bootloader, partition table and app only: the LittleFS/SD data stays.
        pio("run", "-d", str(BRUCE), "-e", args.env, "-t", "upload", "--upload-port", args.port)
    elif args.command == "monitor":
        if not args.port:
            raise SystemExit("--port is required")
        pio("device", "monitor", "-p", args.port, "-b", "115200")
    elif args.command == "test":
        pio("test", "-d", str(ROOT), "-e", "native")


if __name__ == "__main__":
    main()
