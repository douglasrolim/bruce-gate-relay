// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { describe, expect, it } from "vitest";
import { CompositeAuthorizer, EmailAuthorizer, InviteAuthorizer, parseGatePermissions } from "../src/auth/Authorizer";
import { StoredAuditLog } from "../src/audit/AuditLog";
import { DeviceSession } from "../src/device/DeviceSession";
import { findOrphans } from "../src/gates/GateMetadataRepository";
import { checkProximity, haversineM, isNearby, isValidLatLng, parseLatLng, roundDistance } from "../src/gates/geo";
import { StoredInviteRepository, inviteStatus } from "../src/invites/InviteRepository";
import { deviceTokenFrom, isAuthorizedDevice } from "../src/security/deviceAuth";
import { GUEST_POLICY, StoredRateLimiter, USER_POLICY } from "../src/security/RateLimiter";
import { MemoryStore } from "../src/storage/KeyValueStore";
import { timingSafeEqual } from "../src/util/base64url";
import { Clock, FakeSocket, connectDevice } from "./helpers";

const person = (email: string) => ({ subject: email, email, provider: "cloudflare-access" });

describe("geo", () => {
  it("computes haversine distances", () => {
    // One degree of latitude is ~111.2 km.
    expect(Math.abs(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111_195)).toBeLessThan(50);
    expect(haversineM({ lat: -23.55, lng: -46.63 }, { lat: -23.55, lng: -46.63 })).toBe(0);
  });
  it("applies the nearby rule with accuracy", () => {
    expect(isNearby(550, 60, 500)).toBe(true);
    expect(isNearby(600, 60, 500)).toBe(false);
  });
  it("checks proximity server-side with a capped accuracy credit", () => {
    const gate = { lat: 0, lng: 0, radiusM: 500 };
    const north = (m: number) => ({ lat: m / 111_195, lng: 0 });
    expect(checkProximity(gate, undefined)).toEqual({ ok: false, error: "LOCATION_REQUIRED" });
    expect(checkProximity(gate, { ...north(400), accuracy: 10 }).ok).toBe(true);
    expect(checkProximity(gate, { ...north(580), accuracy: 100 }).ok).toBe(true);
    // A huge accuracy radius must not unlock a far gate (credit capped at 100 m).
    const far = checkProximity(gate, { ...north(2000), accuracy: 5000 });
    expect(far.ok).toBe(false);
    expect(!far.ok && far.error).toBe("TOO_FAR");
  });
  it("parses and validates coordinates", () => {
    expect(parseLatLng("-23.55, -46.63")).toEqual({ lat: -23.55, lng: -46.63 });
    expect(parseLatLng("-23.55 -46.63")).toEqual({ lat: -23.55, lng: -46.63 });
    expect(parseLatLng("91, 0")).toBe(null);
    expect(parseLatLng("abc")).toBe(null);
    expect(isValidLatLng(0, 181)).toBe(false);
    expect(isValidLatLng(Number.NaN, 0)).toBe(false);
  });
  it("rounds distances for the audit log", () => {
    expect(roundDistance(143)).toBe(150);
    expect(roundDistance(1234)).toBe(1200);
  });
});

describe("EmailAuthorizer", () => {
  const authz = new EmailAuthorizer(
    { allowedEmails: ["alice@x.com", "bob@x.com"], adminEmails: ["root@x.com"] },
    { "bob@x.com": ["Garage"], "*": ["Main"] },
  );
  it("enforces the allowlist and admins", async () => {
    expect(await authz.canUseApp(person("alice@x.com"))).toBe(true);
    expect(await authz.canUseApp(person("ALICE@x.com"))).toBe(true);
    expect(await authz.canUseApp(person("eve@x.com"))).toBe(false);
    expect(await authz.canUseApp(person("root@x.com"))).toBe(true);
    expect(await authz.isAdmin(person("root@x.com"))).toBe(true);
    expect(await authz.isAdmin(person("alice@x.com"))).toBe(false);
  });
  it("filters gates per user, with a wildcard default", async () => {
    const gates = ["Garage", "Main", "Back"];
    expect(await authz.allowedGates(person("bob@x.com"), gates)).toEqual(["Garage"]);
    expect(await authz.allowedGates(person("alice@x.com"), gates)).toEqual(["Main"]);
    expect(await authz.allowedGates(person("root@x.com"), gates)).toEqual(gates);
    expect(await authz.allowedGates(person("eve@x.com"), gates)).toEqual([]);
  });
  it("fails closed on invalid GATE_PERMISSIONS", async () => {
    expect(parseGatePermissions("{bad json")).toBe(null);
    expect(parseGatePermissions('{"a@x.com":"Garage"}')).toBe(null);
    const broken = new EmailAuthorizer({ allowedEmails: ["alice@x.com"], adminEmails: [] }, null);
    expect(await broken.allowedGates(person("alice@x.com"), ["Garage"])).toEqual([]);
  });
  it("never treats guests as people", async () => {
    expect(await authz.canUseApp({ subject: "id", email: "alice@x.com", provider: "invite" })).toBe(false);
  });
});

