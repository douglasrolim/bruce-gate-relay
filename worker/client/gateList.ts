// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { t } from "./i18n";
import { haversineM, isNearby } from "../src/gates/geo";
import type { GateView, PositionPayload } from "./api";
import { h, svg } from "./dom";
import { createGateCard, createHero, type OpenFn } from "./gateControl";
import { icons } from "./icons";
import { store } from "./storage";

export interface GateListModel {
  gates: GateView[];
  online: boolean;
  position: PositionPayload | null;
}

export interface GateListActions {
  open: (gate: GateView) => OpenFn;
  more?: (gate: GateView) => void;
  describeError: (err: unknown) => string;
}

interface Placed {
  gate: GateView;
  distanceM?: number;
  nearby: boolean;
}

function place(model: GateListModel): Placed[] {
  return model.gates.map((gate) => {
    if (model.position && gate.lat !== undefined && gate.lng !== undefined) {
      const distanceM = haversineM(model.position, { lat: gate.lat, lng: gate.lng });
      const nearby = isNearby(distanceM, model.position.accuracy, gate.radiusM ?? 500);
      return { gate, distanceM, nearby };
    }
    return { gate, nearby: false };
  });
}

/** A cheap fingerprint of what is on screen, so polling only re-renders when something changed. */
export function renderKey(model: GateListModel): string {
  return JSON.stringify([
    model.online,
    place(model).map((p) => [p.gate.name, p.gate.label, p.gate.icon, p.gate.requireProximity, p.nearby, p.distanceM === undefined ? null : Math.round(p.distanceM / 25)]),
  ]);
}

const COLLAPSE_KEY = "others-collapsed";

/**
 * Layout rules (see "Gate locations and proximity" in the plan):
 * - exactly one gate nearby, or only one gate at all: big hero button on top;
 * - several nearby: a "Nearby" section sorted by distance;
 * - everything else under "Other gates", collapsed when something is nearby.
 */
export function renderGateList(model: GateListModel, actions: GateListActions): HTMLElement {
  const placed = place(model);
  const nearby = placed.filter((p) => p.nearby).sort((a, b) => a.distanceM! - b.distanceM!);
  const others = placed
    .filter((p) => !p.nearby)
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));

  const locked = (p: Placed): string | undefined => {
    if (!model.online) return t("Device offline");
    if (p.gate.requireProximity && !p.nearby) {
      return model.position ? t("Only within {r} m", { r: p.gate.radiusM ?? 500 }) : t("Needs your location");
    }
    return undefined;
  };

  const card = (p: Placed) =>
    createGateCard({
      name: p.gate.name,
      label: p.gate.label,
      icon: p.gate.icon,
      distanceM: p.distanceM,
      locked: locked(p),
      onOpen: actions.open(p.gate),
      onMore: actions.more ? () => actions.more!(p.gate) : undefined,
      describeError: actions.describeError,
    });

  const hero = (p: Placed, eyebrow: string) =>
    createHero({
      eyebrow,
      name: p.gate.name,
      label: p.gate.label,
      icon: p.gate.icon,
      distanceM: p.distanceM,
      locked: locked(p),
      onOpen: actions.open(p.gate),
      onMore: actions.more ? () => actions.more!(p.gate) : undefined,
      describeError: actions.describeError,
    });

  const root = h("div", { class: "gate-list" });

  if (placed.length === 0) {
    root.append(
      h(
        "div",
        { class: "empty" },
        svg(icons.gate),
        h("b", {}, model.online ? t("No gates yet") : t("Waiting for the device")),
        model.online
          ? t("Copy your .sub files to the gates folder on the device, then restart Gate Relay.")
          : t("Gates appear here as soon as the device connects."),
      ),
    );
    return root;
  }

  if (placed.length === 1) {
    root.append(hero(placed[0]!, nearby.length ? t("Nearby") : t("Your gate")));
    return root;
  }

  if (nearby.length === 1) {
    root.append(hero(nearby[0]!, t("Nearby")));
  } else if (nearby.length > 1) {
    root.append(h("div", { class: "section-title" }, t("Nearby")), h("div", { class: "list" }, nearby.map(card)));
  }

  if (others.length) {
    if (nearby.length === 0) {
      root.append(h("div", { class: "list" }, others.map(card)));
    } else {
      const collapsed = store.get(COLLAPSE_KEY) !== "0";
      const list = h("div", { class: "list", id: "other-gates", hidden: collapsed });
      list.append(...others.map(card));
      const toggle = h(
        "button",
        { type: "button", "aria-expanded": String(!collapsed), "aria-controls": "other-gates" },
        collapsed ? t("Show {n}", { n: others.length }) : t("Hide"),
        svg(icons.chevronDown),
      );
      toggle.addEventListener("click", () => {
        const nowHidden = !list.hidden;
        list.hidden = nowHidden;
        store.set(COLLAPSE_KEY, nowHidden ? "1" : "0");
        toggle.setAttribute("aria-expanded", String(!nowHidden));
        toggle.firstChild!.textContent = nowHidden ? t("Show {n}", { n: others.length }) : t("Hide");
      });
      root.append(h("div", { class: "section-title" }, t("Other gates"), toggle), list);
    }
  }
  return root;
}

/** True while the user is in the middle of an interaction we must not destroy. */
export function isInteracting(root: Element): boolean {
  return !!root.querySelector(".is-holding, [data-busy='1'], .is-success, .is-error, .is-armed");
}
