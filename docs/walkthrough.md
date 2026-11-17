# Complete walkthrough: from a stock T-Embed to opening a gate from your phone

This is the whole process, in order, as it was done on a real LilyGO T-Embed CC1101 running Bruce 1.16.1
on Windows 11. Every step says what to run, what you should see, and how to check it. The other docs go
deeper on each part; this page is the path through all of them.

```
 1. Tools            →  2. Back up the device  →  3. Record and organize gate signals
 4. Cloudflare       →  5. Build the firmware  →  6. Flash it
 7. Configure device →  8. First open          →  9. Go wireless
```

Replace the examples with your own values: `COM5` (your serial port), `gate.example.com` (your domain),
`1.16.1` (your Bruce version).

> [!IMPORTANT]
> Only for gates you own or are allowed to operate, with **fixed-code** remotes. Read [LEGAL.md](../LEGAL.md).

---

## 1. Tools

| Tool | Why | Check |
|---|---|---|
| [Python 3](https://www.python.org/) | build scripts, serial tools | `python --version` |
| `pip install pyserial esptool platformio` | serial CLI, flash backup, firmware build | `python -m esptool version`, `python -m platformio --version` |
| [Git](https://git-scm.com/) | sources | `git --version` |
| [Node.js](https://nodejs.org/) 22+ | Cloudflare Worker | `node -v` |
| (optional) [GitHub CLI](https://cli.github.com/) | fork/PRs | `gh --version` |

**Find the serial port.** Plug the T-Embed in with a data USB cable.

- Windows: Device Manager → *Ports (COM & LPT)* → **USB Serial Device** (hardware ID `VID_303A&PID_1001`,
  the ESP32-S3 native USB). Ports named *Standard Serial over Bluetooth link* are **not** it.
  PowerShell: `Get-CimInstance Win32_PnPEntity | ? Name -match 'COM\d+' | select Name, DeviceID`
- Linux: `/dev/ttyACM0` · macOS: `/dev/cu.usbmodem*`

Close any serial monitor before running the commands below: only one program can open the port.

## 2. Back up the device (before touching the firmware)

### 2.1 Identify the firmware

```bash
python tools/bruce-serial/bruce_serial.py --port COM5 info
```

You should see something like `Bruce v1.16.1`, a commit such as `ba519c9`, and `Device: Lilygo T-Embed CC1101`.
**Write the version down**: the firmware you build later must start from the same Bruce tag.

The boot log also tells you which storage the CLI uses. `SDCARD NOT mounted` means everything lives on
the internal **LittleFS**.

### 2.2 Back up every `.sub` file (MD5-verified)

```bash
python tools/bruce-serial/bruce_serial.py --port COM5 backup-subs backup/sub
```

The tool walks the whole file system with Bruce's `ls`, reads each `.sub` with `cat`, and compares
it with Bruce's own `md5`. You should see one `OK  /path  size  md5` line per file. Behind the scenes,
`cat` appends `\r\n# ` (the prompt) after the content, so the tool keeps exactly the file size reported by `ls`.

### 2.3 Back up the whole flash

```bash
python -m esptool --port COM5 read-flash 0 ALL backup/flash.bin
```

This reads all 16 MB (about 3 minutes) and resets the board at the end. Keep the file and its hash
(`Get-FileHash backup/flash.bin` or `sha256sum backup/flash.bin`).
To return to exactly this state later: `python -m esptool --port COM5 write-flash 0 backup/flash.bin`.

> Keep `backup/` **outside** the repository. It contains your signals.

## 3. Record and organize the gate signals

1. In Bruce, record the remote (*RF → Scan/Copy*), save it, and **replay it from the device** to confirm the
   gate opens. Fixed-code remotes decode as plain protocols such as *RcSwitch* (24–28 bits) and replay
   every time. Rolling-code remotes do not work.
2. Put each gate in **`/BruceRF/gates/`**. The file name is the name shown in the app. From the PC:

   ```bash
   python tools/bruce-serial/bruce_serial.py --port COM5 mkdir /BruceRF/gates
   python tools/bruce-serial/bruce_serial.py --port COM5 cp /BruceRF/rcs.sub /BruceRF/gates
   python tools/bruce-serial/bruce_serial.py --port COM5 mv /BruceRF/gates/rcs.sub "/BruceRF/gates/Main Gate.sub"
   python tools/bruce-serial/bruce_serial.py --port COM5 ls /BruceRF/gates
   ```

   Names with spaces work. The tool quotes them for Bruce's CLI. If you type raw commands
   (`run "..."`) from Windows PowerShell 5.1, inner double quotes are stripped before they reach Python,
   so prefer the `cp`/`mv` subcommands.

## 4. Cloudflare (Worker + Access)

Full details: [setup-cloudflare.md](setup-cloudflare.md) and [authentication.md](authentication.md).

```bash
cd worker
npm install
cp wrangler.toml.example wrangler.toml   # domain, Access team + AUD, allowed/admin emails
npm run format && npm run lint && npm run typecheck && npx vitest run
npx wrangler login                        # authorize in the browser
npx wrangler secret put DEVICE_TOKEN      # paste a random 32+ char token (see setup-cloudflare.md)
npm run deploy                            # should list: gate.example.com (custom domain)
```

In **Zero Trust → Access → Applications**, the app for `gate.example.com` needs:

- an **Allow** policy with your emails (Google and/or one-time PIN login), and
- a **Service Auth** policy that includes the device's **Service Token**. Without it, the device is rejected.

**Check the two device layers** (the first answer comes from Access, the others from the Worker):

| Request to `https://gate.example.com/device` | Expected |
|---|---|
| no headers | `302` redirect to the Access login |
| service token only (`CF-Access-Client-Id/Secret`) | `401` **JSON** `{"error":"UNAUTHENTICATED"}` from the Worker |
| service token + `Authorization: Bearer <DEVICE_TOKEN>` | `426` JSON `UPGRADE_REQUIRED` (fine: curl is not a WebSocket) |

A `401` with an **HTML** page titled *Cloudflare Access* means Access rejected the service token: the
Service Auth policy is missing, or the client secret is wrong.

## 5. Build the firmware

```bash
git clone --depth 1 --branch 1.16.1 https://github.com/BruceDevices/firmware firmware/bruce   # same tag as 2.1
python firmware/scripts/gate_relay_fw.py test     # host unit tests (needs gcc/g++, see below)
python firmware/scripts/gate_relay_fw.py build    # integrate the module + pio run
```

`build` first runs `integrate`. It copies `firmware/gate_relay/` into `firmware/bruce/src/modules/gate_relay/`,
adds the **RF → Gate Relay** menu entry and the startup app, adds the WebSocket library, and pins FastLED to 3.10.3.
Review the changes with `git -C firmware/bruce diff`. The first build downloads the ESP32 toolchain (1–2 GB)
and takes 10+ minutes. You should end with `[SUCCESS]`, RAM ≈ 37 %, Flash ≈ 26 %.

**Windows pitfalls we hit (and the fixes):**

| Symptom | Fix |
|---|---|
| `MSys/Mingw is not supported` / `xtensa-esp32s3-elf-g++ is not recognized` | Build from **PowerShell or cmd**, not Git Bash |
| `'pio' is not recognized` | Add the Python *Scripts* folder to `PATH` (`python -c "import sysconfig; print(sysconfig.get_path('scripts','nt_user'))"`) |
| `Filename too long` while cloning a library | `git config --global core.longpaths true`, or use a short path such as `C:\src` |
| `cannot find -lnet80211` | A previous build was interrupted while Bruce's `patch.py` was patching the Wi-Fi library. Recreate it: `pio pkg exec -p toolchain-xtensa-esp32s3 -- xtensa-esp32s3-elf-objcopy --weaken-symbol=ieee80211_raw_frame_sanity_check <libs>/esp32s3/lib/libnet80211.a.old <libs>/esp32s3/lib/libnet80211.a` (`<libs>` = `~/.platformio/packages/framework-arduinoespressif32-libs`) |
| FastLED errors around `pins_arduino.h:52` (`#define FP`) | Already handled: `integrate` pins FastLED 3.10.3 |
| `'gcc' is not recognized` in `test` | Run the host tests in WSL or install MinGW-w64 (CI runs them on Linux) |

## 6. Flash

```bash
python firmware/scripts/gate_relay_fw.py flash --port COM5
```

This writes only the bootloader, partition table and app (`Hash of data verified.` four times), so
LittleFS/SD files survive. Confirm afterwards:

```bash
python tools/bruce-serial/bruce_serial.py --port COM5 info              # Bruce vdev (local build)
python tools/bruce-serial/bruce_serial.py --port COM5 ls /BruceRF/gates  # your gates are still there
```

If the upload can't connect: unplug USB, hold **BOOT**, plug it back in, release BOOT, and run `flash` again.

## 7. Configure the device

Create `gate-relay.json` from [`firmware/gate-relay.example.json`](../firmware/gate-relay.example.json)
(fields in [setup-firmware.md](setup-firmware.md#4-configure-the-device)) and copy it to the device root:

```bash
python tools/bruce-serial/bruce_serial.py --port COM5 push secrets/gate-relay.json /gate-relay.json
```

You should get `OK … md5 …`: the tool sends the file with Bruce's `storage write` and compares the MD5.
Keep this file private. It holds the device token and the Access service token.

Connect Bruce to your Wi-Fi once (*WiFi → Connect*) so the network is saved.

## 8. First open

1. On the device: **RF → Gate Relay**. Accept the notice the first time. The screen shows Wi-Fi, IP and server status.
2. On the phone: open `https://gate.example.com`, sign in. The pill turns **Online** and your gates appear.
3. **Press and hold** a gate card. The card shows *Sending…* and then **Signal sent** ✓.
4. Optional, the serial log confirms it (`python firmware/scripts/gate_relay_fw.py monitor --port COM5`):

   ```
   Selected: Gate Relay
   Connected to: <your Wi-Fi>
   Opened sub file.
   Sent 1 of 1 signals
   ```

If the device **reboots with an orange screen** right after Wi-Fi connects, read the `Guru Meditation`
backtrace from the serial monitor and decode it with
`xtensa-esp-elf-addr2line -pfiaC -e firmware/bruce/.pio/build/lilygo-t-embed-cc1101/firmware.elf <addresses>`.
(One such crash, in the WebSockets TLS setup, is already fixed in `RelayClient.cpp`.)

## 9. Go wireless

Unplug the USB cable and power the T-Embed from its battery or a USB charger, placed where:

- the Wi-Fi reaches it, and
- its 433 MHz signal reaches the gate (test from the device first).

Keep **Gate Relay** open on the device. Leaving the module makes the app show *Offline*. For a dedicated
relay, set *Config → Startup App → Gate Relay* so it starts on every boot.

Done. Next: set gate locations, invite guests, and day-to-day operations are in the [README](../README.md#using-the-app).
