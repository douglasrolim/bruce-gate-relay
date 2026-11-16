// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#pragma once
#include "WsUrl.h"
#include <FS.h>
#include <string>

namespace gate_relay {

constexpr const char *kConfigPath = "/gate-relay.json";
constexpr const char *kDefaultFolder = "/BruceRF/gates";

/// Contents of /gate-relay.json (SD card, or LittleFS when no card is mounted).
struct GateRelayConfig {
    std::string url;                 // wss://gate.example.com/device
    WsUrl endpoint;                  // parsed url
    std::string token;               // DEVICE_TOKEN
    std::string accessClientId;      // Cloudflare Access service token
    std::string accessClientSecret;
    std::string folder = kDefaultFolder;
    std::string caFile;              // optional PEM file with extra root CAs
    bool allowInsecure = false;      // ws:// for local tests only

    /// Loads and validates the file. On failure returns false and a human-readable error.
    bool load(fs::FS &fs, std::string &error);
};

} // namespace gate_relay
