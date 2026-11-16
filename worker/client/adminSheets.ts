// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { t } from "./i18n";
import { parseLatLng } from "../src/gates/geo";
import { ApiError, describeError, type Api, type GateView, type Invite } from "./api";
import { formatDateTime, h, svg, toast, toLocalInput } from "./dom";
import { GATE_ICON_NAMES, gateIcon, icons } from "./icons";
import type { LocationService } from "./location";
import { encodeQr, qrToSvg } from "./qr";
import { menuButton, openSheet } from "./sheet";

const errText = (e: unknown) =>
  e instanceof ApiError
    ? e.body.message && e.code === "BAD_REQUEST"
      ? t(String(e.body.message))
      : describeError(e.code, e.body)
    : t("Something went wrong");

/** The "⋯" menu on a gate card (admins only). */
export function openGateMenu(
  api: Api,
  loc: LocationService,
  gate: GateView,
  allGates: GateView[],
  onChange: () => void,
): void {
  const title = gate.label || gate.name;
  const sheet = openSheet(
    title,
    gate.lat !== undefined ? t("Location set · {r} m radius", { r: gate.radiusM ?? 500 }) : t("No location yet"),
  );
  sheet.setContent(
    h(
      "div",
      { class: "menu" },
      menuButton(icons.locate, t("Set location here"), () => {
        sheet.close();
        void setLocationHere(api, loc, gate, onChange);
      }),
      menuButton(icons.sliders, t("Edit gate settings"), () => {
        sheet.close();
        openGateSettings(api, loc, gate, onChange);
      }),
      menuButton(icons.share, t("Share with guests"), () => {
        sheet.close();
        openInviteCreate(api, allGates, [gate.name], onChange);
      }),
    ),
  );
}

async function setLocationHere(api: Api, loc: LocationService, gate: GateView, onChange: () => void): Promise<void> {
  toast(t("Getting your location…"), 20_000);
  try {
    const pos = await loc.current();
    if (pos.accuracy > 50) {
      toast(t("Accuracy is ±{a} m. Open settings to review before saving.", { a: Math.round(pos.accuracy) }), 4000);
      openGateSettings(api, loc, { ...gate, lat: pos.lat, lng: pos.lng }, onChange, pos.accuracy);
      return;
    }
    await api.saveGate(gate.name, {
      lat: pos.lat,
      lng: pos.lng,
      radiusM: gate.radiusM ?? 500,
      requireProximity: gate.requireProximity,
      label: gate.label,
      icon: gate.icon,
    });
    toast(t("Location saved (±{a} m)", { a: Math.round(pos.accuracy) }));
    onChange();
  } catch (e) {
    toast(e instanceof ApiError ? errText(e) : t("Couldn't get your location. Try outdoors or allow location."), 4000);
  }
}

