// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { describe, expect, it } from "vitest";
import { isValidGateName, parseDeviceMessage, MAX_GATES } from "../src/protocol/messages";

const ID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";

describe("isValidGateName", () => {
  it("accepts friendly names", () => {
    for (const n of ["Garage", "Main Entrance", "Portão 2", "gate_1-a"]) expect(isValidGateName(n)).toBe(true);
  });
  it("rejects paths, traversal and junk", () => {
    for (const n of ["", "../etc", "a/b", "a\\b", "..", ".hidden", " padded", "x".repeat(49), "nul\u0000", "c:", 42, null]) {
      expect(isValidGateName(n)).toBe(false);
    }
  });
});

describe("parseDeviceMessage", () => {
  it("parses hello and de-duplicates gates", () => {
    const r = parseDeviceMessage(JSON.stringify({ v: 1, type: "hello", fw: "x/1", gates: ["A", "B", "A"] }));
    expect(r).toEqual({ ok: true, value: { v: 1, type: "hello", fw: "x/1", gates: ["A", "B"] } });
  });
  it("parses results and normalizes unknown error codes", () => {
    expect(parseDeviceMessage(JSON.stringify({ v: 1, type: "result", id: ID, ok: true }))).toEqual({
      ok: true,
      value: { v: 1, type: "result", id: ID, ok: true },
    });
    const r = parseDeviceMessage(JSON.stringify({ v: 1, type: "result", id: ID, ok: false, error: "WHATEVER" }));
    expect(r.ok && r.value.type === "result" && r.value.error).toBe("INTERNAL");
  });
  it("parses pong", () => {
    expect(parseDeviceMessage('{"v":1,"type":"pong"}').ok).toBe(true);
  });
  it("rejects malformed messages", () => {
    const bad = [
      "not json",
      "[]",
      '{"v":2,"type":"pong"}',
      '{"v":1,"type":"nope"}',
      JSON.stringify({ v: 1, type: "hello", fw: "x", gates: ["../x"] }),
      JSON.stringify({ v: 1, type: "hello", fw: "x", gates: "Garage" }),
      JSON.stringify({ v: 1, type: "hello", fw: "x", gates: Array.from({ length: MAX_GATES + 1 }, (_, i) => `g${i}`) }),
      JSON.stringify({ v: 1, type: "result", id: "not-a-uuid", ok: true }),
      JSON.stringify({ v: 1, type: "result", id: ID, ok: "yes" }),
      JSON.stringify({ v: 1, type: "pong", pad: "x".repeat(5000) }),
    ];
    for (const raw of bad) expect(parseDeviceMessage(raw).ok).toBe(false);
  });
});
