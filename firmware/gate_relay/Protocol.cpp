// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#include "Protocol.h"

#include "GateNames.h"
#include <ArduinoJson.h>

namespace gate_relay {

bool isUuid(const std::string &s) {
    if (s.size() != 36) return false;
    for (size_t i = 0; i < s.size(); i++) {
        const char c = s[i];
        if (i == 8 || i == 13 || i == 18 || i == 23) {
            if (c != '-') return false;
        } else if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
            return false;
        }
    }
    return true;
}

ServerMessage parseServerMessage(const std::string &text) {
    ServerMessage msg;
    if (text.empty() || text.size() > kMaxMessageBytes) return msg;

    JsonDocument doc;
    if (deserializeJson(doc, text) != DeserializationError::Ok) return msg;
    if (!doc.is<JsonObject>() || doc["v"].as<int>() != kProtocolVersion) return msg;

    const char *type = doc["type"].as<const char *>();
    if (!type) return msg;
    const std::string t(type);

    if (t == "ping") {
        msg.type = ServerMessageType::Ping;
    } else if (t == "open") {
        const char *id = doc["id"].as<const char *>();
        const char *gate = doc["gate"].as<const char *>();
        if (!id || !gate || !isUuid(id)) return msg; // Invalid
        msg.id = id;
        msg.gate = gate; // validated by RelayCore (it must report INVALID_NAME with the id)
        msg.type = ServerMessageType::Open;
    } else {
        msg.type = ServerMessageType::Unknown;
    }
    return msg;
}

std::string encodeHello(const std::string &fw, const std::vector<std::string> &gates) {
    JsonDocument doc;
    doc["v"] = kProtocolVersion;
    doc["type"] = "hello";
    doc["fw"] = fw;
    JsonArray arr = doc["gates"].to<JsonArray>();
    size_t n = 0;
    for (const auto &g : gates) {
        if (n++ >= kMaxGates) break;
        arr.add(g);
    }
    std::string out;
    serializeJson(doc, out);
    return out;
}

std::string encodeResult(const std::string &id, bool ok, const char *error) {
    JsonDocument doc;
    doc["v"] = kProtocolVersion;
    doc["type"] = "result";
    doc["id"] = id;
    doc["ok"] = ok;
    if (!ok && error) doc["error"] = error;
    std::string out;
    serializeJson(doc, out);
    return out;
}

std::string encodePong() { return "{\"v\":1,\"type\":\"pong\"}"; }

} // namespace gate_relay
