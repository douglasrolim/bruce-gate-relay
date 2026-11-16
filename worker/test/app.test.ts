// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { describe, expect, it } from "vitest";
import { apiRequest, connectDevice, createHarness, type Harness } from "./helpers";

async function body(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

async function online(h: Harness, gates?: string[]) {
  return connectDevice(h.session, h.sockets, gates);
}

const GATE_LAT = -23.0;
const GATE_LNG = -46.0;
const metersNorth = (m: number) => GATE_LAT + m / 111_195;

describe("user API", () => {
  it("returns the signed-in identity", async () => {
    const h = await createHarness();
    const res = await h.handle(apiRequest("/api/me", { jwt: await h.token("alice@example.com") }));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ email: "alice@example.com", provider: "cloudflare-access", isAdmin: false });
  });

  it("rejects missing, invalid and expired Access JWTs", async () => {
    const h = await createHarness();
    expect((await h.handle(apiRequest("/api/me"))).status).toBe(401);
    expect((await h.handle(apiRequest("/api/me", { jwt: "a.b.c" }))).status).toBe(401);
    const expired = await h.token("alice@example.com", { exp: Math.floor(h.clock.t / 1000) - 600 });
    expect((await h.handle(apiRequest("/api/me", { jwt: expired }))).status).toBe(401);
  });

  it("rejects emails that are not on the allowlist", async () => {
    const h = await createHarness();
    const res = await h.handle(apiRequest("/api/me", { jwt: await h.token("eve@example.com") }));
    expect(res.status).toBe(403);
  });

  it("opens a gate end-to-end and records it in the audit log", async () => {
    const h = await createHarness();
    const sock = await online(h);
    const jwt = await h.token("alice@example.com");

    const status = await body(await h.handle(apiRequest("/api/status", { jwt })));
    expect(status.online).toBe(true);
    expect(status.gates).toEqual(["Garage", "Main Entrance"]);

    const res = await h.handle(apiRequest("/api/open", { jwt, body: { gate: "Garage" } }));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true });
    expect(sock.sent.at(-1)).toEqual({ v: 1, type: "open", id: expect.any(String), gate: "Garage" });

    const log = await body(await h.handle(apiRequest("/api/log", { jwt })));
    const entries = log.entries as Record<string, unknown>[];
    expect(entries[0]).toEqual({
      ts: h.clock.t,
      who: "alice@example.com",
      provider: "cloudflare-access",
      gate: "Garage",
      ok: true,
    });
    // IPs are only shown to admins.
    const adminLog = await body(await h.handle(apiRequest("/api/log", { jwt: await h.token("admin@example.com") })));
    expect((adminLog.entries as Record<string, unknown>[])[0]!.ip).toBe("203.0.113.7");
  });

  it("reports device errors with useful status codes", async () => {
    const h = await createHarness();
    const jwt = await h.token("alice@example.com");
    const open = (gate: string) => h.handle(apiRequest("/api/open", { jwt, body: { gate } }));

    let res = await open("Garage");
    expect([res.status, (await body(res)).error]).toEqual([503, "DEVICE_OFFLINE"]);

    const sock = await online(h);
    res = await open("Unknown");
    expect(res.status).toBe(403); // not in the device list: not allowed

    sock.autoReply = null;
    res = await open("Garage");
    expect([res.status, (await body(res)).error]).toEqual([504, "TIMEOUT"]);

    h.clock.advance(5000);
    sock.autoReply = () => ({ ok: false, error: "TX_FAILED" });
    res = await open("Garage");
    expect([res.status, (await body(res)).error]).toEqual([502, "TX_FAILED"]);
  });

  it("rate-limits opens", async () => {
    const h = await createHarness();
    await online(h);
    const jwt = await h.token("alice@example.com");
    const open = () => h.handle(apiRequest("/api/open", { jwt, body: { gate: "Garage" } }));
    expect((await open()).status).toBe(200);
    const res = await open();
    expect(res.status).toBe(429);
    expect((await body(res)).error).toBe("COOLDOWN");
  });

  it("rejects invalid gate names and malformed bodies", async () => {
    const h = await createHarness();
    await online(h);
    const jwt = await h.token("alice@example.com");
    expect((await h.handle(apiRequest("/api/open", { jwt, body: { gate: "../etc/passwd" } }))).status).toBe(400);
    const raw = new Request("https://gate.example.com/api/open", {
      method: "POST",
      headers: {
        "Cf-Access-Jwt-Assertion": jwt,
        Origin: "https://gate.example.com",
        "Content-Type": "application/json",
      },
      body: "{not json",
    });
    expect((await h.handle(raw)).status).toBe(400);
  });

  it("blocks cross-site requests (CSRF)", async () => {
    const h = await createHarness();
    await online(h);
    const jwt = await h.token("alice@example.com");
    const evil = await h.handle(
      apiRequest("/api/open", { jwt, body: { gate: "Garage" }, origin: "https://evil.example" }),
    );
    expect(evil.status).toBe(403);
    const noOrigin = await h.handle(apiRequest("/api/open", { jwt, body: { gate: "Garage" }, origin: null }));
    expect(noOrigin.status).toBe(403);
    const form = await h.handle(apiRequest("/api/open", { jwt, body: { gate: "Garage" }, contentType: "text/plain" }));
    expect(form.status).toBe(415);
  });

  it("restricts users to their permitted gates", async () => {
    const h = await createHarness({ GATE_PERMISSIONS: JSON.stringify({ "bob@example.com": ["Garage"] }) });
    await online(h);
    const jwt = await h.token("bob@example.com");
    const st = await body(await h.handle(apiRequest("/api/status", { jwt })));
    expect(st.gates).toEqual(["Garage"]);
    const res = await h.handle(apiRequest("/api/open", { jwt, body: { gate: "Main Entrance" } }));
    expect([res.status, (await body(res)).error]).toEqual([403, "GATE_NOT_ALLOWED"]);
  });

  it("returns 404/405 for unknown routes and methods", async () => {
    const h = await createHarness();
    expect((await h.handle(apiRequest("/api/nope"))).status).toBe(404);
    expect((await h.handle(apiRequest("/api/open"))).status).toBe(405);
  });
});

