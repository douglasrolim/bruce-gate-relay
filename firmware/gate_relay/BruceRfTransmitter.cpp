// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#include "BruceRfTransmitter.h"

#include "modules/rf/rf_send.h"

namespace gate_relay {

TxResult BruceRfTransmitter::transmit(const std::string &path) {
    if (!fs_.exists(path.c_str())) return TxResult::NotFound;
    RfCodes data{};
    if (!readSubFile(&fs_, String(path.c_str()), data)) return TxResult::Failed;
    // hideDefaultUI = true: our own screen shows the result.
    return txSubFile(data, true) ? TxResult::Ok : TxResult::Failed;
}

} // namespace gate_relay
