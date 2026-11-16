// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#pragma once
#include <cstdint>
#include <string>

namespace gate_relay {

struct WsUrl {
    bool secure = true;
    std::string host;
    uint16_t port = 443;
    std::string path = "/";
};

/// Parses "wss://host[:port]/path". Plain ws:// is accepted only when allowInsecure is true
/// (local testing); production always uses TLS.
bool parseWsUrl(const std::string &url, WsUrl &out, bool allowInsecure = false);

} // namespace gate_relay
