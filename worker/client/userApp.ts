// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { t } from "./i18n";
import { Api, ApiError, describeError, type AuditEntry, type GateView, type Me } from "./api";
import { locationBanner, offlineBanner } from "./banners";
import { fill, formatDateTime, h, svg, timeAgo, toast } from "./dom";
import { isInteracting, renderGateList, renderKey } from "./gateList";
import { gateIcon, icons } from "./icons";
import { LocationService } from "./location";
import { openGateMenu, openGateSettings, openInviteCreate, openInviteDetail, statusTag } from "./adminSheets";
import { menuButton, openSheet } from "./sheet";

type Tab = "gates" | "activity" | "manage";
const POLL_MS = 10_000;

const errorText = (err: unknown) =>
  err instanceof ApiError ? describeError(err.code, err.body) : t("Something went wrong");

/** The signed-in app: Gates, Activity and (admins) Manage tabs. */
export class UserApp {
  private readonly api = new Api();
  private readonly loc = new LocationService();
  private me!: Me;
  private gates: GateView[] = [];
  private online = false;
  private lastSeen: number | null = null;
  private tab: Tab = "gates";
  private lastKey = "";
  private pendingRender = false;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly pill = h("span", { class: "pill", role: "status" }, h("span", { class: "dot" }), "…");
  private readonly main = h("main", { class: "view", id: "main" });
  private readonly nav = h("nav", { class: "nav", "aria-label": t("Sections") }, h("div", { class: "nav-inner" }));

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    try {
      this.me = await this.api.me();
    } catch (err) {
      return this.fatal(err);
    }
    this.tab = this.tabFromPath(location.pathname);
    this.renderFrame();
    this.loc.onChange(() => this.tab === "gates" && this.renderGates());
    void this.loc.init();
    window.addEventListener("popstate", () => this.go(this.tabFromPath(location.pathname), false));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void this.refresh();
    });
    await this.refresh();
  }

  private tabFromPath(path: string): Tab {
    if (path.startsWith("/activity")) return "activity";
    if (path.startsWith("/admin") && this.me?.isAdmin) return "manage";
    return "gates";
  }

  private fatal(err: unknown): void {
    const expired = err instanceof ApiError && (err.code === "SESSION_EXPIRED" || err.status === 401);
    const forbidden = err instanceof ApiError && err.status === 403;
    this.root.replaceChildren(
      h(
        "div",
        { class: "empty", style: "padding-top:20vh" },
        svg(forbidden ? icons.shield : icons.wifiOff),
        h("b", {}, forbidden ? t("This account can't open gates") : expired ? t("Please sign in again") : t("Can't reach the server")),
        forbidden ? t("Ask the owner to add your email.") : expired ? t("Your session expired.") : t("Check your connection and try again."),
        h("div", { style: "margin-top:16px;display:flex;gap:8px;justify-content:center" },
          h("button", { class: "btn primary", type: "button", onclick: () => location.reload() }, expired ? t("Sign in") : t("Try again")),
          forbidden ? h("a", { class: "btn", href: "/cdn-cgi/access/logout" }, t("Use another account")) : null,
        ),
      ),
    );
    this.root.removeAttribute("aria-busy");
  }

  // ---------- Frame ----------

  private renderFrame(): void {
    const initial = (this.me.email ?? "?").trim().charAt(0).toUpperCase();
    const avatar = h("button", { class: "avatar", type: "button", "aria-label": t("Account") }, initial);
    avatar.addEventListener("click", () => this.openAccount());

    this.root.replaceChildren(
      h("header", { class: "header" }, h("h1", { id: "title" }, t("Gates")), this.pill, avatar),
      this.main,
    );
    this.root.removeAttribute("aria-busy");
    document.body.append(this.nav);
    this.renderNav();
    this.renderTab();
  }

  private renderNav(): void {
    const tabs: [Tab, string, string, string][] = [
      ["gates", "/", icons.gate, t("Gates")],
      ["activity", "/activity", icons.clock, t("Activity")],
    ];
    if (this.me.isAdmin) tabs.push(["manage", "/admin", icons.sliders, t("Manage")]);
    this.nav.firstElementChild!.replaceChildren(
      ...tabs.map(([tab, href, icon, label]) => {
        const a = h("a", { href, "aria-current": this.tab === tab ? "page" : undefined }, svg(icon), label);
        a.addEventListener("click", (e) => {
          e.preventDefault();
          this.go(tab);
        });
        return a;
      }),
    );
  }

  private go(tab: Tab, push = true): void {
    if (tab === this.tab && push) return;
    this.tab = tab;
    if (push) history.pushState({}, "", tab === "gates" ? "/" : tab === "activity" ? "/activity" : "/admin");
    this.renderNav();
    this.renderTab();
    window.scrollTo({ top: 0 });
  }

  private renderTab(): void {
    const title = document.getElementById("title")!;
    title.textContent = this.tab === "gates" ? t("Gates") : this.tab === "activity" ? t("Activity") : t("Manage");
    this.main.classList.remove("view");
    void this.main.offsetWidth; // restart the fade-in
    this.main.classList.add("view");
    this.lastKey = "";
    if (this.tab === "gates") this.renderGates();
    else if (this.tab === "activity") void this.renderActivity();
    else void this.renderManage();
  }

  private renderPill(): void {
    this.pill.className = `pill ${this.online ? "online" : "offline"}`;
    this.pill.lastChild!.textContent = this.online ? t("Online") : t("Offline");
  }

  // ---------- Data ----------

  private async refresh(): Promise<void> {
    clearTimeout(this.pollTimer);
    try {
      const res = await this.api.gates();
      this.gates = res.gates;
      this.online = res.online;
      this.lastSeen = res.lastSeen;
      this.renderPill();
      if (this.tab === "gates") this.renderGates();
    } catch (err) {
      if (err instanceof ApiError && (err.code === "SESSION_EXPIRED" || err.status === 403)) return this.fatal(err);
      this.online = false;
      this.renderPill();
    }
    if (!document.hidden) this.pollTimer = setTimeout(() => void this.refresh(), POLL_MS);
  }

  // ---------- Gates ----------

  private renderGates(): void {
    if (this.tab !== "gates") return;
    const model = { gates: this.gates, online: this.online, position: this.loc.position };
    const key = renderKey(model) + this.loc.state;
    if (key === this.lastKey) return;
    if (isInteracting(this.main)) {
      // Never pull the button from under a finger; try again shortly.
      if (!this.pendingRender) {
        this.pendingRender = true;
        setTimeout(() => {
          this.pendingRender = false;
          this.renderGates();
        }, 1500);
      }
      return;
    }
    this.lastKey = key;

    const list = renderGateList(model, {
      open: (gate) => async () => {
        const needsPos = gate.requireProximity;
        await this.api.open(gate.name, needsPos && this.loc.position ? this.loc.position : undefined);
      },
      more: this.me.isAdmin ? (gate) => openGateMenu(this.api, this.loc, gate, this.gates, () => void this.refresh()) : undefined,
      describeError: errorText,
    });

    fill(this.main,
      !this.online ? offlineBanner(this.lastSeen) : null,
      this.gates.some((g) => g.lat !== undefined) ? locationBanner(this.loc.state, this.loc) : null,
      list,
    );
  }

  // ---------- Activity ----------

  private async renderActivity(): Promise<void> {
    this.main.replaceChildren(h("div", { class: "empty" }, t("Loading…")));
    let entries: AuditEntry[];
    try {
      entries = (await this.api.log()).entries;
    } catch (err) {
      this.main.replaceChildren(h("div", { class: "empty" }, svg(icons.alert), h("b", {}, t("Couldn't load activity")), errorText(err)));
      return;
    }
    if (this.tab !== "activity") return;
    if (entries.length === 0) {
      this.main.replaceChildren(h("div", { class: "empty" }, svg(icons.clock), h("b", {}, t("No activity yet")), t("Every open shows up here: who, which gate and when.")));
      return;
    }
    const refresh = h("button", { type: "button" }, t("Refresh"));
    refresh.addEventListener("click", () => void this.renderActivity());
    fill(this.main,
      h("div", { class: "section-title" }, t("Last {n}", { n: entries.length }), refresh),
      h(
        "div",
        { class: "feed" },
        entries.map((e) => {
          const guest = e.provider === "invite";
          const name = guest ? e.who.replace(/^Guest: /, "") : e.who.split("@")[0]!;
          return h(
            "div",
            { class: "feed-item" },
            h("span", { class: `ava${guest ? " guest" : ""}`, "aria-hidden": "true" }, guest ? svg(icons.ticket) : name.charAt(0).toUpperCase()),
            h(
              "div",
              { class: "what" },
              h("b", {}, name),
              guest ? t(" (guest)") : "",
              e.ok ? t(" opened ") : t(" tried "),
              h("b", {}, e.gate),
              h(
                "span",
                { class: "when", title: formatDateTime(e.ts) },
                timeAgo(e.ts),
                e.distanceM !== undefined ? t(" · ≈{d} m away", { d: e.distanceM }) : "",
                !e.ok && e.error ? ` · ${describeError(e.error)}` : "",
                e.ip && e.ip !== "unknown" ? ` · ${e.ip}` : "",
              ),
            ),
            h("span", { class: `res ${e.ok ? "ok" : "err"}`, "aria-label": e.ok ? t("Success") : t("Failed") }, svg(e.ok ? icons.check : icons.x)),
          );
        }),
      ),
    );
  }

  // ---------- Manage (admins) ----------

  private async renderManage(): Promise<void> {
    this.main.replaceChildren(h("div", { class: "empty" }, t("Loading…")));
    let data: Awaited<ReturnType<Api["adminGates"]>>;
    let invites: Awaited<ReturnType<Api["invites"]>>["invites"];
    try {
      [data, { invites }] = await Promise.all([this.api.adminGates(), this.api.invites()]);
    } catch (err) {
      this.main.replaceChildren(h("div", { class: "empty" }, svg(icons.alert), h("b", {}, t("Couldn't load")), errorText(err)));
      return;
    }
    if (this.tab !== "manage") return;
    const reload = () => void this.renderManage();

    const newInvite = h("button", { type: "button" }, svg(icons.plus), t("New"));
    newInvite.addEventListener("click", () => openInviteCreate(this.api, data.gates, [], reload));
    const visibleInvites = invites.filter((i) => i.status === "active" || i.status === "scheduled" || Date.now() - i.validUntil < 7 * 86400_000);

    const exportBtn = h("button", { class: "group-row", type: "button" }, h("span", { class: "tile" }, svg(icons.download)), h("span", { class: "txt" }, h("b", {}, t("Export gate settings")), h("small", {}, t("Download a JSON backup"))), svg(icons.chevron));
    exportBtn.addEventListener("click", () => void this.exportSettings());
    const importInput = h("input", { type: "file", accept: "application/json,.json", hidden: true });
    const importBtn = h("button", { class: "group-row", type: "button" }, h("span", { class: "tile" }, svg(icons.upload)), h("span", { class: "txt" }, h("b", {}, t("Import gate settings")), h("small", {}, t("Restore from a JSON backup"))), svg(icons.chevron));
    importBtn.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", () => void this.importSettings(importInput, reload));

    fill(this.main,
      h("div", { class: "section-title" }, t("Guest invites"), newInvite),
      visibleInvites.length
        ? h(
            "div",
            { class: "group" },
            visibleInvites.map((inv) => {
              const row = h(
                "button",
                { class: "group-row", type: "button" },
                h("span", { class: "tile" }, svg(icons.ticket)),
                h("span", { class: "txt" }, h("b", {}, inv.label), h("small", {}, t("{gates} · until {date} · {n} opens", { gates: inv.gates.join(", "), date: formatDateTime(inv.validUntil), n: inv.opens }))),
                statusTag(inv),
              );
              row.addEventListener("click", () => openInviteDetail(this.api, inv, reload));
              return row;
            }),
          )
        : h(
            "div",
            { class: "banner info" },
            svg(icons.ticket),
            h("div", {}, h("strong", {}, t("Having guests over?")), t("Create a link that opens the gate for a few hours. No accounts needed, and you can revoke it anytime.")),
          ),
      h("div", { class: "section-title" }, t("Gates")),
      data.gates.length
        ? h(
            "div",
            { class: "group" },
            data.gates.map((g) => {
              const row = h(
                "button",
                { class: "group-row", type: "button" },
                h("span", { class: "tile" }, svg(gateIcon(g.icon, g.name))),
                h(
                  "span",
                  { class: "txt" },
                  h("b", {}, g.label || g.name),
                  h("small", {}, g.lat !== undefined ? t("Location set · {r} m", { r: g.radiusM ?? 500 }) + (g.requireProximity ? t(" · proximity required") : "") : t("No location")),
                ),
                svg(icons.chevron),
              );
              row.addEventListener("click", () => openGateSettings(this.api, this.loc, g, () => { reload(); void this.refresh(); }));
              return row;
            }),
          )
        : h("div", { class: "banner" }, svg(icons.wifiOff), h("div", {}, h("strong", {}, t("No gates from the device")), t("Gate settings appear once the device is online."))),
      data.orphans.length
        ? [
            h("div", { class: "section-title" }, t("Orphaned settings")),
            h("div", { class: "banner warn" }, svg(icons.alert), h("div", {}, h("strong", {}, t("These gates are gone from the device")), t("Probably a renamed .sub file. Move the settings to the new name or delete them."))),
            h(
              "div",
              { class: "group" },
              data.orphans.map((o) => {
                const row = h("button", { class: "group-row", type: "button" }, h("span", { class: "tile" }, svg(icons.alert)), h("span", { class: "txt" }, h("b", {}, o.gate), h("small", {}, o.lat !== undefined ? t("Has a location") : t("No location"))), svg(icons.chevron));
                row.addEventListener("click", () => this.openOrphan(o.gate, data.gates, reload));
                return row;
              }),
            ),
          ]
        : null,
      h("div", { class: "section-title" }, t("Backup")),
      h("div", { class: "group" }, exportBtn, importBtn),
      importInput,
    );
  }

  private openOrphan(name: string, gates: GateView[], reload: () => void): void {
    const sheet = openSheet(name, t("Not announced by the device anymore."));
    sheet.setContent(
      h(
        "div",
        { class: "menu" },
        gates.map((g) =>
          menuButton(icons.chevron, t("Move settings to “{name}”", { name: g.label || g.name }), async () => {
            try {
              const exported = (await this.api.exportGates()).gates.find((x) => x.gate === name);
              if (exported) await this.api.saveGate(g.name, { ...exported, gate: g.name });
              await this.api.deleteGate(name);
              toast(t("Settings moved"));
              sheet.close();
              reload();
              void this.refresh();
            } catch (e) {
              toast(errorText(e), 4000);
            }
          }),
        ),
        menuButton(icons.trash, t("Delete settings"), async () => {
          try {
            await this.api.deleteGate(name);
            toast(t("Deleted"));
            sheet.close();
            reload();
          } catch (e) {
            toast(errorText(e), 4000);
          }
        }, true),
      ),
    );
  }

  private async exportSettings(): Promise<void> {
    try {
      const data = await this.api.exportGates();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: `gate-settings-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a);
      a.click();
      a.remove();
    } catch (e) {
      toast(errorText(e), 4000);
    }
  }

  private async importSettings(input: HTMLInputElement, reload: () => void): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { gates?: unknown };
      if (!Array.isArray(parsed.gates)) throw new Error("bad file");
      const res = await this.api.importGates(parsed.gates as never);
      toast(t("Imported {n} gate(s)", { n: res.imported }));
      reload();
      void this.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? errorText(e) : t("That file is not a gate settings backup"), 4000);
    }
  }

  // ---------- Account ----------

  private openAccount(): void {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = matchMedia("(display-mode: standalone)").matches;
    openSheet(
      t("Account"),
      undefined,
      h(
        "dl",
        { class: "kv" },
        h("dt", {}, t("Signed in as")),
        h("dd", {}, this.me.email ?? "—"),
        h("dt", {}, t("Role")),
        h("dd", {}, this.me.isAdmin ? t("Admin") : t("Member")),
      ),
      standalone
        ? null
        : h(
            "div",
            { class: "banner info" },
            svg(icons.phone),
            h("div", {}, h("strong", {}, t("Add to Home Screen")), ios ? t("In Safari, tap Share, then “Add to Home Screen”.") : t("In Chrome, open the ⋮ menu, then “Add to Home screen” or “Install app”.")),
          ),
      h("a", { class: "btn danger block", href: "/cdn-cgi/access/logout" }, svg(icons.logout), t("Sign out")),
    );
  }
}