/** Per-gate settings: name, icon, location, radius and the proximity requirement. */
export function openGateSettings(
  api: Api,
  loc: LocationService,
  gate: GateView,
  onChange: () => void,
  accuracy?: number,
): void {
  let lat = gate.lat;
  let lng = gate.lng;
  let icon = gate.icon;

  const label = h("input", {
    class: "input",
    type: "text",
    maxlength: "40",
    value: gate.label ?? "",
    placeholder: gate.name,
    autocomplete: "off",
  });
  const coords = h("input", {
    class: "input",
    type: "text",
    inputmode: "decimal",
    placeholder: "-23.5505, -46.6333",
    value: lat !== undefined ? `${lat.toFixed(6)}, ${lng!.toFixed(6)}` : "",
    "aria-describedby": "coords-help",
  });
  const accuracyBox = h("div", { class: "accuracy", hidden: true, role: "status" });
  const mapsLink = h(
    "a",
    { class: "btn sm ghost", target: "_blank", rel: "noopener noreferrer" },
    svg(icons.map),
    t("Open in Maps"),
  );
  const radius = h("input", {
    type: "range",
    min: "100",
    max: "2000",
    step: "50",
    value: String(gate.radiusM ?? 500),
    "aria-label": t("Radius in meters"),
  });
  const radiusValue = h("b", {}, `${gate.radiusM ?? 500} m`);
  const proximity = h("input", {
    type: "checkbox",
    role: "switch",
    checked: gate.requireProximity,
    "aria-label": t("Require proximity"),
  });

  const showAccuracy = (acc: number) => {
    accuracyBox.hidden = false;
    accuracyBox.className = `accuracy ${acc <= 50 ? "good" : "bad"}`;
    accuracyBox.replaceChildren(
      svg(acc <= 50 ? icons.check : icons.alert),
      acc <= 50
        ? t("Good fix: ±{a} m", { a: Math.round(acc) })
        : t("Weak fix: ±{a} m. Wait a moment or try outdoors, then tap again.", { a: Math.round(acc) }),
    );
  };
  const syncMaps = () => {
    const ok = lat !== undefined && lng !== undefined;
    mapsLink.toggleAttribute("hidden", !ok);
    if (ok) mapsLink.setAttribute("href", `https://maps.google.com/?q=${lat},${lng}`);
  };
  if (accuracy !== undefined) showAccuracy(accuracy);
  syncMaps();

  coords.addEventListener("input", () => {
    const parsed = parseLatLng(coords.value);
    coords.setCustomValidity(coords.value && !parsed ? t("Use the format: -23.55, -46.63") : "");
    if (parsed) ({ lat, lng } = parsed);
    if (!coords.value) lat = lng = undefined;
    syncMaps();
  });
  radius.addEventListener("input", () => (radiusValue.textContent = `${radius.value} m`));

  const useHere = h(
    "button",
    { class: "btn primary block", type: "button" },
    svg(icons.locate),
    t("Use my current location"),
  );
  useHere.addEventListener("click", async () => {
    useHere.setAttribute("disabled", "");
    useHere.lastChild!.textContent = t("Locating…");
    try {
      const pos = await loc.current();
      lat = pos.lat;
      lng = pos.lng;
      coords.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      coords.setCustomValidity("");
      showAccuracy(pos.accuracy);
      syncMaps();
    } catch {
      toast(t("Couldn't get your location. Allow location and try outdoors."), 4000);
    } finally {
      useHere.removeAttribute("disabled");
      useHere.lastChild!.textContent = t("Use my current location");
    }
  });

  const iconChips = h(
    "div",
    { class: "chips", role: "group", "aria-label": t("Icon") },
    GATE_ICON_NAMES.map((name) => {
      const chip = h(
        "button",
        { class: "chip", type: "button", "aria-pressed": String((icon ?? "") === name), "aria-label": name },
        svg(icons[name]),
      );
      chip.addEventListener("click", () => {
        icon = icon === name ? undefined : name;
        iconChips
          .querySelectorAll(".chip")
          .forEach((c) => c.setAttribute("aria-pressed", String(c === chip && icon === name)));
      });
      return chip;
    }),
  );

  const save = h("button", { class: "btn primary block", type: "submit" }, t("Save"));
  const form = h(
    "form",
    {},
    h(
      "label",
      { class: "field" },
      h("span", {}, t("Display name")),
      label,
      h("small", {}, t("Device file: {file}", { file: `${gate.name}.sub` })),
    ),
    h("div", { class: "field" }, h("span", {}, t("Icon")), iconChips),
    h("div", { class: "section-title" }, t("Location")),
    useHere,
    h("div", { style: "height:10px" }),
    accuracyBox,
    h(
      "label",
      { class: "field" },
      h("span", {}, t("Or paste coordinates")),
      coords,
      h("small", { id: "coords-help" }, t("Copy them from Google Maps: long-press the gate → tap the coordinates.")),
    ),
    mapsLink,
    h(
      "div",
      { class: "field", style: "margin-top:14px" },
      h("span", {}, t("Nearby radius "), radiusValue),
      radius,
      h("small", {}, t("Inside this distance the gate shows up as “Nearby”.")),
    ),
    h(
      "label",
      { class: "switch" },
      h(
        "span",
        { class: "txt" },
        h("b", {}, t("Require proximity")),
        h("small", {}, t("Only open when the phone is within the radius")),
      ),
      proximity,
    ),
    save,
    gate.lat !== undefined
      ? h(
          "button",
          { class: "btn danger block", type: "button", style: "margin-top:10px", onclick: () => void removeLocation() },
          svg(icons.trash),
          t("Remove location"),
        )
      : null,
  );

  const sheet = openSheet(gate.label || gate.name, t("Gate settings"), form);

  async function removeLocation() {
    try {
      await api.saveGate(gate.name, {
        label: label.value.trim() || undefined,
        icon,
        radiusM: Number(radius.value),
        requireProximity: false,
      });
      toast(t("Location removed"));
      sheet.close();
      onChange();
    } catch (e) {
      toast(errText(e), 4000);
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (coords.value && !parseLatLng(coords.value)) return coords.reportValidity();
    if (proximity.checked && lat === undefined) return toast(t("Set a location before requiring proximity"), 3500);
    save.setAttribute("disabled", "");
    try {
      await api.saveGate(gate.name, {
        label: label.value.trim() || undefined,
        icon,
        lat,
        lng,
        radiusM: Number(radius.value),
        requireProximity: proximity.checked,
      });
      toast(t("Saved"));
      sheet.close();
      onChange();
    } catch (err) {
      toast(errText(err), 4000);
      save.removeAttribute("disabled");
    }
  });
}

