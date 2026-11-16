// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

// Pure helpers (no Arduino dependency) so they can be unit-tested on the host.
#pragma once
#include <string>

namespace gate_relay {

constexpr size_t kMaxGateNameLength = 48;
constexpr size_t kMaxGates = 32;

/// Same rules as the Worker: a gate name is a .sub file name without extension,
/// never a path. Rejects "/", "\\", "..", control chars, leading dots and padding.
bool isValidGateName(const std::string &name);

/// "Garage.sub" -> "Garage". Returns an empty string if the file is not a valid gate.
std::string gateNameFromFile(const std::string &fileName);

} // namespace gate_relay
