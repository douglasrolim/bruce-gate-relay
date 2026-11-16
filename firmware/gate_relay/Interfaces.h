// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

// Small abstractions that keep the protocol logic testable without hardware.
#pragma once
#include <string>
#include <vector>

namespace gate_relay {

class IGateRepository {
public:
    virtual ~IGateRepository() = default;
    /// Rescans the allowed folder. Returns the gate names (sorted, validated).
    virtual std::vector<std::string> refresh() = 0;
    /// Resolves a gate name to its file path. Only names from the last refresh() resolve:
    /// the network never supplies paths.
    virtual bool resolve(const std::string &name, std::string &pathOut) const = 0;
};

enum class TxResult { Ok, NotFound, Failed };

class ITransmitter {
public:
    virtual ~ITransmitter() = default;
    virtual TxResult transmit(const std::string &path) = 0;
};

} // namespace gate_relay
