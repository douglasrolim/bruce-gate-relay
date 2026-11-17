// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { h } from "./dom";
import { t } from "./i18n";

/** Public source code repository (AGPL-3.0: users of the service can get the source). */
export const REPO_URL = "https://github.com/douglasrolim/bruce-gate-relay";

/** "bruce-gate-relay · Open source on GitHub" link, used at the bottom of every screen. */
export function sourceLink(): HTMLAnchorElement {
  return h("a", { href: REPO_URL, target: "_blank", rel: "noopener noreferrer" }, t("Open source on GitHub"));
}

/** Small centered footer with the project name and the source link. */
export function projectFooter(): HTMLElement {
  return h("p", { class: "footer-note" }, "bruce-gate-relay · ", sourceLink());
}
