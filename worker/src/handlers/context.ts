// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { Authenticator, Identity } from "../auth/Authenticator";
import type { Authorizer } from "../auth/Authorizer";
import type { AuditLog } from "../audit/AuditLog";
import type { GateGateway } from "../device/DeviceSession";
import type { GateMetadata, GateMetadataRepository } from "../gates/GateMetadataRepository";
import type { InviteRepository } from "../invites/InviteRepository";
import type { OpenGateService } from "../services/OpenGateService";
import { HttpError } from "../http/http";

/** Everything the HTTP handlers depend on. All are interfaces, injected by the composition root. */
export interface AppServices {
  userAuth: Authenticator;
  guestAuth: Authenticator;
  authorizer: Authorizer;
  gateway: GateGateway;
  audit: AuditLog;
  gateMeta: GateMetadataRepository;
  invites: InviteRepository;
  openGate: OpenGateService;
  now: () => number;
}

const AUTH_STATUS: Record<string, number> = {
  MISSING_CREDENTIALS: 401,
  INVALID_CREDENTIALS: 401,
  EXPIRED: 401,
  MISCONFIGURED: 500,
};

export async function requireUser(s: AppServices, req: Request): Promise<Identity> {
  const result = await s.userAuth.authenticate(req);
  if (!result.ok) throw new HttpError(AUTH_STATUS[result.reason] ?? 401, "UNAUTHENTICATED", result.reason);
  if (!(await s.authorizer.canUseApp(result.identity))) {
    throw new HttpError(403, "FORBIDDEN", "This account is not allowed");
  }
  return result.identity;
}

export async function requireAdmin(s: AppServices, req: Request): Promise<Identity> {
  const identity = await requireUser(s, req);
  if (!(await s.authorizer.isAdmin(identity))) throw new HttpError(403, "FORBIDDEN", "Admins only");
  return identity;
}

export async function requireGuest(s: AppServices, req: Request): Promise<Identity> {
  const result = await s.guestAuth.authenticate(req);
  if (!result.ok) {
    throw new HttpError(401, result.reason === "EXPIRED" ? "INVITE_EXPIRED" : "INVITE_INVALID", result.reason);
  }
  return result.identity;
}

/** Public view of a gate for the UI. */
export interface GateView {
  name: string;
  label?: string;
  icon?: string;
  lat?: number;
  lng?: number;
  radiusM?: number;
  requireProximity: boolean;
}

export function toGateView(name: string, meta: GateMetadata | undefined, forceProximity = false): GateView {
  return {
    name,
    label: meta?.label,
    icon: meta?.icon,
    lat: meta?.lat,
    lng: meta?.lng,
    radiusM: meta?.lat !== undefined ? meta.radiusM : undefined,
    requireProximity: meta?.lat !== undefined && (meta.requireProximity || forceProximity),
  };
}

export async function gateViews(s: AppServices, names: string[], forceProximity = false): Promise<GateView[]> {
  const metas = new Map((await s.gateMeta.list()).map((m) => [m.gate, m]));
  return names.map((n) => toGateView(n, metas.get(n), forceProximity));
}
