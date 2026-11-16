// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#pragma once
#include "RelayCore.h"
#include <Arduino.h>

namespace gate_relay {

struct ScreenState {
    String wifi;      // "Connected" / "Connecting…"
    String ip;
    String server;    // "Online" / "Connecting…" / "Retry in 8 s"
    int gates = 0;
    String storage;   // "SD" / "LittleFS"
    unsigned events = 0;
    RelayEvent last;
    uint32_t lastAt = 0;
};

/// Renders the relay status on the device screen; only redraws when something changed.
class GateRelayScreen {
public:
    void drawFrame();
    void update(const ScreenState &s);
    void message(const String &title, const String &body, bool error);

private:
    String fingerprint_;
};

} // namespace gate_relay
