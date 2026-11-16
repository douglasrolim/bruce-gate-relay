// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#include "WsUrl.h"

#include <cstdlib>

namespace gate_relay {

bool parseWsUrl(const std::string &url, WsUrl &out, bool allowInsecure) {
    std::string rest;
    if (url.rfind("wss://", 0) == 0) {
        out.secure = true;
        out.port = 443;
        rest = url.substr(6);
    } else if (allowInsecure && url.rfind("ws://", 0) == 0) {
        out.secure = false;
        out.port = 80;
        rest = url.substr(5);
    } else {
        return false;
    }

    const size_t slash = rest.find('/');
    std::string authority = slash == std::string::npos ? rest : rest.substr(0, slash);
    out.path = slash == std::string::npos ? "/" : rest.substr(slash);
    if (authority.empty() || authority.find('@') != std::string::npos) return false;

    const size_t colon = authority.rfind(':');
    if (colon != std::string::npos) {
        const std::string portStr = authority.substr(colon + 1);
        if (portStr.empty() || portStr.size() > 5) return false;
        for (char c : portStr)
            if (c < '0' || c > '9') return false;
        const long port = std::strtol(portStr.c_str(), nullptr, 10);
        if (port < 1 || port > 65535) return false;
        out.port = static_cast<uint16_t>(port);
        authority = authority.substr(0, colon);
    }
    if (authority.empty()) return false;
    for (char c : authority) {
        const bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '.';
        if (!ok) return false;
    }
    out.host = authority;
    return true;
}

} // namespace gate_relay
