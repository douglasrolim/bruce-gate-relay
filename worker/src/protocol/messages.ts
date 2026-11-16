// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

/**
 * Device <-> server WebSocket protocol, version 1.
 * See docs/architecture.md for the specification.
 */

export const PROTOCOL_VERSION = 1;

/** Error codes a device may report in a `result` message. */
export const DEVICE_ERROR_CODES = ["GATE_NOT_FOUND", "INVALID_NAME", "TX_FAILED", "BUSY", "INTERNAL"] as const;
export type DeviceErrorCode = (typeof DEVICE_ERROR_CODES)[number];

export interface HelloMessage {
  v: 1;
  type: "hello";
  fw: string;
  gates: string[];
}
export interface ResultMessage {
  v: 1;
  type: "result";
  id: string;
  ok: boolean;
  error?: DeviceErrorCode;
}
export interface PongMessage {
  v: 1;
  type: "pong";
}
export type DeviceMessage = HelloMessage | ResultMessage | PongMessage;

export interface OpenCommand {
  v: 1;
  type: "open";
  id: string;
  gate: string;
}
export interface PingCommand {
  v: 1;
  type: "ping";
}
export type ServerMessage = OpenCommand | PingCommand;

export const MAX_MESSAGE_BYTES = 4096;
export const MAX_GATES = 32;
export const MAX_GATE_NAME_LENGTH = 48;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A gate name is a `.sub` file name without its extension. It must never carry
 * a path: no slashes, backslashes, `..`, control characters or leading dots.
 */
export function isValidGateName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.length > MAX_GATE_NAME_LENGTH) return false;
  if (name !== name.trim()) return false;
  if (name.startsWith(".")) return false;
  if (name.includes("..")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[/\\\u0000-\u001f\u007f:*?"<>|]/.test(name)) return false;
  return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Parses and validates a raw frame received from the device. Never throws. */
export function parseDeviceMessage(raw: string | ArrayBuffer): ParseResult<DeviceMessage> {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  if (text.length > MAX_MESSAGE_BYTES) return { ok: false, error: "message too large" };

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }
  if (!isRecord(data)) return { ok: false, error: "not an object" };
  if (data.v !== PROTOCOL_VERSION) return { ok: false, error: "unsupported version" };

  switch (data.type) {
    case "hello": {
      if (typeof data.fw !== "string" || data.fw.length > 64) {
        return { ok: false, error: "invalid fw" };
      }
      if (!Array.isArray(data.gates) || data.gates.length > MAX_GATES) {
        return { ok: false, error: "invalid gates" };
      }
      if (!data.gates.every(isValidGateName)) return { ok: false, error: "invalid gate name" };
      const gates = [...new Set(data.gates as string[])];
      return { ok: true, value: { v: 1, type: "hello", fw: data.fw, gates } };
    }
    case "result": {
      if (typeof data.id !== "string" || !UUID_RE.test(data.id)) {
        return { ok: false, error: "invalid id" };
      }
      if (typeof data.ok !== "boolean") return { ok: false, error: "invalid ok" };
      const msg: ResultMessage = { v: 1, type: "result", id: data.id, ok: data.ok };
      if (!data.ok) {
        const err = data.error;
        msg.error = (DEVICE_ERROR_CODES as readonly unknown[]).includes(err) ? (err as DeviceErrorCode) : "INTERNAL";
      }
      return { ok: true, value: msg };
    }
    case "pong":
      return { ok: true, value: { v: 1, type: "pong" } };
    default:
      return { ok: false, error: "unknown type" };
  }
}

export function encodeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}
