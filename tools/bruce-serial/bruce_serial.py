#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors
"""Talk to Bruce's serial CLI: inspect, back up and copy files with MD5 verification.

Requires `pip install pyserial`. Close any serial monitor first. File contents are never printed.

    python tools/bruce-serial/bruce_serial.py --port COM5 info
    python tools/bruce-serial/bruce_serial.py --port COM5 ls /BruceRF
    python tools/bruce-serial/bruce_serial.py --port COM5 backup-subs backup/sub      # every .sub, MD5-checked
    python tools/bruce-serial/bruce_serial.py --port COM5 pull /BruceRF/gates/Garage.sub Garage.sub
    python tools/bruce-serial/bruce_serial.py --port COM5 push gate-relay.json /gate-relay.json
    python tools/bruce-serial/bruce_serial.py --port COM5 mkdir /BruceRF/gates
    python tools/bruce-serial/bruce_serial.py --port COM5 cp /BruceRF/rcs.sub /BruceRF/gates
    python tools/bruce-serial/bruce_serial.py --port COM5 mv /BruceRF/gates/rcs.sub "/BruceRF/gates/Main Gate.sub"
    python tools/bruce-serial/bruce_serial.py --port COM5 run "free"                   # any raw CLI command

The CLI works on the SD card when one is mounted, otherwise on the internal LittleFS.
Opening the port does not reset the board (DTR/RTS are kept low).
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from pathlib import Path

try:
    import serial  # pyserial
except ImportError:  # pragma: no cover
    sys.exit("pyserial is missing: python -m pip install pyserial")


class BruceCli:
    def __init__(self, port: str, baud: int = 115200) -> None:
        s = serial.Serial()
        s.port, s.baudrate, s.timeout = port, baud, 0.2
        s.dtr = False  # set before open() so the ESP32-S3 is not reset
        s.rts = False
        s.open()
        time.sleep(0.3)
        s.reset_input_buffer()
        self.s = s

    def close(self) -> None:
        self.s.close()

    def _read_until_idle(self, idle: float = 1.5, total: float = 60.0) -> bytes:
        buf, last, start = b"", time.time(), time.time()
        while time.time() - start < total:
            chunk = self.s.read(8192)
            if chunk:
                buf, last = buf + chunk, time.time()
            elif buf and time.time() - last > idle:
                break
        return buf

    def run(self, command: str, idle: float = 1.5) -> bytes:
        """Sends one command and returns its output, without the echo line."""
        self.s.reset_input_buffer()
        self.s.write((command + "\n").encode())
        self.s.flush()
        raw = self._read_until_idle(idle)
        echo = ("COMMAND: " + command).encode()
        i = raw.find(echo)
        if i >= 0:
            raw = raw[i + len(echo) :].lstrip(b"\r\n")
        return raw

    def ls(self, path: str) -> list[tuple[str, str]]:
        """Returns (name, size-or-<DIR>) pairs."""
        text = self.run(f'ls "{path}"').decode(errors="replace")
        out = []
        for line in text.splitlines():
            if "\t" in line:
                name, size = line.rsplit("\t", 1)
                out.append((name, size.strip()))
        return out

    def md5(self, path: str) -> str:
        lines = self.run(f'md5 "{path}"').decode(errors="replace").strip().splitlines()
        return lines[0].strip() if lines else ""

    def size_of(self, path: str) -> int:
        parent, name = path.rsplit("/", 1)
        size = dict(self.ls(parent or "/")).get(name)
        if size is None or size == "<DIR>":
            raise SystemExit(f"Not a file on the device: {path}")
        return int(size)

    def pull(self, path: str, local: Path, size: int | None = None) -> str:
        """Reads a file with `cat` and keeps exactly `size` bytes; retries until the MD5 matches."""
        size = self.size_of(path) if size is None else size
        expected = self.md5(path)
        for _ in range(3):
            # `cat` prints the file and then "\r\n# " (the prompt): keep exactly `size` bytes.
            data = self.run(f'cat "{path}"', idle=2.0)[:size]
            if hashlib.md5(data).hexdigest() == expected:
                local.parent.mkdir(parents=True, exist_ok=True)
                local.write_bytes(data)
                return expected
        raise SystemExit(f"MD5 mismatch after 3 tries: {path}")

    def push(self, local: Path, path: str) -> str:
        """Writes a text file with `storage write` (line based, ends with EOF) and verifies the MD5."""
        text = local.read_bytes().decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
        lines = text.split("\n")
        if lines and lines[-1] == "":
            lines.pop()
        if "EOF" in lines:
            raise SystemExit("The file has a line that is exactly 'EOF'; storage write cannot send it.")
        expected = ("\n".join(lines) + "\n").encode("utf-8")  # Bruce stores every line with "\n"
        self.s.reset_input_buffer()
        self.s.write(f'storage write "{path}" {len(expected) + 64}\n'.encode())
        self.s.flush()
        time.sleep(0.8)
        for line in lines:
            self.s.write((line + "\n").encode("utf-8"))
            self.s.flush()
            time.sleep(0.02)
        self.s.write(b"EOF\n")
        self.s.flush()
        self._read_until_idle(idle=2.0)
        got = self.md5(path)
        want = hashlib.md5(expected).hexdigest()
        if got != want:
            raise SystemExit(f"MD5 mismatch after writing {path}: device {got}, expected {want}")
        return want


def walk(cli: BruceCli, path: str, found: list[tuple[str, int]], suffix: str) -> None:
    for name, size in cli.ls(path):
        full = path.rstrip("/") + "/" + name
        if size == "<DIR>":
            walk(cli, full, found, suffix)
        elif name.lower().endswith(suffix):
            found.append((full, int(size)))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", required=True, help="e.g. COM5, /dev/ttyACM0, /dev/cu.usbmodem101")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("info")
    sub.add_parser("ls").add_argument("path", nargs="?", default="/")
    b = sub.add_parser("backup-subs")
    b.add_argument("dest", type=Path)
    pl = sub.add_parser("pull")
    pl.add_argument("path")
    pl.add_argument("local", type=Path)
    ps = sub.add_parser("push")
    ps.add_argument("local", type=Path)
    ps.add_argument("path")
    sub.add_parser("mkdir").add_argument("path")
    cp = sub.add_parser("cp", help="copy a file into a folder")
    cp.add_argument("path")
    cp.add_argument("folder")
    mv = sub.add_parser("mv", help="rename/move (full destination path)")
    mv.add_argument("path")
    mv.add_argument("new_path")
    sub.add_parser("run").add_argument("command")
    args = parser.parse_args()

    cli = BruceCli(args.port)
    try:
        if args.cmd == "info":
            print(cli.run("info").decode(errors="replace").rstrip("# \r\n"))
        elif args.cmd == "ls":
            for name, size in cli.ls(args.path):
                print(f"{name}\t{size}")
        elif args.cmd == "backup-subs":
            found: list[tuple[str, int]] = []
            walk(cli, "/", found, ".sub")
            for path, size in found:
                digest = cli.pull(path, args.dest.joinpath(*path.strip("/").split("/")), size)
                print(f"OK  {path}  {size} B  md5 {digest}")
            print(f"{len(found)} file(s) saved to {args.dest}")
        elif args.cmd == "pull":
            print(f"OK  {args.path} -> {args.local}  md5 {cli.pull(args.path, args.local)}")
        elif args.cmd == "push":
            print(f"OK  {args.local} -> {args.path}  md5 {cli.push(args.local, args.path)}")
        elif args.cmd == "mkdir":
            print(cli.run(f'storage mkdir "{args.path}"').decode(errors="replace").rstrip("# \r\n"))
        elif args.cmd == "cp":
            print(cli.run(f'storage copy "{args.path}" "{args.folder}"').decode(errors="replace").rstrip("# \r\n"))
        elif args.cmd == "mv":
            print(cli.run(f'storage rename "{args.path}" "{args.new_path}"').decode(errors="replace").rstrip("# \r\n"))
        elif args.cmd == "run":
            sys.stdout.write(cli.run(args.command, idle=2.0).decode(errors="replace"))
    finally:
        cli.close()


if __name__ == "__main__":
    main()
