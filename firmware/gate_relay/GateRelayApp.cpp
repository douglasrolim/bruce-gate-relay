// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#include "GateRelayApp.h"

#include "BruceRfTransmitter.h"
#include "CaRoots.h"
#include "FsGateRepository.h"
#include "RelayClient.h"
#include "RelayCore.h"
#include "gate_relay.h"

#include "core/display.h"
#include "core/sd_functions.h"
#include "core/wifi/wifi_common.h"
#include "globals.h"
#include <WiFi.h>

namespace gate_relay {

static constexpr const char *kAcceptedFlag = "/gate-relay.accepted";

bool GateRelayApp::waitForExit() {
    while (true) {
        if (check(EscPress) || check(SelPress)) return false;
        delay(20);
    }
}

/// Short legal notice on first run (full text: LEGAL.md in the repository).
bool GateRelayApp::acceptNotice(fs::FS &fs) {
    if (fs.exists(kAcceptedFlag)) return true;
    screen_.message(
        "Gate Relay",
        "Use only on gates you own or are\nauthorized to operate. Fixed-code\nremotes only. Follow local radio\nrules. Make sure opening the gate\nis safe. No warranty.\n\nSel: accept   Esc: exit",
        false
    );
    while (true) {
        if (check(SelPress)) {
            File f = fs.open(kAcceptedFlag, FILE_WRITE, true);
            if (f) {
                f.print("accepted\n");
                f.close();
            }
            return true;
        }
        if (check(EscPress)) return false;
        delay(20);
    }
}

bool GateRelayApp::ensureWifi() {
    WiFi.setAutoReconnect(true);
    if (WiFi.status() == WL_CONNECTED) return true;
    screen_.message("Gate Relay", "Connecting to a saved Wi-Fi...", false);
    if (wifiConnecttoKnownNet()) return true;
    // No saved network in range: let the user pick one with Bruce's own menu.
    wifiConnectMenu();
    return WiFi.status() == WL_CONNECTED;
}

std::string GateRelayApp::loadCaBundle(fs::FS &fs, const GateRelayConfig &config) {
    std::string pem = GATE_RELAY_CA_ROOTS;
    if (config.caFile.empty()) return pem;
    File f = fs.open(config.caFile.c_str(), FILE_READ);
    if (f && f.size() < 16 * 1024) {
        pem += "\n";
        while (f.available()) pem += static_cast<char>(f.read());
    }
    if (f) f.close();
    return pem;
}

void GateRelayApp::run() {
    FS *fs = nullptr;
    if (!getFsStorage(fs) || !fs) {
        screen_.message("Gate Relay", "No storage available\n(SD card or LittleFS).", true);
        waitForExit();
        return;
    }
    const String storage = sdcardMounted ? "SD" : "LittleFS";

    if (!acceptNotice(*fs)) return;

    GateRelayConfig config;
    std::string error;
    if (!config.load(*fs, error)) {
        screen_.message(
            "Gate Relay", String("Config error:\n") + error.c_str() + "\n\nCreate /gate-relay.json\n(see README).\n\nEsc: exit", true
        );
        waitForExit();
        return;
    }

    if (!ensureWifi()) {
        screen_.message("Gate Relay", "No Wi-Fi connection.\n\nEsc: exit", true);
        waitForExit();
        return;
    }

    FsGateRepository repo(*fs, config.folder);
    BruceRfTransmitter tx(*fs);
    RelayCore core(repo, tx, GATE_RELAY_FW_VERSION);
    RelayClient client;
    const std::string ca = loadCaBundle(*fs, config);

    ScreenState state;
    state.storage = storage;
    bool online = false;

    client.begin(
        config,
        ca.c_str(),
        [&](const std::string &frame) {
            std::string reply;
            const unsigned before = core.eventCount();
            if (core.handle(frame, reply)) client.send(reply);
            if (core.eventCount() != before) {
                state.events = core.eventCount();
                state.last = core.lastEvent();
                state.lastAt = millis();
            }
        },
        [&](bool connected) {
            online = connected;
            // Rescan on every connection so new or renamed .sub files are announced.
            if (connected) client.send(core.hello());
        }
    );

    screen_.drawFrame();
    uint32_t lastDraw = 0;
    while (true) {
        client.loop();

        if (check(EscPress)) break;

        const uint32_t now = millis();
        if (now - lastDraw > 250) {
            lastDraw = now;
            const bool wifiUp = WiFi.status() == WL_CONNECTED;
            state.wifi = wifiUp ? "Connected" : "Reconnecting...";
            state.ip = wifiUp ? WiFi.localIP().toString() : "";
            state.gates = static_cast<int>(core.gates().size());
            if (online) state.server = "Online";
            else if (!wifiUp) state.server = "Waiting for Wi-Fi";
            else if (client.nextRetryMs()) state.server = "Retry in " + String(client.nextRetryMs() / 1000) + " s";
            else state.server = "Connecting...";
            screen_.update(state);
        }
        delay(2); // yield to Wi-Fi/TLS tasks without blocking the loop
    }

    client.stop();
}

} // namespace gate_relay

void gate_relay_start() {
    gate_relay::GateRelayApp app;
    app.run();
}
