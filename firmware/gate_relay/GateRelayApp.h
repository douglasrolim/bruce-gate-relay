// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#pragma once
#include "GateRelayConfig.h"
#include "GateRelayScreen.h"
#include <FS.h>

namespace gate_relay {

/// Wires config, storage, Wi-Fi, the WebSocket client, the protocol core and the screen.
class GateRelayApp {
public:
    void run();

private:
    bool acceptNotice(fs::FS &fs);
    bool ensureWifi();
    bool waitForExit();
    std::string loadCaBundle(fs::FS &fs, const GateRelayConfig &config);

    GateRelayScreen screen_;
};

} // namespace gate_relay
