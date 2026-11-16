// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { AuthResult, Authenticator } from "./Authenticator";
import { base64UrlDecode, base64UrlDecodeToString } from "../util/base64url";

export interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
}

/** Supplies the public keys of the Access team. Injected so tests can use local keys. */
export interface JwksProvider {
  getKeys(forceRefresh?: boolean): Promise<Jwk[]>;
}

/** Fetches and caches `https://<team>/cdn-cgi/access/certs`. */
export class HttpJwksProvider implements JwksProvider {
  private cache: { keys: Jwk[]; fetchedAt: number } | null = null;

  constructor(
    private readonly teamDomain: string,
    private readonly ttlMs = 60 * 60 * 1000,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  async getKeys(forceRefresh = false): Promise<Jwk[]> {
    const now = Date.now();
    if (!forceRefresh && this.cache && now - this.cache.fetchedAt < this.ttlMs) {
      return this.cache.keys;
    }
    const res = await this.fetcher(`https://${this.teamDomain}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = (body.keys ?? []).filter((k) => k.kty === "RSA");
    this.cache = { keys, fetchedAt: now };
    return keys;
  }
}

interface AccessJwtPayload {
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  email?: string;
  sub?: string;
}

const CLOCK_SKEW_S = 60;

/**
 * Validates the `Cf-Access-Jwt-Assertion` JWT that Cloudflare Access adds to every
 * authenticated request (defense in depth: never trust the plain email header).
 * Checks the RS256 signature against the team JWKS, the issuer, the audience and expiry.
 */
export class CloudflareAccessAuthenticator implements Authenticator {
  readonly name = "cloudflare-access";

  constructor(
    private readonly teamDomain: string,
    private readonly audience: string,
    private readonly jwks: JwksProvider,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async authenticate(req: Request): Promise<AuthResult> {
    if (!this.teamDomain || !this.audience) return { ok: false, reason: "MISCONFIGURED" };

    const token = req.headers.get("Cf-Access-Jwt-Assertion") ?? readCookie(req, "CF_Authorization");
    if (!token) return { ok: false, reason: "MISSING_CREDENTIALS" };

    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, reason: "INVALID_CREDENTIALS" };
    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

    let header: { alg?: string; kid?: string };
    let payload: AccessJwtPayload;
    try {
      header = JSON.parse(base64UrlDecodeToString(headerB64));
      payload = JSON.parse(base64UrlDecodeToString(payloadB64));
    } catch {
      return { ok: false, reason: "INVALID_CREDENTIALS" };
    }
    if (header.alg !== "RS256" || !header.kid) return { ok: false, reason: "INVALID_CREDENTIALS" };

    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    let signature: Uint8Array<ArrayBuffer>;
    try {
      signature = base64UrlDecode(sigB64);
    } catch {
      return { ok: false, reason: "INVALID_CREDENTIALS" };
    }

    const valid = await this.verifySignature(header.kid, signature, signedData);
    if (!valid) return { ok: false, reason: "INVALID_CREDENTIALS" };

    if (payload.iss !== `https://${this.teamDomain}`) return { ok: false, reason: "INVALID_CREDENTIALS" };
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(this.audience)) return { ok: false, reason: "INVALID_CREDENTIALS" };

    const nowS = Math.floor(this.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_S < nowS) {
      return { ok: false, reason: "EXPIRED" };
    }
    if (typeof payload.nbf === "number" && payload.nbf - CLOCK_SKEW_S > nowS) {
      return { ok: false, reason: "INVALID_CREDENTIALS" };
    }

    // Service-token JWTs carry no email: they are not a person and cannot use the app.
    if (!payload.email) return { ok: false, reason: "INVALID_CREDENTIALS" };

    const email = payload.email.toLowerCase();
    return { ok: true, identity: { subject: email, email, provider: this.name } };
  }

  private async verifySignature(
    kid: string,
    signature: Uint8Array<ArrayBuffer>,
    data: Uint8Array<ArrayBuffer>,
  ): Promise<boolean> {
    let keys: Jwk[];
    try {
      keys = await this.jwks.getKeys();
      // Keys rotate: refresh once when the kid is unknown.
      if (!keys.some((k) => k.kid === kid)) keys = await this.jwks.getKeys(true);
    } catch {
      return false;
    }
    const jwk = keys.find((k) => k.kid === kid);
    if (!jwk) return false;
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
    } catch {
      return false;
    }
  }
}

function readCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("Cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
