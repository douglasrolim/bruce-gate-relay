// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

#include "GateRelayScreen.h"

#include "core/display.h"
#include "globals.h"

namespace gate_relay {

void GateRelayScreen::drawFrame() {
    fingerprint_ = "";
    drawMainBorderWithTitle("Gate Relay");
}

void GateRelayScreen::update(const ScreenState &s) {
    const uint32_t ago = s.events ? (millis() - s.lastAt) / 1000 : 0;
    String fp = s.wifi + "|" + s.ip + "|" + s.server + "|" + String(s.gates) + "|" + String(s.events) + "|" +
                String(ago / 10); // refresh "x s ago" every 10 s
    if (fp == fingerprint_) return;
    fingerprint_ = fp;

    tft.fillRect(7, 32, tftWidth - 14, tftHeight - 40, bruceConfig.bgColor);
    tft.setTextSize(FP);
    tft.setTextColor(bruceConfig.priColor, bruceConfig.bgColor);
    setPadCursor(1, 2);

    padprintln("Wi-Fi:   " + s.wifi);
    padprintln("IP:      " + (s.ip.length() ? s.ip : String("-")));
    padprintln("Server:  " + s.server);
    padprintln("Gates:   " + String(s.gates) + " (" + s.storage + ")");
    padprintln("");

    if (s.events) {
        tft.setTextColor(s.last.ok ? TFT_GREEN : TFT_RED, bruceConfig.bgColor);
        padprintln(String(s.last.ok ? "Sent:   " : "Failed: ") + s.last.gate.c_str());
        if (!s.last.ok) padprintln(String("Error:   ") + s.last.error.c_str());
        tft.setTextColor(bruceConfig.priColor, bruceConfig.bgColor);
        padprintln(String(ago) + " s ago  (" + String(s.events) + " total)");
    } else {
        padprintln("Waiting for commands...");
    }

    tft.setTextColor(TFT_DARKGREY, bruceConfig.bgColor);
    printFootnote("Esc/Back: exit");
}

void GateRelayScreen::message(const String &title, const String &body, bool error) {
    fingerprint_ = "";
    drawMainBorderWithTitle(title);
    tft.setTextSize(FP);
    tft.setTextColor(error ? TFT_RED : bruceConfig.priColor, bruceConfig.bgColor);
    setPadCursor(1, 2);
    int start = 0;
    while (start <= static_cast<int>(body.length())) {
        int nl = body.indexOf('\n', start);
        if (nl < 0) nl = body.length();
        padprintln(body.substring(start, nl));
        start = nl + 1;
    }
}

} // namespace gate_relay
