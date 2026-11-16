// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { createApp } from "../src/app";
import type { Authenticator } from "../src/auth/Authenticator";
import type { Jwk, JwksProvider } from "../src/auth/CloudflareAccessAuthenticator";
import { DeviceSession, type DeviceSocket } from "../src/device/DeviceSession";
import type { Env } from "../src/env";
import { MemoryStore } from "../src/storage/KeyValueStore";
import { base64UrlEncode } from "../src/util/base64url";

export const ORIGIN = "https://gate.example.com";
export const TEAM = "team.cloudflareaccess.com";
export const AUD = "test-aud-tag";

// ---------- JWT helpers ----------

export interface TestSigner {
  jwks: JwksProvider;
  sign(payload: Record<string, unknown>, kid?: string): Promise<string>;
}

export async function createSigner(kid = "key-1"): Promise<TestSigner> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const jwk: Jwk = { kid, kty: "RSA", alg: "RS256", n: pub.n!, e: pub.e! };
  const enc = (o: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(o)));
  return {
    jwks: { getKeys: async () => [jwk] },
    async sign(payload, signKid = kid) {
      const head = enc({ alg: "RS256", kid: signKid, typ: "JWT" });
      const body = enc(payload);
      const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
      return `${head}.${body}.${base64UrlEncode(new Uint8Array(sig))}`;
    },
  };
}

export function accessClaims(email: string, nowMs: number, extra: Record<string, unknown> = {}) {
  const now = Math.floor(nowMs / 1000);
  return { aud: [AUD], iss: `https://${TEAM}`, email, iat: now, nbf: now, exp: now + 3600, sub: "user-id", ...extra };
}

// ---------- Fake device ----------

export class FakeSocket implements DeviceSocket {
  sent: Record<string, unknown>[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private attachment: unknown = null;
  /** When set, every `open` command is answered by the device with this result. */
  autoReply: ((gate: string) => { ok: boolean; error?: string } | null) | null = () => ({ ok: true });
  session!: DeviceSession;

  send(data: string): void {
    const msg = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(msg);
    if (msg.type === "open" && this.autoReply) {
      const reply = this.autoReply(String(msg.gate));
      if (reply) {
        queueMicrotask(() => this.session.handleMessage(this, JSON.stringify({ v: 1, type: "result", id: msg.id, ...reply })));
      }
    }
  }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }
  serializeAttachment(value: unknown): void {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment(): unknown {
    return structuredClone(this.attachment);
  }
}

export class Clock {
  constructor(public t = Date.UTC(2026, 10, 16, 20, 0, 0)) {}
  now = () => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

export function connectDevice(session: DeviceSession, sockets: FakeSocket[], gates = ["Garage", "Main Entrance"]): FakeSocket {
  const socket = new FakeSocket();
  socket.session = session;
  sockets.push(socket);
  session.attach(socket);
  session.handleMessage(socket, JSON.stringify({ v: 1, type: "hello", fw: "bruce-gate-relay/1.0.0", gates }));
  return socket;
}

// ---------- App harness ----------

export interface Harness {
  clock: Clock;
  store: MemoryStore;
  session: DeviceSession;
  sockets: FakeSocket[];
  signer: TestSigner;
  handle(req: Request): Promise<Response>;
  token(email: string, extra?: Record<string, unknown>): Promise<string>;
}

export async function createHarness(envOverrides: Partial<Env> = {}, opts: { timeoutMs?: number; userAuth?: Authenticator } = {}): Promise<Harness> {
  const clock = new Clock();
  const store = new MemoryStore();
  const sockets: FakeSocket[] = [];
  const session = new DeviceSession(() => sockets.filter((s) => !s.closed), clock.now, opts.timeoutMs ?? 200);
  const signer = await createSigner();
  const env = {
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    ALLOWED_EMAILS: "alice@example.com, bob@example.com",
    ADMIN_EMAILS: "admin@example.com",
    ...envOverrides,
  } as Env;

  const { CloudflareAccessAuthenticator } = await import("../src/auth/CloudflareAccessAuthenticator");
  const userAuth = opts.userAuth ?? new CloudflareAccessAuthenticator(TEAM, AUD, signer.jwks, clock.now);
  const { router } = createApp({ env, store, gateway: session, now: clock.now, userAuth });

  return {
    clock,
    store,
    session,
    sockets,
    signer,
    handle: (req) => router.handle(req),
    token: (email, extra) => signer.sign(accessClaims(email, clock.t, extra)),
  };
}

export function apiRequest(
  path: string,
  init: { method?: string; jwt?: string; body?: unknown; origin?: string | null; contentType?: string; bearer?: string } = {},
): Request {
  const headers = new Headers();
  if (init.jwt) headers.set("Cf-Access-Jwt-Assertion", init.jwt);
  if (init.bearer) headers.set("Authorization", `Bearer ${init.bearer}`);
  const method = init.method ?? (init.body !== undefined ? "POST" : "GET");
  if (method !== "GET") {
    if (init.origin !== null) headers.set("Origin", init.origin ?? ORIGIN);
    headers.set("Content-Type", init.contentType ?? "application/json");
  }
  headers.set("CF-Connecting-IP", "203.0.113.7");
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
