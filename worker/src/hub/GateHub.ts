// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import { createApp } from "../app";
import { DeviceSession, type DeviceSocket } from "../device/DeviceSession";
import type { Router } from "../http/router";
import { json } from "../http/http";
import { DurableObjectStore } from "../storage/KeyValueStore";

export const PING_INTERVAL_MS = 30_000;
const DEVICE_TAG = "device";

/**
 * The single Durable Object (`idFromName("main")`) that owns the device WebSocket,
 * the gate metadata, invites, rate limits and the audit log.
 * Uses the WebSocket Hibernation API so an idle connection costs nothing.
 */
export class GateHub extends DurableObject<Env> {
  private readonly session: DeviceSession;
  private readonly router: Router;
  private malformed = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.session = new DeviceSession(() => ctx.getWebSockets(DEVICE_TAG) as unknown as DeviceSocket[]);
    this.router = createApp({ env, store: new DurableObjectStore(ctx.storage), gateway: this.session }).router;
  }

  override async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/device") return this.acceptDevice(req);
    return this.router.handle(req);
  }

  /** The Worker already checked DEVICE_TOKEN before forwarding the upgrade here. */
  private async acceptDevice(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ ok: false, error: "UPGRADE_REQUIRED" }, 426);
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [DEVICE_TAG]);
    this.session.attach(server as unknown as DeviceSocket);
    await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const result = this.session.handleMessage(ws as unknown as DeviceSocket, message);
    if (!result.ok) {
      this.malformed++;
      console.warn("Dropped malformed device message:", result.error);
      // A device that keeps sending garbage is closed; it will reconnect with backoff.
      if (this.malformed > 20) {
        this.malformed = 0;
        ws.close(1008, "too many malformed messages");
      }
    }
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    // Only fail pending opens when the *current* device went away, not a replaced one.
    if (this.ctx.getWebSockets(DEVICE_TAG).every((s) => s === ws)) this.session.handleClose();
    try {
      ws.close(code === 1005 ? 1000 : code, "closing");
    } catch {
      /* already closed */
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    if (this.ctx.getWebSockets(DEVICE_TAG).every((s) => s === ws)) this.session.handleClose();
  }

  /** Server-side keepalive: ping the device every 30 s while it is connected. */
  override async alarm(): Promise<void> {
    if (this.ctx.getWebSockets(DEVICE_TAG).length === 0) return;
    this.session.ping();
    await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS);
  }
}
