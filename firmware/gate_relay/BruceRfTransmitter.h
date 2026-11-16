// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#pragma once
#include "Interfaces.h"
#include <FS.h>

namespace gate_relay {

/// Thin adapter over Bruce's own .sub transmission (the same code path as
/// "subghz tx_from_file"). Transmission is not reimplemented here.
class BruceRfTransmitter : public ITransmitter {
public:
    explicit BruceRfTransmitter(fs::FS &fs) : fs_(fs) {}
    TxResult transmit(const std::string &path) override;

private:
    fs::FS &fs_;
};

} // namespace gate_relay
