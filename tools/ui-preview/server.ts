// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

/**
 * UI preview: runs the real Worker router in Node with in-memory storage and a
 * simulated device, so you can click through the app without Cloudflare.
 *
 *   cd worker && npm run build:client && npx tsx ../tools/ui-preview/server.ts
 *   open http://localhost:8788   (switch user with ?as=bob@example.com)
 *
 * Development only: authentication is faked by DevAuthenticator (localhost only).
 */

import { createServer } from "node:http";
import { createApp } from "../../worker/src/app";
import { DevAuthenticator } from "../../worker/src/auth/DevAuthenticator";
import { DeviceSession, type DeviceSocket } from "../../worker/src/device/DeviceSession";
import type { Env } from "../../worker/src/env";
import { MemoryStore } from "../../worker/src/storage/KeyValueStore";
import { serveStatic } from "../../worker/src/ui/assets";

const PORT = Number(process.env.PORT ?? 8788);
const GATES = (process.env.GATES ?? "Garage,Main Entrance,Back Gate").split(",");
const OFFLINE = process.env.OFFLINE === "1";

class SimulatedDevice implements DeviceSocket {
  private attachment: unknown = null;
  constructor(private readonly session: () => DeviceSession) {}
  send(data: string): void {
    const msg = JSON.parse(data) as { type: string; id?: string; gate?: string };
    if (msg.type !== "open") return;
    console.log(`[device] transmitting ${msg.gate}.sub`);
    setTimeout(() => {
      this.session().handleMessage(this, JSON.stringify({ v: 1, type: "result", id: msg.id, ok: true }));
    }, 600);
  }
  close(): void {}
  serializeAttachment(v: unknown): void {
    this.attachment = v;
  }
  deserializeAttachment(): unknown {
    return this.attachment;
  }
}

const sockets: DeviceSocket[] = [];
const session: DeviceSession = new DeviceSession(() => sockets);
if (!OFFLINE) {
  const device = new SimulatedDevice(() => session);
  sockets.push(device);
  session.attach(device);
  session.handleMessage(device, JSON.stringify({ v: 1, type: "hello", fw: "bruce-gate-relay/1.0.0", gates: GATES }));
  setInterval(() => session.handleMessage(device, '{"v":1,"type":"pong"}'), 30_000);
}

const env = {
  ENVIRONMENT: "development",
  ALLOWED_EMAILS: "alice@example.com,bob@example.com",
  ADMIN_EMAILS: "admin@example.com",
  DEV_USER_EMAIL: process.env.DEV_USER ?? "admin@example.com",
} as Env;
const store = new MemoryStore();
const { router } = createApp({ env, store, gateway: session, userAuth: new DevAuthenticator("development", env.DEV_USER_EMAIL!) });

createServer(async (nodeReq, nodeRes) => {
  const chunks: Buffer[] = [];
  for await (const c of nodeReq) chunks.push(c as Buffer);
  const url = `http://localhost:${PORT}${nodeReq.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(nodeReq.headers)) if (typeof v === "string") headers.set(k, v);
  // Switch users in the preview with ?as=<email> (remembered in a cookie).
  const as = new URL(url).searchParams.get("as") ?? /(?:^|; )dev_user=([^;]+)/.exec(nodeReq.headers.cookie ?? "")?.[1];
  if (as) headers.set("X-Dev-User", decodeURIComponent(as));
  // Same-origin check expects the public origin; the preview is served from localhost.
  const req = new Request(url, {
    method: nodeReq.method,
    headers,
    body: ["GET", "HEAD"].includes(nodeReq.method ?? "GET") ? undefined : Buffer.concat(chunks),
  });
  const res = new URL(url).pathname.startsWith("/api/") ? await router.handle(req) : (serveStatic(req) ?? new Response("Not found", { status: 404 }));
  const outHeaders: Record<string, string> = Object.fromEntries(res.headers);
  const asParam = new URL(url).searchParams.get("as");
  if (asParam) outHeaders["Set-Cookie"] = `dev_user=${encodeURIComponent(asParam)}; Path=/; SameSite=Lax`;
  nodeRes.writeHead(res.status, outHeaders);
  nodeRes.end(Buffer.from(await res.arrayBuffer()));
}).listen(PORT, () => console.log(`UI preview on http://localhost:${PORT} (gates: ${GATES.join(", ")})`));
