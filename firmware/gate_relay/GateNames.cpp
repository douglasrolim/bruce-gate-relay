// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#include "GateNames.h"

namespace gate_relay {

bool isValidGateName(const std::string &name) {
    if (name.empty() || name.size() > kMaxGateNameLength) return false;
    if (name.front() == ' ' || name.back() == ' ' || name.front() == '.') return false;
    if (name.find("..") != std::string::npos) return false;
    for (unsigned char c : name) {
        if (c < 0x20 || c == 0x7f) return false;
        switch (c) {
            case '/': case '\\': case ':': case '*': case '?': case '"': case '<': case '>': case '|':
                return false;
            default: break;
        }
    }
    return true;
}

std::string gateNameFromFile(const std::string &fileName) {
    // Accept a full path but only keep the last segment.
    std::string base = fileName;
    const size_t slash = base.find_last_of('/');
    if (slash != std::string::npos) base = base.substr(slash + 1);
    if (base.size() <= 4) return "";
    std::string ext = base.substr(base.size() - 4);
    for (char &c : ext) c = static_cast<char>(c >= 'A' && c <= 'Z' ? c + 32 : c);
    if (ext != ".sub") return "";
    std::string name = base.substr(0, base.size() - 4);
    return isValidGateName(name) ? name : "";
}

} // namespace gate_relay
