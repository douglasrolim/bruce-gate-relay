// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#include "RelayCore.h"

#include "GateNames.h"
#include "Protocol.h"

#include <utility>

namespace gate_relay {

RelayCore::RelayCore(IGateRepository &gates, ITransmitter &tx, std::string firmware)
    : repo_(gates), tx_(tx), firmware_(std::move(firmware)) {}

std::string RelayCore::hello() {
    gates_ = repo_.refresh();
    return encodeHello(firmware_, gates_);
}

bool RelayCore::handle(const std::string &frame, std::string &reply) {
    const ServerMessage msg = parseServerMessage(frame);
    switch (msg.type) {
        case ServerMessageType::Ping:
            reply = encodePong();
            return true;

        case ServerMessageType::Open: {
            const char *error = nullptr;
            std::string path;
            if (!isValidGateName(msg.gate)) {
                error = "INVALID_NAME";
            } else if (!repo_.resolve(msg.gate, path)) {
                error = "GATE_NOT_FOUND";
            } else {
                switch (tx_.transmit(path)) {
                    case TxResult::Ok: break;
                    case TxResult::NotFound: error = "GATE_NOT_FOUND"; break;
                    case TxResult::Failed: error = "TX_FAILED"; break;
                }
            }
            last_.gate = isValidGateName(msg.gate) ? msg.gate : "?";
            last_.ok = error == nullptr;
            last_.error = error ? error : "";
            eventCount_++;
            reply = encodeResult(msg.id, error == nullptr, error);
            return true;
        }

        case ServerMessageType::Unknown:
        case ServerMessageType::Invalid:
        default:
            return false; // ignore: forward compatible and safe
    }
}

} // namespace gate_relay
