// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#include "RelayClient.h"

namespace gate_relay {

void RelayClient::begin(const GateRelayConfig &config, const char *caPem, TextHandler onText, StateHandler onState) {
    onText_ = std::move(onText);
    onState_ = std::move(onState);

    // Replaces the library's default "Origin: file://" header.
    headers_ = "Authorization: Bearer " + config.token;
    if (!config.accessClientId.empty()) {
        headers_ += "\r\nCF-Access-Client-Id: " + config.accessClientId;
        headers_ += "\r\nCF-Access-Client-Secret: " + config.accessClientSecret;
    }
    ws_.setExtraHeaders(headers_.c_str());

    ws_.onEvent([this](WStype_t type, uint8_t *payload, size_t length) {
        switch (type) {
            case WStype_CONNECTED:
                backoff_.reset();
                retryMs_ = 0;
                ws_.setReconnectInterval(backoff_.next());
                if (onState_) onState_(true);
                break;
            case WStype_DISCONNECTED:
                retryMs_ = backoff_.next();
                ws_.setReconnectInterval(retryMs_);
                if (onState_) onState_(false);
                break;
            case WStype_TEXT:
                if (onText_ && payload) onText_(std::string(reinterpret_cast<const char *>(payload), length));
                break;
            default: break;
        }
    });

    const WsUrl &e = config.endpoint;
    if (e.secure) {
        ws_.beginSslWithCA(e.host.c_str(), e.port, e.path.c_str(), caPem, "");
    } else {
        ws_.begin(e.host.c_str(), e.port, e.path.c_str(), "");
    }
    ws_.setReconnectInterval(backoff_.next());
    // WebSocket-level pings detect half-open connections (e.g. after a router reboot).
    ws_.enableHeartbeat(20000, 5000, 2);
}

bool RelayClient::send(const std::string &text) {
    if (!ws_.isConnected()) return false;
    return ws_.sendTXT(text.c_str(), text.size());
}

} // namespace gate_relay
