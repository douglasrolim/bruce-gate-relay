# Firmware setup (T-Embed CC1101 + Bruce)

The Gate Relay is a small module compiled **into Bruce**. Your Bruce fork carries only a few lines of
changes (menu entry, startup app, one library), applied by `firmware/scripts/gate_relay_fw.py`.

## 1. Back up the device first

Flashing replaces the firmware. The `upload` target writes only the bootloader, partition table and
app, so files on LittleFS/SD normally survive, but **back up anyway**:

```bash
python -m esptool --port COM5 read_flash 0 ALL flash-backup.bin   # Windows: COMx, Linux: /dev/ttyACM0
```

Also copy your `.sub` files somewhere safe (Bruce WebUI or the serial `cat` command). To restore the
exact previous state: `python -m esptool --port COM5 write_flash 0 flash-backup.bin`.

## 2. Get the sources

```bash
git clone --recursive https://github.com/<you>/bruce-gate-relay
python -m pip install platformio
```

`firmware/bruce` is a submodule pointing at your Bruce fork, pinned to the **same tag** as the firmware
on your device (check *Config → About* on the device, or the serial command `info`).

To create the fork the first time: fork <https://github.com/BruceDevices/firmware> on GitHub, then

```bash
git submodule add https://github.com/<you>/Bruce firmware/bruce
git -C firmware/bruce checkout -b gate-relay <tag, e.g. 1.16.1>
python firmware/scripts/gate_relay_fw.py integrate
git -C firmware/bruce add -A && git -C firmware/bruce commit -m "feat: add Gate Relay module"
git -C firmware/bruce push -u origin gate-relay
```

## 3. Build and flash

```bash
python firmware/scripts/gate_relay_fw.py test                 # host unit tests (no hardware)
python firmware/scripts/gate_relay_fw.py build                # env lilygo-t-embed-cc1101
python firmware/scripts/gate_relay_fw.py flash --port COM5
python firmware/scripts/gate_relay_fw.py monitor --port COM5  # serial log, 115200 baud
```

Finding the port: Windows Device Manager → *Ports (COM & LPT)* → "USB Serial Device" (VID 303A).
Bluetooth COM ports are not it. Linux: `/dev/ttyACM0`; macOS: `/dev/cu.usbmodem*`.

If the upload fails: unplug USB, **hold BOOT**, plug it back in, release BOOT, and run `flash` again.

## 4. Configure the device

Copy `firmware/gate-relay.example.json` to **`/gate-relay.json`** on the SD card. Without a working SD
card, Bruce uses its internal LittleFS: put the file there (Bruce WebUI → *LittleFS*, or the serial CLI).

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
