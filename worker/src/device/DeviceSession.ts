// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import {
  encodeServerMessage,
  parseDeviceMessage,
  type DeviceErrorCode,
} from "../protocol/messages";

/** What the HTTP side needs from the device. Handlers depend on this, not on WebSockets. */
export interface GateGateway {
  status(): DeviceStatus;
  open(gate: string): Promise<OpenOutcome>;
}

export interface DeviceStatus {
  online: boolean;
  gates: string[];
  fw?: string;
  lastSeen?: number;
}

export type GatewayError = "DEVICE_OFFLINE" | "TIMEOUT" | DeviceErrorCode;
export type OpenOutcome = { ok: true } | { ok: false; error: GatewayError };

/** The subset of the Workers WebSocket API we use (hibernation attachments included). */
export interface DeviceSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

interface Attachment {
  hello?: { fw: string; gates: string[] };
  lastSeen: number;
}

export const OPEN_TIMEOUT_MS = 10_000;
/** A device that has not spoken for this long is considered offline (3 missed pings). */
export const STALE_AFTER_MS = 100_000;

/**
 * Bridges HTTP requests to the single connected device.
 * State that must survive hibernation (gate list, last seen) lives in the socket attachment;
 * pending opens only exist while a request is awaiting, which keeps the object awake.
 */
export class DeviceSession implements GateGateway {
  private readonly pending = new Map<
    string,
    { resolve: (o: OpenOutcome) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(
    private readonly sockets: () => DeviceSocket[],
    private readonly now: () => number = () => Date.now(),
    private readonly timeoutMs = OPEN_TIMEOUT_MS,
  ) {}

  /** Called when a new device connects. Only one device is supported: older sockets are closed. */
  attach(socket: DeviceSocket): void {
    for (const old of this.sockets()) {
      if (old !== socket) old.close(4000, "replaced by a newer connection");
    }
    socket.serializeAttachment({ lastSeen: this.now() } satisfies Attachment);
  }

  private current(): DeviceSocket | undefined {
    const all = this.sockets();
    return all[all.length - 1];
  }

  private attachment(socket: DeviceSocket | undefined): Attachment | undefined {
    return (socket?.deserializeAttachment() as Attachment | null) ?? undefined;
  }

  status(): DeviceStatus {
    const socket = this.current();
    const att = this.attachment(socket);
    if (!socket || !att) return { online: false, gates: [] };
    const fresh = this.now() - att.lastSeen < STALE_AFTER_MS;
    return {
      online: fresh && !!att.hello,
      gates: att.hello?.gates ?? [],
      fw: att.hello?.fw,
      lastSeen: att.lastSeen,
    };
  }

  /** Handles one frame from the device. Malformed frames are dropped (and counted by the caller). */
  handleMessage(socket: DeviceSocket, raw: string | ArrayBuffer): { ok: boolean; error?: string } {
    const parsed = parseDeviceMessage(raw);
    const att: Attachment = this.attachment(socket) ?? { lastSeen: 0 };
    att.lastSeen = this.now();

    if (!parsed.ok) {
      socket.serializeAttachment(att);
      return { ok: false, error: parsed.error };
    }

    const msg = parsed.value;
    if (msg.type === "hello") {
      att.hello = { fw: msg.fw, gates: msg.gates };
    } else if (msg.type === "result") {
      const waiter = this.pending.get(msg.id);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.pending.delete(msg.id);
        waiter.resolve(msg.ok ? { ok: true } : { ok: false, error: msg.error ?? "INTERNAL" });
      }
    }
    socket.serializeAttachment(att);
    return { ok: true };
  }

  /** Called when the device socket closes: every pending open fails fast. */
  handleClose(): void {
    for (const [id, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.resolve({ ok: false, error: "DEVICE_OFFLINE" });
      this.pending.delete(id);
    }
  }

  ping(): void {
    const socket = this.current();
    if (!socket) return;
    try {
      socket.send(encodeServerMessage({ v: 1, type: "ping" }));
    } catch {
      /* closed under us: handled by the close event */
    }
  }

  open(gate: string): Promise<OpenOutcome> {
    const socket = this.current();
    const st = this.status();
    if (!socket || !st.online) return Promise.resolve({ ok: false, error: "DEVICE_OFFLINE" });
    if (!st.gates.includes(gate)) return Promise.resolve({ ok: false, error: "GATE_NOT_FOUND" });

    const id = crypto.randomUUID();
    return new Promise<OpenOutcome>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: "TIMEOUT" });
      }, this.timeoutMs);
      this.pending.set(id, { resolve, timer });
      try {
        socket.send(encodeServerMessage({ v: 1, type: "open", id, gate }));
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve({ ok: false, error: "DEVICE_OFFLINE" });
      }
    });
  }
}
