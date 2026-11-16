// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { GuestApp } from "./guestApp";
import { lang, t } from "./i18n";
import { UserApp } from "./userApp";

function boot(): void {
  const root = document.getElementById("app");
  if (!root) return;
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  document.title = t("Gates");
  const mode = document.body.dataset.mode;
  void (mode === "guest" ? new GuestApp(root) : new UserApp(root)).start();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* PWA is a nice-to-have */
    });
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