const HOUR = 3600_000;

/** "Share with guests": create a time-boxed invite link + QR code. */
export function openInviteCreate(api: Api, gates: GateView[], preselected: string[], onChange: () => void): void {
  const selected = new Set(preselected.length ? preselected : gates.length === 1 ? [gates[0]!.name] : []);
  const now = Date.now();
  const label = h("input", {
    class: "input",
    type: "text",
    maxlength: "60",
    placeholder: t("Birthday party"),
    required: true,
    autocomplete: "off",
  });
  const from = h("input", { class: "input", type: "datetime-local", value: toLocalInput(now) });
  const until = h("input", { class: "input", type: "datetime-local", value: toLocalInput(now + 24 * HOUR) });
  const proximity = h("input", {
    type: "checkbox",
    role: "switch",
    checked: true,
    "aria-label": t("Require proximity"),
  });
  const maxOpens = h("input", {
    class: "input",
    type: "number",
    min: "1",
    max: "1000",
    inputmode: "numeric",
    placeholder: t("Unlimited"),
  });
  const warn = h("div", { class: "banner warn", hidden: true });

  const updateWarn = () => {
    const missing = gates.filter((g) => selected.has(g.name) && g.lat === undefined).map((g) => g.label || g.name);
    const show = proximity.checked && missing.length > 0;
    warn.hidden = !show;
    if (show) {
      warn.replaceChildren(
        svg(icons.alert),
        h(
          "div",
          {},
          h("strong", {}, t("No location for {names}", { names: missing.join(", ") })),
          "Proximity can't be checked there. Set the location first (stand at the gate → ⋯ → Set location here).",
        ),
      );
    }
  };

  const gateChips = h(
    "div",
    { class: "chips", role: "group", "aria-label": t("Gates") },
    gates.map((g) => {
      const chip = h(
        "button",
        { class: "chip", type: "button", "aria-pressed": String(selected.has(g.name)) },
        svg(gateIcon(g.icon, g.name)),
        g.label || g.name,
      );
      chip.addEventListener("click", () => {
        if (selected.has(g.name)) selected.delete(g.name);
        else selected.add(g.name);
        chip.setAttribute("aria-pressed", String(selected.has(g.name)));
        updateWarn();
      });
      return chip;
    }),
  );

  const quick = h(
    "div",
    { class: "chips", style: "margin:-4px 0 14px" },
    (
      [
        [t("4 hours"), 4],
        [t("Tonight"), -1],
        [t("24 hours"), 24],
        [t("3 days"), 72],
      ] as const
    ).map(([text, hours]) => {
      const chip = h("button", { class: "chip", type: "button" }, text);
      chip.addEventListener("click", () => {
        const start = new Date(from.value).getTime() || Date.now();
        let end = start + hours * HOUR;
        if (hours === -1) {
          const d = new Date(start);
          d.setDate(d.getDate() + (d.getHours() >= 12 ? 1 : 0));
          d.setHours(6, 0, 0, 0);
          end = d.getTime();
        }
        until.value = toLocalInput(end);
      });
      return chip;
    }),
  );
  proximity.addEventListener("change", updateWarn);
  updateWarn();

  const create = h("button", { class: "btn primary block", type: "submit" }, svg(icons.ticket), t("Create invite"));
  const form = h(
    "form",
    {},
    h("label", { class: "field" }, h("span", {}, t("Name")), label),
    h("div", { class: "field" }, h("span", {}, t("Gates")), gateChips),
    h("label", { class: "field" }, h("span", {}, t("Starts")), from),
    h("label", { class: "field" }, h("span", {}, t("Ends")), until),
    quick,
    h(
      "label",
      { class: "switch" },
      h(
        "span",
        { class: "txt" },
        h("b", {}, t("Guests must be at the gate")),
        h("small", {}, t("Recommended: a forwarded link won't work from far away")),
      ),
      proximity,
    ),
    h("label", { class: "field" }, h("span", {}, t("Max opens (optional)")), maxOpens),
    warn,
    create,
  );
  const sheet = openSheet(t("Share with guests"), t("Guests open the gate from a link. No account needed."), form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!label.value.trim()) return label.reportValidity();
    if (selected.size === 0) return toast(t("Pick at least one gate"));
    create.setAttribute("disabled", "");
    try {
      const res = await api.createInvite({
        label: label.value.trim(),
        gates: [...selected],
        validFrom: new Date(from.value).getTime(),
        validUntil: new Date(until.value).getTime(),
        requireProximity: proximity.checked,
        maxOpens: maxOpens.value ? Number(maxOpens.value) : undefined,
      });
      sheet.close();
      openInviteResult(res.invite, res.url);
      onChange();
    } catch (err) {
      toast(errText(err), 4000);
      create.removeAttribute("disabled");
    }
  });
}

