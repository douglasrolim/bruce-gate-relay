// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { t } from "./i18n";
import { formatDistance, h, svg, vibrate } from "./dom";
import { gateIcon, icons } from "./icons";

export const HOLD_MS = 800;
const ARM_MS = 3000;
const MOVE_TOLERANCE_PX = 14;

export type OpenFn = () => Promise<void>;
export type GateVisualState = "idle" | "holding" | "sending" | "success" | "error";

export interface GateControlOptions {
  name: string;
  label?: string;
  icon?: string;
  distanceM?: number;
  locked?: string; // reason the gate can't be opened right now
  onOpen: OpenFn;
  onMore?: () => void;
  describeError: (err: unknown) => string;
}

/**
 * Press-and-hold interaction shared by the gate card and the hero button.
 * Pointer: hold for HOLD_MS (release early cancels; moving cancels so scrolling is safe).
 * Keyboard: Enter/Space arms the control, a second press within 3 s opens it.
 */
function bindHold(target: HTMLElement, trigger: () => void, onArm: (armed: boolean) => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  let armedUntil = 0;
  let armTimer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    start = null;
    target.classList.remove("is-holding");
  };

  target.addEventListener("pointerdown", (e) => {
    if (target.hasAttribute("disabled") || target.dataset.busy === "1") return;
    if (e.button !== 0) return;
    if ((e.target as Element).closest(".more")) return;
    start = { x: e.clientX, y: e.clientY };
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    target.classList.add("is-holding");
    vibrate(8);
    timer = setTimeout(() => {
      cancel();
      trigger();
    }, HOLD_MS);
  });
  target.addEventListener("pointermove", (e) => {
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
  });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) target.addEventListener(ev, cancel);
  target.addEventListener("contextmenu", (e) => e.preventDefault());

  target.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (target.hasAttribute("disabled") || target.dataset.busy === "1" || e.repeat) return;
    const now = Date.now();
    if (now < armedUntil) {
      armedUntil = 0;
      clearTimeout(armTimer);
      onArm(false);
      trigger();
    } else {
      armedUntil = now + ARM_MS;
      onArm(true);
      clearTimeout(armTimer);
      armTimer = setTimeout(() => {
        armedUntil = 0;
        onArm(false);
      }, ARM_MS);
    }
  });
  target.addEventListener("blur", () => {
    armedUntil = 0;
    onArm(false);
  });
  // A click never opens a gate by itself (accidental taps), but tells the user what to do.
  target.addEventListener("click", (e) => {
    if ((e.target as Element).closest(".more")) return;
    if (e.detail > 0 && !target.classList.contains("is-holding")) target.dispatchEvent(new CustomEvent("hold-hint"));
  });
}

function runOpen(
  root: HTMLElement,
  setState: (s: GateVisualState, msg?: string) => void,
  opts: GateControlOptions,
): () => Promise<void> {
  return async () => {
    if (root.dataset.busy === "1") return;
    root.dataset.busy = "1";
    setState("sending", t("Sending…"));
    try {
      await opts.onOpen();
      vibrate([30, 60, 30]);
      setState("success", t("Signal sent"));
      setTimeout(() => setState("idle"), 3000);
    } catch (err) {
      vibrate([120, 60, 120]);
      setState("error", opts.describeError(err));
      setTimeout(() => setState("idle"), 4500);
    } finally {
      delete root.dataset.busy;
    }
  };
}

function idleHint(opts: GateControlOptions): Node[] {
  const parts: Node[] = [];
  if (opts.locked) return [document.createTextNode(opts.locked)];
  if (opts.distanceM !== undefined) {
    parts.push(h("span", { class: "dist" }, formatDistance(opts.distanceM)), document.createTextNode(" · "));
  }
  parts.push(document.createTextNode(t("Hold to open")));
  return parts;
}

