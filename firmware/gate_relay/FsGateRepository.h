// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#pragma once
#include "Interfaces.h"
#include <FS.h>

namespace gate_relay {

/// Lists the .sub files of ONE allowed folder. Names are validated; paths never come from the network.
class FsGateRepository : public IGateRepository {
public:
    FsGateRepository(fs::FS &fs, std::string folder) : fs_(fs), folder_(std::move(folder)) {}
    std::vector<std::string> refresh() override;
    bool resolve(const std::string &name, std::string &pathOut) const override;

private:
    fs::FS &fs_;
    std::string folder_;
    std::vector<std::string> names_;
};

} // namespace gate_relay
