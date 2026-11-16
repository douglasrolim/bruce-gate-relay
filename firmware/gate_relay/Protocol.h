// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

// Device <-> server protocol v1 (see docs/architecture.md). Pure C++ + ArduinoJson,
// unit-tested on the host with `pio test -e native`.
#pragma once
#include <string>
#include <vector>

namespace gate_relay {

constexpr int kProtocolVersion = 1;
constexpr size_t kMaxMessageBytes = 4096;

enum class ServerMessageType { Open, Ping, Unknown, Invalid };

struct ServerMessage {
    ServerMessageType type = ServerMessageType::Invalid;
    std::string id;   // Open only
    std::string gate; // Open only
};

/// Parses a frame from the server. Never throws; bad input yields Invalid/Unknown.
ServerMessage parseServerMessage(const std::string &text);

std::string encodeHello(const std::string &fw, const std::vector<std::string> &gates);
std::string encodeResult(const std::string &id, bool ok, const char *error = nullptr);
std::string encodePong();

bool isUuid(const std::string &s);

} // namespace gate_relay
