// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { t } from "./i18n";
import { Api, ApiError, describeError, type GuestGatesResponse } from "./api";
import { locationBanner, offlineBanner } from "./banners";
import { fill, formatDateTime, h, svg } from "./dom";
import { isInteracting, renderGateList, renderKey } from "./gateList";
import { icons } from "./icons";
import { LocationService } from "./location";
import { store } from "./storage";

const TOKEN_KEY = "guest-token";
const POLL_MS = 10_000;

/**
 * Guest mode: reached from an invite link `/i/<token>`. The token is moved out of the
 * URL into storage right away (history.replaceState), then sent as a Bearer header.
 */
export class GuestApp {
  private api!: Api;
  private readonly loc = new LocationService();
  private data: GuestGatesResponse | null = null;
  private lastKey = "";
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly main = h("main", { class: "view" });

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    const m = /^\/i\/([A-Za-z0-9_-]{16,128})$/.exec(location.pathname);
    if (m) {
      store.set(TOKEN_KEY, m[1]!);
      history.replaceState({}, "", "/guest");
    }
    const token = store.get(TOKEN_KEY);
    if (!token) return this.message(icons.link, t("Invite link needed"), t("Open the link the host sent you."));
    this.api = new Api(token);

    this.root.replaceChildren(this.main);
    this.root.removeAttribute("aria-busy");
    this.loc.onChange(() => this.render());
    document.addEventListener("visibilitychange", () => !document.hidden && void this.refresh());
    await this.refresh();
    if (this.data?.gates.some((g) => g.requireProximity)) void this.loc.init();
  }

  private message(icon: string, title: string, text: string): void {
    this.root.removeAttribute("aria-busy");
    this.root.replaceChildren(h("div", { class: "empty", style: "padding-top:22vh" }, svg(icon), h("b", {}, title), text));
  }

  private async refresh(): Promise<void> {
    clearTimeout(this.pollTimer);
    try {
      this.data = await this.api.guestGates();
      this.render();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        store.remove(TOKEN_KEY);
        return this.message(
          icons.ticket,
          err.code === "INVITE_EXPIRED" ? t("This invite has ended") : t("This invite isn't valid"),
          t("Ask the host for a new link."),
        );
      }
      if (!this.data) return this.message(icons.wifiOff, t("No connection"), t("Check your mobile data and reload."));
    }
    if (!document.hidden) this.pollTimer = setTimeout(() => void this.refresh(), POLL_MS);
  }

  private render(): void {
    const d = this.data;
    if (!d) return;
    const model = { gates: d.gates, online: d.online, position: this.loc.position };
    const key = renderKey(model) + this.loc.state;
    if (key === this.lastKey || isInteracting(this.main)) return;
    this.lastKey = key;
    const needsLocation = d.gates.some((g) => g.requireProximity);

    fill(this.main,
      h(
        "div",
        { class: "welcome" },
        h("div", { class: "logo", "aria-hidden": "true" }, svg(icons.gate)),
        h("h1", {}, d.label),
        h("p", {}, t("You're invited. This link works until {date}.", { date: formatDateTime(d.validUntil) }), d.opensLeft !== null ? t(" {n} opens left.", { n: d.opensLeft }) : ""),
      ),
      !d.online ? offlineBanner(d.lastSeen) : null,
      needsLocation ? locationBanner(this.loc.state, this.loc, true) : null,
      renderGateList(model, {
        open: (gate) => async () => {
          await this.api.guestOpen(gate.name, gate.requireProximity && this.loc.position ? this.loc.position : undefined);
          void this.refresh();
        },
        describeError: (err) => (err instanceof ApiError ? describeError(err.code, err.body) : t("Something went wrong")),
      }),
      h(
        "p",
        { class: "footer-note" },
        needsLocation ? t("Your location is only used to check that you're at the gate and is never stored. ") : "",
        t("Tip: add this page to your Home Screen for quick access."),
      ),
    );
  }
}
