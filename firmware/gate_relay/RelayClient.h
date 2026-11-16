// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#pragma once
#include "Backoff.h"
#include "GateRelayConfig.h"
#include <WebSocketsClient.h>
#include <functional>
#include <string>

namespace gate_relay {

/// Outbound secure WebSocket to the Worker: TLS with pinned root CAs, auth headers,
/// heartbeat and exponential reconnect backoff (2 s → 60 s).
class RelayClient {
public:
    using TextHandler = std::function<void(const std::string &)>;
    using StateHandler = std::function<void(bool connected)>;

    void begin(const GateRelayConfig &config, const char *caPem, TextHandler onText, StateHandler onState);
    void loop() { ws_.loop(); }
    bool send(const std::string &text);
    bool connected() { return ws_.isConnected(); }
    void stop() { ws_.disconnect(); }
    uint32_t nextRetryMs() const { return retryMs_; }

private:
    WebSocketsClient ws_;
    Backoff backoff_;
    uint32_t retryMs_ = 0;
    std::string headers_;
    TextHandler onText_;
    StateHandler onState_;
};

} // namespace gate_relay