describe("proximity", () => {
  async function setup() {
    const h = await createHarness();
    await online(h);
    const admin = await h.token("admin@example.com");
    const put = await h.handle(
      apiRequest("/api/admin/gates/Garage", {
        method: "PUT",
        jwt: admin,
        body: { lat: GATE_LAT, lng: GATE_LNG, radiusM: 500, requireProximity: true },
      }),
    );
    expect(put.status).toBe(200);
    return { h, jwt: await h.token("alice@example.com") };
  }

  it("requires a location when the gate asks for it", async () => {
    const { h, jwt } = await setup();
    const res = await h.handle(apiRequest("/api/open", { jwt, body: { gate: "Garage" } }));
    expect([res.status, (await body(res)).error]).toEqual([403, "LOCATION_REQUIRED"]);
  });

  it("rejects far-away opens and accepts nearby ones", async () => {
    const { h, jwt } = await setup();
    const far = await h.handle(
      apiRequest("/api/open", {
        jwt,
        body: { gate: "Garage", position: { lat: metersNorth(3000), lng: GATE_LNG, accuracy: 20 } },
      }),
    );
    expect([far.status, (await body(far)).error]).toEqual([403, "TOO_FAR"]);
    const near = await h.handle(
      apiRequest("/api/open", {
        jwt,
        body: { gate: "Garage", position: { lat: metersNorth(120), lng: GATE_LNG, accuracy: 15 } },
      }),
    );
    expect(near.status).toBe(200);
    expect((await body(near)).distanceM).toBe(100);
  });

  it("never stores raw coordinates in the audit log", async () => {
    const { h, jwt } = await setup();
    await h.handle(
      apiRequest("/api/open", {
        jwt,
        body: { gate: "Garage", position: { lat: metersNorth(143), lng: GATE_LNG, accuracy: 15 } },
      }),
    );
    const stored = JSON.stringify([...h.store.data.entries()]);
    expect(stored.includes(String(metersNorth(143)))).toBe(false);
    const log = await body(await h.handle(apiRequest("/api/log", { jwt })));
    expect((log.entries as Record<string, unknown>[])[0]!.distanceM).toBe(150);
  });

  it("exposes gate locations in /api/gates", async () => {
    const { h, jwt } = await setup();
    const res = await body(await h.handle(apiRequest("/api/gates", { jwt })));
    expect((res.gates as Record<string, unknown>[])[0]).toEqual({
      name: "Garage",
      lat: GATE_LAT,
      lng: GATE_LNG,
      radiusM: 500,
      requireProximity: true,
    });
  });
});

