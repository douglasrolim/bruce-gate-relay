// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { t } from "./i18n";
import { h, svg, timeAgo } from "./dom";
import { icons } from "./icons";
import type { LocationService, LocationState } from "./location";
import { store } from "./storage";

export function offlineBanner(lastSeen: number | null): HTMLElement {
  return h(
    "div",
    { class: "banner err", role: "alert" },
    svg(icons.wifiOff),
    h(
      "div",
      {},
      h("strong", {}, t("Device offline")),
      lastSeen ? t("Last seen {t}. ", { t: timeAgo(lastSeen) }) : "",
      t("Gates can't be opened until it reconnects."),
    ),
  );
}

/** Explains why we want location before the browser prompt ever appears. */
export function locationBanner(state: LocationState, loc: LocationService, required = false): HTMLElement | null {
  if (state === "explain" || (required && state === "idle")) {
    return h(
      "div",
      { class: "banner info" },
      svg(icons.locate),
      h(
        "div",
        {},
        h("strong", {}, required ? t("Location needed") : t("Show the gates near you")),
        required
          ? t("The host asked to check that you're at the gate. Your location is only used for that and never stored.")
          : t("Allow location to put the closest gate first. Your location is never stored."),
        h(
          "div",
          { class: "actions" },
          h("button", { class: "btn primary sm", type: "button", onclick: () => loc.request() }, t("Allow location")),
          required ? null : h("button", { class: "btn ghost sm", type: "button", onclick: () => loc.dismissExplainer() }, t("Not now")),
        ),
      ),
    );
  }
  if (state === "denied" && (required || store.get("loc-denied-hint") !== "1")) {
    const close = h("button", { class: "close", type: "button", "aria-label": t("Dismiss") }, svg(icons.x));
    const el = h(
      "div",
      { class: "banner warn" },
      svg(icons.locate),
      h(
        "div",
        {},
        h("strong", {}, t("Location is off")),
        required
          ? t("Turn on location for this site in your browser settings to open the gates.")
          : t("Showing all gates. You can allow location later in your browser settings."),
      ),
      required ? null : close,
    );
    close.addEventListener("click", () => {
      store.set("loc-denied-hint", "1");
      el.remove();
    });
    return el;
  }
  return null;
}
