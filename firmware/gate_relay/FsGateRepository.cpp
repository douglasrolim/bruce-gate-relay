// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#include "FsGateRepository.h"

#include "GateNames.h"
#include <algorithm>

namespace gate_relay {

std::vector<std::string> FsGateRepository::refresh() {
    names_.clear();
    File dir = fs_.open(folder_.c_str());
    if (!dir || !dir.isDirectory()) return names_;
    while (names_.size() < kMaxGates) {
        File entry = dir.openNextFile();
        if (!entry) break;
        if (!entry.isDirectory()) {
            const std::string name = gateNameFromFile(entry.name());
            if (!name.empty()) names_.push_back(name);
        }
        entry.close();
    }
    dir.close();
    std::sort(names_.begin(), names_.end());
    names_.erase(std::unique(names_.begin(), names_.end()), names_.end());
    return names_;
}

bool FsGateRepository::resolve(const std::string &name, std::string &pathOut) const {
    if (!isValidGateName(name)) return false;
    if (std::find(names_.begin(), names_.end(), name) == names_.end()) return false;
    pathOut = folder_ + "/" + name + ".sub";
    return fs_.exists(pathOut.c_str());
}

} // namespace gate_relay
