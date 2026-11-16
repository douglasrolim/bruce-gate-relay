// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { t } from "./i18n";
import { h, svg, type Child } from "./dom";
import { icons } from "./icons";

export interface Sheet {
  dialog: HTMLDialogElement;
  body: HTMLElement;
  close: () => void;
  setContent: (...children: Child[]) => void;
}

/**
 * Bottom sheet on phones, centered dialog on desktop. Built on <dialog> for focus
 * trapping, Esc to close and screen-reader semantics for free.
 */
export function openSheet(title: string, subtitle?: string, ...children: Child[]): Sheet {
  const body = h("div", {}, children);
  const closeBtn = h("button", { class: "icon-btn", type: "button", "aria-label": t("Close") }, svg(icons.x));
  const dialog = h(
    "dialog",
    { class: "sheet", "aria-label": title },
    h(
      "div",
      { class: "sheet-inner" },
      h("div", { class: "sheet-grip", "aria-hidden": "true" }),
      h("div", { class: "sheet-head" }, h("h2", {}, title), closeBtn),
      subtitle ? h("p", { class: "sheet-sub" }, subtitle) : null,
      body,
    ),
  );
  const close = () => dialog.close();
  closeBtn.addEventListener("click", close);
  dialog.addEventListener("close", () => dialog.remove());
  // Click on the backdrop closes the sheet.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  return {
    dialog,
    body,
    close,
    setContent: (...c: Child[]) => {
      body.replaceChildren();
      for (const x of c.flat(5)) if (x !== null && x !== undefined && x !== false) body.append(x as Node | string);
    },
  };
}

export function menuButton(icon: string, label: string, onClick: () => void, danger = false): HTMLButtonElement {
  return h("button", { type: "button", class: danger ? "danger" : undefined, onclick: onClick }, svg(icon), label);
}
