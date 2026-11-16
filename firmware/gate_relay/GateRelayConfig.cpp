// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#include "GateRelayConfig.h"

#include "GateNames.h"
#include <ArduinoJson.h>

namespace gate_relay {

static std::string str(JsonVariantConst v) {
    const char *s = v.as<const char *>();
    return s ? std::string(s) : std::string();
}

bool GateRelayConfig::load(fs::FS &fs, std::string &error) {
    File f = fs.open(kConfigPath, FILE_READ);
    if (!f) {
        error = std::string(kConfigPath) + " not found";
        return false;
    }
    if (f.size() > 4096) {
        f.close();
        error = "config file too large";
        return false;
    }
    JsonDocument doc;
    const DeserializationError err = deserializeJson(doc, f);
    f.close();
    if (err) {
        error = std::string("invalid JSON: ") + err.c_str();
        return false;
    }

    url = str(doc["url"]);
    token = str(doc["token"]);
    accessClientId = str(doc["accessClientId"]);
    accessClientSecret = str(doc["accessClientSecret"]);
    caFile = str(doc["caFile"]);
    allowInsecure = doc["allowInsecure"] | false;
    const std::string dir = str(doc["folder"]);
    if (!dir.empty()) folder = dir;
    while (folder.size() > 1 && folder.back() == '/') folder.pop_back();

    if (!parseWsUrl(url, endpoint, allowInsecure)) {
        error = "url must look like wss://gate.example.com/device";
        return false;
    }
    if (token.size() < 32) {
        error = "token must have 32+ characters";
        return false;
    }
    if (accessClientId.empty() != accessClientSecret.empty()) {
        error = "set both accessClientId and accessClientSecret";
        return false;
    }
    if (folder.empty() || folder[0] != '/' || folder.find("..") != std::string::npos) {
        error = "folder must be an absolute path";
        return false;
    }
    return true;
}

} // namespace gate_relay
