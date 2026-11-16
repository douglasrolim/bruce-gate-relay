// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#pragma once
#include "Interfaces.h"
#include <string>
#include <vector>

namespace gate_relay {

struct RelayEvent {
    std::string gate;
    bool ok = false;
    std::string error; // empty on success
};

/**
 * Protocol logic, independent of WebSockets, Wi-Fi and the screen:
 * turns server frames into transmissions and replies.
 */
class RelayCore {
public:
    RelayCore(IGateRepository &gates, ITransmitter &tx, std::string firmware);

    /// Rescans the gates folder and returns the "hello" frame to send after connecting.
    std::string hello();

    /// Handles one server frame. Returns true and fills `reply` when something must be sent back.
    bool handle(const std::string &frame, std::string &reply);

    const std::vector<std::string> &gates() const { return gates_; }
    bool hasEvent() const { return eventCount_ > 0; }
    const RelayEvent &lastEvent() const { return last_; }
    unsigned eventCount() const { return eventCount_; }

private:
    IGateRepository &repo_;
    ITransmitter &tx_;
    std::string firmware_;
    std::vector<std::string> gates_;
    RelayEvent last_;
    unsigned eventCount_ = 0;
};

} // namespace gate_relay