/** A list card: icon tile, name, hint and a progress ring. */
export function createGateCard(opts: GateControlOptions): HTMLElement {
  const title = opts.label || opts.name;
  const hint = h("span", { class: "hint" }, idleHint(opts));
  const ringGlyph = h("span", { class: "glyph" }, svg(icons.hand));
  const ring = h(
    "span",
    { class: "ring", "aria-hidden": "true" },
    svg(
      '<svg class="track" viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18"/></svg>',
    ),
    ringGlyph,
  );
  const tile = h("span", { class: "tile", "aria-hidden": "true" }, svg(gateIcon(opts.icon, opts.name)));

  const card = h(
    "div",
    {
      class: `gate${opts.onMore ? " has-more" : ""}${opts.locked ? " is-disabled" : ""}`,
      role: "button",
      tabindex: "0",
      "aria-label": t("{title}. Press and hold to open. Keyboard: press Enter twice.", { title }),
      "aria-disabled": opts.locked ? "true" : undefined,
      disabled: !!opts.locked,
    },
    tile,
    h("span", {}, h("span", { class: "name" }, title), hint),
    ring,
  );

  if (opts.onMore) {
    const more = h(
      "button",
      { class: "more", type: "button", "aria-label": t("Options for {title}", { title }) },
      svg(icons.more),
    );
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onMore!();
    });
    card.appendChild(more);
  }

  const setState = (s: GateVisualState, msg?: string) => {
    card.classList.remove("is-sending", "is-success", "is-error");
    if (s !== "idle") card.classList.add(`is-${s}`);
    hint.replaceChildren(...(msg ? [document.createTextNode(msg)] : idleHint(opts)));
    ringGlyph.replaceChildren(svg(s === "success" ? icons.check : s === "error" ? icons.x : icons.hand));
  };

  const open = runOpen(card, setState, opts);
  bindHold(
    card,
    () => void open(),
    (armed) => {
      card.classList.toggle("is-armed", armed);
      if (!card.dataset.busy)
        hint.replaceChildren(...(armed ? [document.createTextNode(t("Press Enter again to open"))] : idleHint(opts)));
    },
  );
  card.addEventListener("hold-hint", () => {
    if (card.dataset.busy || opts.locked) return;
    hint.replaceChildren(document.createTextNode(t("Keep holding to open")));
    setTimeout(() => !card.dataset.busy && hint.replaceChildren(...idleHint(opts)), 1600);
  });
  return card;
}

/** The big round button shown when exactly one gate is nearby (or there is only one gate). */
export function createHero(opts: GateControlOptions & { eyebrow: string }): HTMLElement {
  const title = opts.label || opts.name;
  const statusLine = h("div", { class: "status-line", "aria-live": "polite" });
  const labelText = h("span", {}, t("Hold to open"));
  const labelGlyph = h("span", { class: "glyph" }, svg(gateIcon(opts.icon, opts.name)));
  const big = h(
    "button",
    {
      class: "big",
      type: "button",
      "aria-label": t("{title}. Press and hold to open. Keyboard: press Enter twice.", { title }),
      disabled: !!opts.locked,
    },
    svg('<svg class="track" viewBox="0 0 204 204"><circle class="fg" cx="102" cy="102" r="99"/></svg>'),
    h("span", { class: "label" }, labelGlyph, labelText),
  );

  const meta: Node[] = [];
  if (opts.distanceM !== undefined)
    meta.push(document.createTextNode(t("{d} away", { d: formatDistance(opts.distanceM) })));
  if (opts.locked) meta.push(document.createTextNode(opts.locked));

  const hero = h(
    "section",
    { class: "hero", "aria-label": title },
    h("div", { class: "eyebrow" }, svg(icons.pin), opts.eyebrow),
    h("h2", { class: "title" }, title),
    meta.length ? h("div", { class: "meta" }, meta) : null,
    big,
    statusLine,
  );
  if (opts.onMore) {
    const more = h(
      "button",
      { class: "icon-btn more", type: "button", "aria-label": t("Options for {title}", { title }) },
      svg(icons.more),
    );
    more.addEventListener("click", () => opts.onMore!());
    hero.appendChild(more);
  }

  const setState = (s: GateVisualState, msg?: string) => {
    big.classList.remove("is-sending", "is-success", "is-error");
    if (s !== "idle") big.classList.add(`is-${s}`);
    statusLine.className = `status-line${s === "success" ? " ok" : s === "error" ? " err" : ""}`;
    // The button already says "Sending…" or "Signal sent"; the line below only explains errors.
    statusLine.textContent = s === "error" ? (msg ?? "") : "";
    labelGlyph.replaceChildren(
      svg(s === "success" ? icons.check : s === "error" ? icons.x : gateIcon(opts.icon, opts.name)),
    );
    labelText.textContent =
      s === "sending"
        ? t("Sending…")
        : s === "success"
          ? t("Signal sent")
          : s === "error"
            ? t("Try again")
            : t("Hold to open");
  };

  const open = runOpen(big, setState, opts);
  bindHold(
    big,
    () => void open(),
    (armed) => {
      if (!big.dataset.busy) statusLine.textContent = armed ? t("Press Enter again to open") : "";
    },
  );
  big.addEventListener("hold-hint", () => {
    if (big.dataset.busy) return;
    statusLine.className = "status-line";
    statusLine.textContent = t("Keep holding to open");
    setTimeout(() => !big.dataset.busy && (statusLine.textContent = ""), 1600);
  });
  return hero;
}
