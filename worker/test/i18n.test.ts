// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectLang } from "../client/i18n";
import { langFromHeader, renderManifest, renderShell } from "../src/ui/assets";

const clientDir = join(import.meta.dirname, "../client");

describe("language detection", () => {
  it("uses Portuguese when the device prefers it, English otherwise", () => {
    expect(detectLang(["pt-BR", "en-US"])).toBe("pt");
    expect(detectLang(["pt-PT"])).toBe("pt");
    expect(detectLang(["en-GB", "pt-BR"])).toBe("en");
    expect(detectLang(["es-ES", "pt-BR"])).toBe("pt");
    expect(detectLang(["fr-FR"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });

  it("localizes the shell and manifest from Accept-Language", () => {
    expect(langFromHeader("pt-BR,pt;q=0.9,en;q=0.8")).toBe("pt");
    expect(langFromHeader("en-US,en;q=0.9")).toBe("en");
    expect(langFromHeader(null)).toBe("en");
    expect(renderShell("user", "pt")).toContain("<title>Portões</title>");
    expect(JSON.parse(renderManifest("user", "pt")).short_name).toBe("Portões");
  });

  it("has a Portuguese translation for every UI string", () => {
    const i18n = readFileSync(join(clientDir, "i18n.ts"), "utf8");
    const dict = i18n.slice(i18n.indexOf("const PT"), i18n.indexOf("const DICTS"));
    const missing: string[] = [];
    for (const file of readdirSync(clientDir).filter((f) => f.endsWith(".ts") && f !== "i18n.ts")) {
      const src = readFileSync(join(clientDir, file), "utf8");
      for (const m of src.matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)) {
        const key = m[1]!;
        const asIdentifier = /^[A-Za-z]+$/.test(key) && new RegExp(`\\n\\s*${key}:`).test(dict);
        if (!dict.includes(`"${key}":`) && !asIdentifier) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
