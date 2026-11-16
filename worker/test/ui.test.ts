// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { describe, expect, it } from "vitest";
import { serveStatic } from "../src/ui/assets";

const get = (path: string) => serveStatic(new Request(`https://gate.example.com${path}`));

describe("static app shell", () => {
  it("serves the member and guest shells with a strict CSP", async () => {
    const home = get("/")!;
    expect(home.status).toBe(200);
    expect(home.headers.get("Content-Security-Policy")).toContain("script-src 'self'");
    expect(home.headers.get("Cache-Control")).toBe("no-store");
    expect(await home.text()).toContain('data-mode="user"');

    const guest = get("/i/abcdefghijklmnopqrstuvwxyz012345")!;
    expect(await guest.text()).toContain('data-mode="guest"');
    expect(await get("/guest")!.text()).toContain("/guest.webmanifest");
  });

  it("serves PWA assets", async () => {
    const manifest = JSON.parse(await get("/manifest.webmanifest")!.text()) as { display: string; icons: { purpose: string }[] };
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    const sw = await get("/sw.js")!.text();
    expect(sw).toContain('url.pathname.startsWith("/api/")');
    expect(get("/assets/icon-192.png")!.headers.get("Content-Type")).toBe("image/png");
    expect(get("/assets/app.js")!.headers.get("Content-Type")).toContain("javascript");
  });

  it("does not serve unknown paths or invalid invite links", () => {
    expect(get("/nope")).toBe(null);
    expect(get("/i/short")).toBe(null);
    expect(get("/assets/../secret.png")).toBe(null);
  });
});