export function openInviteResult(invite: Invite, url: string): void {
  const qr = h("div", { class: "qr" }, svg(qrToSvg(encodeQr(url), t("QR code for {label}", { label: invite.label }))));
  const copy = h("button", { class: "btn sm", type: "button" }, svg(icons.copy), t("Copy"));
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(t("Link copied"));
    } catch {
      toast(t("Couldn't copy. Long-press the link to copy it."));
    }
  });
  const share = h("button", { class: "btn primary block", type: "button" }, svg(icons.share), t("Share link"));
  share.addEventListener("click", async () => {
    const text = t("{label}: open the gate from your phone. Valid until {date}.", {
      label: invite.label,
      date: formatDateTime(invite.validUntil),
    });
    if (navigator.share) {
      try {
        await navigator.share({ title: invite.label, text, url });
        return;
      } catch {
        /* cancelled */
      }
    } else {
      copy.click();
    }
  });
  openSheet(
    t("Invite ready"),
    t("Valid until {date}. Save it now: for security, this link is only shown once.", {
      date: formatDateTime(invite.validUntil),
    }),
    qr,
    h("div", { class: "linkbox" }, h("code", {}, url), copy),
    share,
  );
}

export function openInviteDetail(api: Api, invite: Invite, onChange: () => void): void {
  const active = invite.status === "active" || invite.status === "scheduled";
  const revoke = h("button", { class: "btn danger block", type: "button" }, svg(icons.ban), t("Revoke invite"));
  const sheet = openSheet(
    invite.label,
    undefined,
    h(
      "dl",
      { class: "kv" },
      h("dt", {}, t("Status")),
      h("dd", {}, statusTag(invite)),
      h("dt", {}, t("Gates")),
      h("dd", {}, invite.gates.join(", ")),
      h("dt", {}, t("Starts")),
      h("dd", {}, formatDateTime(invite.validFrom)),
      h("dt", {}, t("Ends")),
      h("dd", {}, formatDateTime(invite.validUntil)),
      h("dt", {}, t("Opens")),
      h("dd", {}, invite.maxOpens ? `${invite.opens} / ${invite.maxOpens}` : String(invite.opens)),
      h("dt", {}, t("Must be at the gate")),
      h("dd", {}, invite.requireProximity ? t("Yes") : t("No")),
      h("dt", {}, t("Created by")),
      h("dd", {}, invite.createdBy),
    ),
    active ? revoke : null,
  );
  revoke.addEventListener("click", async () => {
    if (!confirm(t("Revoke “{label}”? The link stops working immediately.", { label: invite.label }))) return;
    try {
      await api.revokeInvite(invite.id);
      toast(t("Invite revoked"));
      sheet.close();
      onChange();
    } catch (e) {
      toast(errText(e), 4000);
    }
  });
}

export function statusTag(invite: Invite): HTMLElement {
  const map: Record<Invite["status"], [string, string]> = {
    active: [t("Active"), "ok"],
    scheduled: [t("Scheduled"), "warn"],
    expired: [t("Expired"), ""],
    exhausted: [t("Used up"), ""],
    revoked: [t("Revoked"), "err"],
  };
  const [text, cls] = map[invite.status];
  return h("span", { class: `tag ${cls}` }, text);
}