describe("admin API", () => {
  it("is forbidden for non-admins", async () => {
    const h = await createHarness();
    const jwt = await h.token("alice@example.com");
    expect((await h.handle(apiRequest("/api/admin/gates", { jwt }))).status).toBe(403);
    expect(
      (await h.handle(apiRequest("/api/admin/invites", { jwt, body: { label: "x", gates: ["Garage"] } }))).status,
    ).toBe(403);
    expect(
      (await h.handle(apiRequest("/api/admin/gates/Garage", { method: "PUT", jwt, body: { radiusM: 500 } }))).status,
    ).toBe(403);
  });

  it("validates gate metadata", async () => {
    const h = await createHarness();
    const jwt = await h.token("admin@example.com");
    const put = (b: unknown) => h.handle(apiRequest("/api/admin/gates/Garage", { method: "PUT", jwt, body: b }));
    expect((await put({ lat: 91, lng: 0 })).status).toBe(400);
    expect((await put({ lat: 0, lng: 181 })).status).toBe(400);
    expect((await put({ lat: 0, lng: 0, radiusM: 50 })).status).toBe(400);
    expect((await put({ lat: 0, lng: 0, radiusM: 5000 })).status).toBe(400);
    expect((await put({ requireProximity: true })).status).toBe(400);
    expect((await put({ icon: "rocket" })).status).toBe(400);
    expect((await put({ lat: 0, lng: 0, radiusM: 750, label: "Front", icon: "car" })).status).toBe(200);
    expect((await h.handle(apiRequest("/api/admin/gates/..%2Fx", { method: "PUT", jwt, body: {} }))).status).toBe(400);
  });

  it("lists orphaned metadata and deletes it", async () => {
    const h = await createHarness();
    await online(h, ["Garage"]);
    const jwt = await h.token("admin@example.com");
    await h.handle(apiRequest("/api/admin/gates/Old%20Gate", { method: "PUT", jwt, body: { lat: 1, lng: 1 } }));
    const res = await body(await h.handle(apiRequest("/api/admin/gates", { jwt })));
    expect((res.orphans as { gate: string }[]).map((o) => o.gate)).toEqual(["Old Gate"]);
    const del = await h.handle(
      apiRequest("/api/admin/gates/Old%20Gate", { method: "DELETE", jwt, origin: "https://gate.example.com" }),
    );
    expect(del.status).toBe(200);
  });

  it("exports and imports gate settings", async () => {
    const h = await createHarness();
    const jwt = await h.token("admin@example.com");
    await h.handle(
      apiRequest("/api/admin/gates/Garage", { method: "PUT", jwt, body: { lat: 1, lng: 2, radiusM: 300 } }),
    );
    const exported = await body(await h.handle(apiRequest("/api/admin/export", { jwt })));
    const h2 = await createHarness();
    const jwt2 = await h2.token("admin@example.com");
    const imp = await h2.handle(apiRequest("/api/admin/import", { jwt: jwt2, body: { gates: exported.gates } }));
    expect(await body(imp)).toEqual({ ok: true, imported: 1 });
  });
});

