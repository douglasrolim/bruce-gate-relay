// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { t } from "./i18n";

export interface GateView {
  name: string;
  label?: string;
  icon?: string;
  lat?: number;
  lng?: number;
  radiusM?: number;
  requireProximity: boolean;
}

export interface Me {
  email?: string;
  provider: string;
  isAdmin: boolean;
}

export interface GatesResponse {
  online: boolean;
  lastSeen: number | null;
  gates: GateView[];
}

export interface GuestGatesResponse extends GatesResponse {
  label: string;
  validUntil: number;
  opensLeft: number | null;
}

export interface AuditEntry {
  ts: number;
  who: string;
  provider: string;
  ip?: string;
  gate: string;
  ok: boolean;
  error?: string;
  distanceM?: number;
}

export interface GateMetadata {
  gate: string;
  lat?: number;
  lng?: number;
  radiusM: number;
  requireProximity: boolean;
  label?: string;
  icon?: string;
  updatedBy: string;
  updatedAt: number;
}

export interface Invite {
  id: string;
  label: string;
  gates: string[];
  validFrom: number;
  validUntil: number;
  requireProximity: boolean;
  maxOpens?: number;
  opens: number;
  createdBy: string;
  createdAt: number;
  revoked: boolean;
  status: "scheduled" | "active" | "expired" | "exhausted" | "revoked";
}

export interface PositionPayload {
  lat: number;
  lng: number;
  accuracy: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

/** Thin fetch wrapper. Guests send their invite token as a Bearer header (never in the URL). */
export class Api {
  constructor(private readonly guestToken?: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.guestToken) headers.Authorization = `Bearer ${this.guestToken}`;

    let res: Response;
    try {
      res = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "same-origin",
        cache: "no-store",
        redirect: "manual",
      });
    } catch {
      throw new ApiError(0, "NETWORK");
    }
    // Cloudflare Access session expired: it answers with a redirect to the login page.
    if (res.type === "opaqueredirect" || res.status === 302) throw new ApiError(401, "SESSION_EXPIRED");

    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON (e.g. an Access login page) */
      if (!res.ok || res.headers.get("Content-Type")?.includes("text/html"))
        throw new ApiError(res.status || 401, "SESSION_EXPIRED");
    }
    if (!res.ok) throw new ApiError(res.status, String(data.error ?? "INTERNAL"), data);
    return data as T;
  }

  me() {
    return this.request<Me>("GET", "/api/me");
  }
  gates() {
    return this.request<GatesResponse>("GET", "/api/gates");
  }
  log() {
    return this.request<{ entries: AuditEntry[] }>("GET", "/api/log");
  }
  open(gate: string, position?: PositionPayload) {
    return this.request<{ ok: true; distanceM?: number }>("POST", "/api/open", { gate, position });
  }

  guestGates() {
    return this.request<GuestGatesResponse>("GET", "/api/guest/gates");
  }
  guestOpen(gate: string, position?: PositionPayload) {
    return this.request<{ ok: true }>("POST", "/api/guest/open", { gate, position });
  }

  adminGates() {
    return this.request<GatesResponse & { orphans: GateMetadata[] }>("GET", "/api/admin/gates");
  }
  saveGate(name: string, meta: Partial<GateMetadata>) {
    return this.request<{ ok: true; gate: GateMetadata }>("PUT", `/api/admin/gates/${encodeURIComponent(name)}`, meta);
  }
  deleteGate(name: string) {
    return this.request<{ ok: true }>("DELETE", `/api/admin/gates/${encodeURIComponent(name)}`);
  }
  exportGates() {
    return this.request<{ gates: GateMetadata[] }>("GET", "/api/admin/export");
  }
  importGates(gates: GateMetadata[]) {
    return this.request<{ imported: number }>("POST", "/api/admin/import", { gates });
  }
  invites() {
    return this.request<{ invites: Invite[] }>("GET", "/api/admin/invites");
  }
  createInvite(input: {
    label: string;
    gates: string[];
    validFrom: number;
    validUntil: number;
    requireProximity: boolean;
    maxOpens?: number;
  }) {
    return this.request<{ invite: Invite; url: string }>("POST", "/api/admin/invites", input);
  }
  revokeInvite(id: string) {
    return this.request<{ ok: true }>("POST", `/api/admin/invites/${encodeURIComponent(id)}/revoke`, {});
  }
}

/** Human, short explanations for error codes. */
export function describeError(code: string, body: Record<string, unknown> = {}): string {
  switch (code) {
    case "DEVICE_OFFLINE":
      return t("Device offline");
    case "TIMEOUT":
      return t("No answer from the device");
    case "GATE_NOT_FOUND":
      return t("Gate not found on the device");
    case "TX_FAILED":
      return t("Radio transmission failed");
    case "BUSY":
      return t("Device busy, try again");
    case "COOLDOWN":
      return t("Wait {s}s", { s: Number(body.retryAfterS ?? 3) });
    case "RATE_LIMITED":
      return t("Too many opens, try later");
    case "TOO_FAR":
      return body.distanceM ? t("Too far ({d} m away)", { d: Number(body.distanceM) }) : t("You are too far");
    case "LOCATION_REQUIRED":
      return t("Location needed for this gate");
    case "GATE_NOT_ALLOWED":
      return t("Not allowed");
    case "INVITE_EXPIRED":
      return t("This invite has expired");
    case "INVITE_INVALID":
      return t("This invite is not valid");
    case "SESSION_EXPIRED":
      return t("Session expired, reload");
    case "NETWORK":
      return t("No connection");
    case "FORBIDDEN":
      return t("Not allowed");
    default:
      return t("Something went wrong");
  }
}
