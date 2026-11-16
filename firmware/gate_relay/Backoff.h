// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#pragma once
#include <cstdint>

namespace gate_relay {

/// Exponential reconnect backoff: 2 s, 4 s, 8 s ... capped at 60 s; reset on success.
class Backoff {
public:
    explicit Backoff(uint32_t initialMs = 2000, uint32_t maxMs = 60000) : initial_(initialMs), max_(maxMs), next_(initialMs) {}
    uint32_t next() {
        const uint32_t current = next_;
        next_ = next_ >= max_ / 2 ? max_ : next_ * 2;
        return current;
    }
    void reset() { next_ = initial_; }

private:
    uint32_t initial_;
    uint32_t max_;
    uint32_t next_;
};

} // namespace gate_relay