describe("guest invites", () => {
  async function createInvite(h: Harness, extra: Record<string, unknown> = {}) {
    const jwt = await h.token("admin@example.com");
    const res = await h.handle(
      apiRequest("/api/admin/invites", {
        jwt,
        body: { label: "Birthday party", gates: ["Garage"], requireProximity: false, ...extra },
      }),
    );
    expect(res.status).toBe(201);
    const data = await body(res);
    const token = String(data.url).split("/i/")[1]!;
    return { token, id: (data.invite as { id: string }).id, jwt };
  }

  it("lets a guest open the invited gate without Access", async () => {
    const h = await createHarness();
    await online(h);
    const { token } = await createInvite(h);
    const gates = await body(await h.handle(apiRequest("/api/guest/gates", { bearer: token })));
    expect(gates.label).toBe("Birthday party");
    expect((gates.gates as { name: string }[]).map((g) => g.name)).toEqual(["Garage"]);

    const res = await h.handle(apiRequest("/api/guest/open", { bearer: token, body: { gate: "Garage" } }));
    expect(res.status).toBe(200);
    const notInvited = await h.handle(
      apiRequest("/api/guest/open", { bearer: token, body: { gate: "Main Entrance" } }),
    );
    expect(notInvited.status).toBe(403);

    const log = await body(await h.handle(apiRequest("/api/log", { jwt: await h.token("alice@example.com") })));
    expect((log.entries as { who: string }[])[0]!.who).toBe("Guest: Birthday party");
  });

  it("rejects missing, invalid, expired, revoked and exhausted tokens", async () => {
    const h = await createHarness();
    await online(h);
    const gates = (bearer?: string) => h.handle(apiRequest("/api/guest/gates", { bearer }));

    expect((await gates()).status).toBe(401);
    expect((await gates("A".repeat(32))).status).toBe(401);

    const expiring = await createInvite(h, { validUntil: h.clock.t + 60_000 });
    h.clock.advance(61_000);
    const expired = await gates(expiring.token);
    expect([expired.status, (await body(expired)).error]).toEqual([401, "INVITE_EXPIRED"]);

    const revokable = await createInvite(h);
    const rv = await h.handle(
      apiRequest(`/api/admin/invites/${revokable.id}/revoke`, { jwt: revokable.jwt, body: {} }),
    );
    expect(rv.status).toBe(200);
    expect((await gates(revokable.token)).status).toBe(401);

    const once = await createInvite(h, { maxOpens: 1 });
    expect(
      (await h.handle(apiRequest("/api/guest/open", { bearer: once.token, body: { gate: "Garage" } }))).status,
    ).toBe(200);
    const exhausted = await gates(once.token);
    expect([exhausted.status, (await body(exhausted)).error]).toEqual([401, "INVITE_EXPIRED"]);
  });

  it("guest tokens never work on member routes and Access JWTs never work on guest routes", async () => {
    const h = await createHarness();
    await online(h);
    const { token, jwt } = await createInvite(h);
    expect((await h.handle(apiRequest("/api/status", { bearer: token }))).status).toBe(401);
    expect((await h.handle(apiRequest("/api/guest/gates", { jwt }))).status).toBe(401);
  });

  it("enforces proximity for invites that require it", async () => {
    const h = await createHarness();
    await online(h);
    const admin = await h.token("admin@example.com");
    await h.handle(
      apiRequest("/api/admin/gates/Garage", {
        method: "PUT",
        jwt: admin,
        body: { lat: GATE_LAT, lng: GATE_LNG, radiusM: 300 },
      }),
    );
    const { token } = await createInvite(h, { requireProximity: true });
    const view = await body(await h.handle(apiRequest("/api/guest/gates", { bearer: token })));
    expect((view.gates as { requireProximity: boolean }[])[0]!.requireProximity).toBe(true);
    const far = await h.handle(
      apiRequest("/api/guest/open", {
        bearer: token,
        body: { gate: "Garage", position: { lat: metersNorth(5000), lng: GATE_LNG, accuracy: 10 } },
      }),
    );
    expect((await body(far)).error).toBe("TOO_FAR");
    const near = await h.handle(
      apiRequest("/api/guest/open", {
        bearer: token,
        body: { gate: "Garage", position: { lat: metersNorth(50), lng: GATE_LNG, accuracy: 10 } },
      }),
    );
    expect(near.status).toBe(200);
  });

  it("validates invite input", async () => {
    const h = await createHarness();
    await online(h);
    const jwt = await h.token("admin@example.com");
    const create = (b: unknown) => h.handle(apiRequest("/api/admin/invites", { jwt, body: b }));
    expect((await create({ gates: ["Garage"] })).status).toBe(400);
    expect((await create({ label: "x", gates: [] })).status).toBe(400);
    expect((await create({ label: "x", gates: ["Nope"] })).status).toBe(400);
    expect((await create({ label: "x", gates: ["Garage"], validUntil: h.clock.t - 1 })).status).toBe(400);
    expect((await create({ label: "x", gates: ["Garage"], validUntil: h.clock.t + 40 * 86400_000 })).status).toBe(400);
    expect((await create({ label: "x", gates: ["Garage"], maxOpens: 0 })).status).toBe(400);
    const list = await body(await h.handle(apiRequest("/api/admin/invites", { jwt })));
    expect(list.invites).toEqual([]);
  });

  it("never exposes token hashes", async () => {
    const h = await createHarness();
    await online(h);
    const { jwt } = await createInvite(h);
    const list = JSON.stringify(await body(await h.handle(apiRequest("/api/admin/invites", { jwt }))));
    expect(list.includes("tokenHash")).toBe(false);
  });
});