describe("Invites", () => {
  it("stores only the token hash and resolves tokens", async () => {
    const clock = new Clock();
    const store = new MemoryStore();
    const repo = new StoredInviteRepository(store, clock.now);
    const { invite, token } = await repo.create({
      label: "Party",
      gates: ["Garage"],
      validFrom: clock.t,
      validUntil: clock.t + 3600_000,
      requireProximity: true,
      createdBy: "root@x.com",
    });
    expect(JSON.stringify([...store.data.values()]).includes(token)).toBe(false);
    expect((await repo.findByToken(token))?.id).toBe(invite.id);
    expect(await repo.findByToken("A".repeat(32))).toBeUndefined();
  });
  it("computes status", () => {
    const base = {
      id: "1",
      tokenHash: "",
      label: "",
      gates: [],
      validFrom: 100,
      validUntil: 200,
      requireProximity: true,
      opens: 0,
      createdBy: "",
      createdAt: 0,
      revoked: false,
    };
    expect(inviteStatus(base, 50)).toBe("scheduled");
    expect(inviteStatus(base, 150)).toBe("active");
    expect(inviteStatus(base, 200)).toBe("expired");
    expect(inviteStatus({ ...base, maxOpens: 2, opens: 2 }, 150)).toBe("exhausted");
    expect(inviteStatus({ ...base, revoked: true }, 150)).toBe("revoked");
  });
  it("authorizes guests only for their invite's gates", async () => {
    const clock = new Clock();
    const repo = new StoredInviteRepository(new MemoryStore(), clock.now);
    const { invite } = await repo.create({
      label: "P",
      gates: ["Garage"],
      validFrom: clock.t,
      validUntil: clock.t + 1000,
      requireProximity: false,
      createdBy: "x",
    });
    const authz = new CompositeAuthorizer(
      new EmailAuthorizer({ allowedEmails: [], adminEmails: [] }),
      new InviteAuthorizer(repo),
    );
    const guest = { subject: invite.id, provider: "invite", label: "P" };
    expect(await authz.allowedGates(guest, ["Garage", "Main"])).toEqual(["Garage"]);
    expect(await authz.isAdmin(guest)).toBe(false);
  });
});

describe("RateLimiter", () => {
  it("enforces a per-gate cooldown", async () => {
    const clock = new Clock();
    const rl = new StoredRateLimiter(new MemoryStore(), clock.now);
    expect((await rl.consume("a", "Garage", USER_POLICY)).ok).toBe(true);
    const r = await rl.consume("b", "Garage", USER_POLICY);
    expect(!r.ok && r.error).toBe("COOLDOWN");
    expect((await rl.consume("b", "Main", USER_POLICY)).ok).toBe(true);
    clock.advance(3000);
    expect((await rl.consume("b", "Garage", USER_POLICY)).ok).toBe(true);
  });
  it("allows 20 opens per user per hour", async () => {
    const clock = new Clock();
    const rl = new StoredRateLimiter(new MemoryStore(), clock.now);
    for (let i = 0; i < 20; i++) {
      expect((await rl.consume("a", `G${i}`, USER_POLICY)).ok).toBe(true);
      clock.advance(10);
    }
    const r = await rl.consume("a", "Other", USER_POLICY);
    expect(!r.ok && r.error).toBe("RATE_LIMITED");
    clock.advance(60 * 60 * 1000);
    expect((await rl.consume("a", "Other", USER_POLICY)).ok).toBe(true);
  });
  it("applies the guest per-subject cooldown", async () => {
    const clock = new Clock();
    const rl = new StoredRateLimiter(new MemoryStore(), clock.now);
    expect((await rl.consume("inv", "A", GUEST_POLICY)).ok).toBe(true);
    expect((await rl.consume("inv", "B", GUEST_POLICY)).ok).toBe(false);
    clock.advance(5000);
    expect((await rl.consume("inv", "B", GUEST_POLICY)).ok).toBe(true);
  });
});

