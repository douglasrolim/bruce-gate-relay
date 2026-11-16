// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { describe, expect, it } from "vitest";
import { CloudflareAccessAuthenticator } from "../src/auth/CloudflareAccessAuthenticator";
import { createUserAuthenticator } from "../src/auth/createAuthenticator";
import { DevAuthenticator } from "../src/auth/DevAuthenticator";
import type { Env } from "../src/env";
import { AUD, Clock, TEAM, accessClaims, createSigner } from "./helpers";

const req = (headers: Record<string, string> = {}, url = "https://gate.example.com/api/me") => new Request(url, { headers });

describe("CloudflareAccessAuthenticator", () => {
  it("accepts a valid Access JWT and lowercases the email", async () => {
    const clock = new Clock();
    const signer = await createSigner();
    const auth = new CloudflareAccessAuthenticator(TEAM, AUD, signer.jwks, clock.now);
    const jwt = await signer.sign(accessClaims("Alice@Example.com", clock.t));
    const r = await auth.authenticate(req({ "Cf-Access-Jwt-Assertion": jwt }));
    expect(r).toEqual({ ok: true, identity: { subject: "alice@example.com", email: "alice@example.com", provider: "cloudflare-access" } });
  });

  it("reads the CF_Authorization cookie as a fallback", async () => {
    const clock = new Clock();
    const signer = await createSigner();
    const auth = new CloudflareAccessAuthenticator(TEAM, AUD, signer.jwks, clock.now);
    const jwt = await signer.sign(accessClaims("alice@example.com", clock.t));
    expect((await auth.authenticate(req({ Cookie: `a=b; CF_Authorization=${jwt}` }))).ok).toBe(true);
  });

  it("rejects missing, tampered, expired and foreign tokens", async () => {
    const clock = new Clock();
    const signer = await createSigner();
    const other = await createSigner();
    const auth = new CloudflareAccessAuthenticator(TEAM, AUD, signer.jwks, clock.now);
    const check = async (jwt: string | undefined) => auth.authenticate(req(jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {}));

    expect(await check(undefined)).toEqual({ ok: false, reason: "MISSING_CREDENTIALS" });
    expect(await check("garbage")).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });

    const good = await signer.sign(accessClaims("alice@example.com", clock.t));
    const [h, p, s] = good.split(".");
    const forgedPayload = Buffer.from(JSON.stringify(accessClaims("mallory@example.com", clock.t))).toString("base64url");
    expect((await check(`${h}.${forgedPayload}.${s}`)).ok).toBe(false);
    expect((await check(`${h}.${p}.${s!.slice(0, -4)}AAAA`)).ok).toBe(false);

    expect((await check(await other.sign(accessClaims("alice@example.com", clock.t))))).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
    expect((await check(await signer.sign(accessClaims("alice@example.com", clock.t, { aud: ["other-aud"] }))))).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
    expect((await check(await signer.sign(accessClaims("alice@example.com", clock.t, { iss: "https://evil.cloudflareaccess.com" }))))).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });

    const expired = await signer.sign(accessClaims("alice@example.com", clock.t, { exp: Math.floor(clock.t / 1000) - 120 }));
    expect(await check(expired)).toEqual({ ok: false, reason: "EXPIRED" });

    // Service-token JWTs (device) have no email and must not open the app.
    const service = await signer.sign(accessClaims("", clock.t, { email: undefined, common_name: "client-id.access" }));
    expect((await check(service)).ok).toBe(false);
  });

  it("rejects alg=none", async () => {
    const clock = new Clock();
    const signer = await createSigner();
    const auth = new CloudflareAccessAuthenticator(TEAM, AUD, signer.jwks, clock.now);
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const jwt = `${enc({ alg: "none", kid: "key-1" })}.${enc(accessClaims("alice@example.com", clock.t))}.`;
    expect((await auth.authenticate(req({ "Cf-Access-Jwt-Assertion": jwt }))).ok).toBe(false);
  });

  it("fails closed when not configured", async () => {
    const signer = await createSigner();
    const auth = new CloudflareAccessAuthenticator("", "", signer.jwks);
    expect(await auth.authenticate(req())).toEqual({ ok: false, reason: "MISCONFIGURED" });
  });
});

describe("DevAuthenticator", () => {
  it("only works in development and on localhost", async () => {
    const dev = new DevAuthenticator("development", "dev@example.com");
    expect((await dev.authenticate(req({}, "http://localhost:8787/api/me"))).ok).toBe(true);
    expect((await dev.authenticate(req({}, "https://gate.example.com/api/me"))).ok).toBe(false);
    const prod = new DevAuthenticator("production", "dev@example.com");
    expect((await prod.authenticate(req({}, "http://localhost:8787/api/me"))).ok).toBe(false);
  });

  it("cannot be activated in production through configuration", async () => {
    const signer = await createSigner();
    for (const ENVIRONMENT of [undefined, "production", "prod", "Development"]) {
      const auth = createUserAuthenticator({ ENVIRONMENT, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD } as Env, signer.jwks);
      expect(auth.name).toBe("cloudflare-access");
      expect((await auth.authenticate(req({}, "http://localhost:8787/api/me"))).ok).toBe(false);
    }
    const devAuth = createUserAuthenticator({ ENVIRONMENT: "development", ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD } as Env, signer.jwks);
    expect((await devAuth.authenticate(req({}, "http://localhost:8787/api/me"))).ok).toBe(true);
  });

  it("rejects unknown auth modes", () => {
    expect(() => createUserAuthenticator({ AUTH_MODES: "magic" } as Env)).toThrow();
  });
});
