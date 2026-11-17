# Firmware setup (T-Embed CC1101 + Bruce)

The Gate Relay is a small module compiled **into Bruce**. No fork of Bruce is needed:
`firmware/scripts/gate_relay_fw.py` downloads the Bruce release named in
[`firmware/BRUCE_VERSION`](../firmware/BRUCE_VERSION), copies the module in and adds a few marked lines
(the RF menu entry, the startup app, the WebSocket library and a FastLED pin).

Most people don't need to build anything: ready-to-flash images are published under
[Releases](https://github.com/douglasrolim/bruce-gate-relay/releases) (see *Option A* below).

## 1. Back up the device first

```bash
python -m esptool --port COM5 read-flash 0 ALL flash-backup.bin   # Windows: COMx, Linux: /dev/ttyACM0
```

Also copy your `.sub` files somewhere safe. Over USB, MD5-verified:
`python tools/bruce-serial/bruce_serial.py --port COM5 backup-subs backup/sub` (or use the Bruce WebUI).
Flashing a Gate Relay image does not touch the LittleFS/SD data, but backups are cheap. To restore the exact
previous state: `python -m esptool --port COM5 write-flash 0 flash-backup.bin`.
The full, step-by-step process is in the [walkthrough](walkthrough.md).

Finding the port: Windows Device Manager → *Ports (COM & LPT)* → "USB Serial Device" (VID 303A).
Bluetooth COM ports are not it. Linux: `/dev/ttyACM0`; macOS: `/dev/cu.usbmodem*`.

## 2. Option A: flash a release (no build)

1. Download `bruce-<version>-gate-relay-lilygo-t-embed-cc1101.bin` and its `.sha256` from
   [Releases](https://github.com/douglasrolim/bruce-gate-relay/releases).
2. Check it: `certutil -hashfile <file> SHA256` (Windows) or `sha256sum <file>` (Linux/macOS).
3. Flash the merged image (bootloader + partition table + app) at address 0:

```bash
python -m pip install esptool
python -m esptool --port COM5 write-flash 0x0 bruce-1.16.1-gate-relay-lilygo-t-embed-cc1101.bin
```

The image ends well before the LittleFS partition, so your files stay.

## 3. Option B: build from source

### Windows notes

- Use **PowerShell or cmd**, not Git Bash/MSYS: the ESP-IDF tools refuse MSYS shells (the script stops with a clear message).
- PlatformIO must be on `PATH`. If `pio` is "not recognized", add the folder printed by
  `python -c "import sysconfig; print(sysconfig.get_path('scripts', 'nt_user'))"` (e.g. `%APPDATA%\Python\Python314\Scripts`).
  The script also adds it for its own run.
- Long paths: some libraries have long file names, and folders like OneDrive make paths longer. Run once
  `git config --global core.longpaths true` (and, as administrator, enable *Win32 long paths* in Group Policy or
  `New-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force`),
  or keep the repository in a short path such as `C:\src\bruce-gate-relay`.
- The host unit tests (`test`) need a C++ compiler (`gcc`/`g++`). On Windows, run them in
  [WSL](https://learn.microsoft.com/windows/wsl/install) or install MinGW-w64. CI runs them on Linux.
- The first build downloads the ESP32 toolchain (~1–2 GB) and takes several minutes.
- `integrate` pins FastLED to 3.10.3: newer FastLED releases clash with Bruce 1.16.1 (`#define FP`).

```bash
python -m pip install platformio
python firmware/scripts/gate_relay_fw.py test                 # host unit tests (no hardware, needs gcc)
python firmware/scripts/gate_relay_fw.py build                # downloads Bruce if needed, then builds
python firmware/scripts/gate_relay_fw.py flash --port COM5    # build + upload (app partitions only)
python firmware/scripts/gate_relay_fw.py package              # build + dist/<name>.bin and .sha256
python firmware/scripts/gate_relay_fw.py monitor --port COM5  # serial log, 115200 baud
```

`--bruce-tag 1.17` tries another Bruce release (the checkout in `firmware/bruce/` is replaced).

### When Bruce releases a new version

The [Firmware release](../.github/workflows/release.yml) workflow does this every Monday: it builds the
latest Bruce with the module and publishes a release `bruce-<tag>`, or opens an issue if the build breaks.
You can also run it by hand (*Actions → Firmware release → Run workflow*, optional Bruce tag).

Locally: `python firmware/scripts/gate_relay_fw.py build --bruce-tag <new tag>`. If it builds and works on
the device, update `firmware/BRUCE_VERSION` and commit. If an anchor moved in Bruce, `integrate` stops with
a clear message naming the file to look at.

**Careful:** the official Bruce installer (Web Flasher, OTA) installs Bruce *without* Gate Relay.

Finding the port: Windows Device Manager → *Ports (COM & LPT)* → "USB Serial Device" (VID 303A).
Bluetooth COM ports are not it. Linux: `/dev/ttyACM0`; macOS: `/dev/cu.usbmodem*`.

If the upload fails: unplug USB, **hold BOOT**, plug it back in, release BOOT, and run `flash` again.

## 4. Configure the device

Copy `firmware/gate-relay.example.json` to **`/gate-relay.json`** on the SD card. Without a working SD
card, Bruce uses its internal LittleFS: put the file there (Bruce WebUI → *LittleFS*, or over USB with
`python tools/bruce-serial/bruce_serial.py --port COM5 push gate-relay.json /gate-relay.json`).

| Field | Required | Default | Description |
|---|---|---|---|
| `url` | yes | – | `wss://gate.example.com/device` |
| `token` | yes | – | The `DEVICE_TOKEN` secret (32+ characters) |
| `accessClientId` | yes* | – | Cloudflare Access service token client ID |
| `accessClientSecret` | yes* | – | Service token client secret |
| `folder` | no | `/BruceRF/gates` | The only folder gates are read from |
| `caFile` | no | – | Extra PEM root certificate(s), if your domain uses an unusual CA |

\* Required whenever `/device` is behind Cloudflare Access (the default setup).

Then:

1. Put your gate signals in the folder as `<Name>.sub` (e.g. `Garage.sub`, `Main Entrance.sub`).
   The file name is the gate name shown in the app.
2. Connect Bruce to your Wi-Fi once (*WiFi → Connect*) so the network is saved.
3. Open **RF → Gate Relay**. Accept the notice the first time. The screen shows Wi-Fi, IP, server
   status, number of gates and the last command. Press **Esc/Back** to leave.
4. Optional, dedicated relay: *Config → Startup App → Gate Relay* starts it on every boot.

## Troubleshooting

| Screen says | Fix |
|---|---|
| `Config error: /gate-relay.json not found` | Copy the file to the SD root (or LittleFS root) |
| `token must have 32+ characters` | Use the generated `DEVICE_TOKEN` |
| `Server: Retry in …` | Check the URL, Wi-Fi internet access, `DEVICE_TOKEN`, the Access service token and the Service Auth policy. `npx wrangler tail` shows rejected connections |
| `Gates: 0` | Files must end in `.sub` and live directly in the folder |
| `Failed: … TX_FAILED` | The `.sub` file could not be parsed or sent; test it from *RF → Custom SubGHz* |