describe("AuditLog", () => {
  it("keeps only the most recent entries", async () => {
    const log = new StoredAuditLog(new MemoryStore(), 3);
    for (let i = 0; i < 5; i++) await log.append({ ts: i, who: "a", provider: "p", ip: "", gate: `G${i}`, ok: true });
    expect((await log.recent()).map((e) => e.gate)).toEqual(["G4", "G3", "G2"]);
  });
});

describe("DeviceSession", () => {
  const make = (clock = new Clock()) => {
    const sockets: FakeSocket[] = [];
    const session = new DeviceSession(() => sockets.filter((s) => !s.closed), clock.now, 50);
    return { sockets, session, clock };
  };

  it("is offline until the device says hello", async () => {
    const { session, sockets } = make();
    expect(session.status().online).toBe(false);
    expect(await session.open("Garage")).toEqual({ ok: false, error: "DEVICE_OFFLINE" });
    connectDevice(session, sockets);
    expect(session.status()).toEqual({
      online: true,
      gates: ["Garage", "Main Entrance"],
      fw: "bruce-gate-relay/1.0.0",
      lastSeen: expect.any(Number),
    });
  });

  it("relays open commands and results", async () => {
    const { session, sockets } = make();
    const sock = connectDevice(session, sockets);
    expect(await session.open("Garage")).toEqual({ ok: true });
    expect(sock.sent[0]).toEqual({ v: 1, type: "open", id: expect.any(String), gate: "Garage" });
    sock.autoReply = () => ({ ok: false, error: "TX_FAILED" });
    expect(await session.open("Garage")).toEqual({ ok: false, error: "TX_FAILED" });
  });

  it("times out, rejects unknown gates and fails pending opens on disconnect", async () => {
    const { session, sockets } = make();
    const sock = connectDevice(session, sockets);
    expect(await session.open("Nope")).toEqual({ ok: false, error: "GATE_NOT_FOUND" });
    sock.autoReply = null;
    expect(await session.open("Garage")).toEqual({ ok: false, error: "TIMEOUT" });
    const pending = session.open("Garage");
    session.handleClose();
    expect(await pending).toEqual({ ok: false, error: "DEVICE_OFFLINE" });
  });

  it("goes offline when the device is silent and replaces old connections", () => {
    const { session, sockets, clock } = make();
    const first = connectDevice(session, sockets);
    const second = connectDevice(session, sockets);
    expect(first.closed?.code).toBe(4000);
    expect(second.closed).toBe(null);
    clock.advance(200_000);
    expect(session.status().online).toBe(false);
    session.handleMessage(second, '{"v":1,"type":"pong"}');
    expect(session.status().online).toBe(true);
  });

  it("ignores results for unknown ids and reports malformed frames", () => {
    const { session, sockets } = make();
    const sock = connectDevice(session, sockets);
    expect(
      session.handleMessage(sock, '{"v":1,"type":"result","id":"3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b","ok":true}').ok,
    ).toBe(true);
    expect(session.handleMessage(sock, "garbage").ok).toBe(false);
  });
});

describe("device authentication", () => {
  const TOKEN = "x".repeat(43);
  it("reads the bearer header or the query fallback", () => {
    expect(deviceTokenFrom(new Request("https://h/device", { headers: { Authorization: `Bearer ${TOKEN}` } }))).toBe(
      TOKEN,
    );
    expect(deviceTokenFrom(new Request(`https://h/device?token=${TOKEN}`))).toBe(TOKEN);
  });
  it("compares in constant time and fails closed on weak config", () => {
    const req = new Request("https://h/device", { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(isAuthorizedDevice(req, TOKEN)).toBe(true);
    expect(isAuthorizedDevice(req, TOKEN + "y")).toBe(false);
    expect(isAuthorizedDevice(req, undefined)).toBe(false);
    expect(
      isAuthorizedDevice(new Request("https://h/device", { headers: { Authorization: "Bearer short" } }), "short"),
    ).toBe(false);
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });
});

describe("findOrphans", () => {
  it("lists metadata for gates the device no longer announces", () => {
    const meta = (gate: string) => ({ gate, radiusM: 500, requireProximity: false, updatedBy: "", updatedAt: 0 });
    expect(findOrphans([meta("Garage"), meta("Old")], ["Garage"]).map((m) => m.gate)).toEqual(["Old"]);
  });
});
