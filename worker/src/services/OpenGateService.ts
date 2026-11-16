// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { Identity } from "../auth/Authenticator";
import type { Authorizer } from "../auth/Authorizer";
import type { AuditLog } from "../audit/AuditLog";
import type { GateGateway } from "../device/DeviceSession";
import type { GateMetadataRepository } from "../gates/GateMetadataRepository";
import { checkProximity, isValidLatLng, roundDistance, type Position } from "../gates/geo";
import type { InviteRepository } from "../invites/InviteRepository";
import type { RateLimiter, RatePolicy } from "../security/RateLimiter";
import { isValidGateName } from "../protocol/messages";
import { HttpError } from "../http/http";

export interface OpenRequest {
  identity: Identity;
  gate: unknown;
  position?: { lat?: unknown; lng?: unknown; accuracy?: unknown };
  ip: string;
  policy: RatePolicy;
  /** Guests always need proximity when their invite says so. */
  forceProximity?: boolean;
}

export type OpenResult = { ok: true; distanceM?: number };

const ERROR_STATUS: Record<string, number> = {
  DEVICE_OFFLINE: 503,
  TIMEOUT: 504,
  GATE_NOT_FOUND: 404,
  INVALID_NAME: 400,
  TX_FAILED: 502,
  BUSY: 409,
  INTERNAL: 502,
};

/** The use case "open a gate": authorize, check proximity, rate-limit, transmit, audit. */
export class OpenGateService {
  constructor(
    private readonly deps: {
      authorizer: Authorizer;
      gateway: GateGateway;
      rateLimiter: RateLimiter;
      audit: AuditLog;
      gateMeta: GateMetadataRepository;
      invites: InviteRepository;
      now: () => number;
    },
  ) {}

  async open(req: OpenRequest): Promise<OpenResult> {
    const { identity } = req;
    if (!isValidGateName(req.gate)) throw new HttpError(400, "BAD_REQUEST", "Invalid gate name");
    const gate = req.gate;

    const status = this.deps.gateway.status();
    const allowed = await this.deps.authorizer.allowedGates(identity, status.online ? status.gates : [gate]);
    if (!allowed.includes(gate)) throw new HttpError(403, "GATE_NOT_ALLOWED", "You may not open this gate");

    const position = parsePosition(req.position);
    const meta = await this.deps.gateMeta.get(gate);
    const needsProximity = !!meta && (meta.requireProximity || !!req.forceProximity);
    let distanceM: number | undefined;

    if (needsProximity && meta.lat !== undefined && meta.lng !== undefined) {
      const check = checkProximity({ lat: meta.lat, lng: meta.lng, radiusM: meta.radiusM }, position);
      if (!check.ok) {
        await this.audit(req, gate, false, check.error, check.distanceM);
        throw new HttpError(
          403,
          check.error,
          check.error === "TOO_FAR" ? "You are too far from this gate" : "Location required",
          {
            distanceM: check.distanceM !== undefined ? roundDistance(check.distanceM) : undefined,
            radiusM: meta.radiusM,
          },
        );
      }
      distanceM = check.distanceM;
    }

    // Nothing is transmitted while the device is offline, so don't burn the cooldown.
    if (!status.online) {
      await this.audit(req, gate, false, "DEVICE_OFFLINE", distanceM);
      throw new HttpError(503, "DEVICE_OFFLINE");
    }

    const rate = await this.deps.rateLimiter.consume(identity.subject, gate, req.policy);
    if (!rate.ok) {
      throw new HttpError(429, rate.error, "Please wait a moment", { retryAfterS: rate.retryAfterS });
    }

    const outcome = await this.deps.gateway.open(gate);
    await this.audit(req, gate, outcome.ok, outcome.ok ? undefined : outcome.error, distanceM);

    if (!outcome.ok) throw new HttpError(ERROR_STATUS[outcome.error] ?? 502, outcome.error);
    if (identity.provider === "invite") await this.deps.invites.recordOpen(identity.subject);
    return { ok: true, distanceM: distanceM !== undefined ? roundDistance(distanceM) : undefined };
  }

  private audit(req: OpenRequest, gate: string, ok: boolean, error?: string, distanceM?: number): Promise<void> {
    const { identity } = req;
    return this.deps.audit.append({
      ts: this.deps.now(),
      who:
        identity.provider === "invite"
          ? `Guest: ${identity.label ?? identity.subject}`
          : (identity.email ?? identity.subject),
      provider: identity.provider,
      ip: req.ip,
      gate,
      ok,
      error,
      distanceM: distanceM !== undefined ? roundDistance(distanceM) : undefined,
    });
  }
}

function parsePosition(p: OpenRequest["position"]): Position | undefined {
  if (!p) return undefined;
  if (!isValidLatLng(p.lat, p.lng)) return undefined;
  const accuracy = typeof p.accuracy === "number" && Number.isFinite(p.accuracy) ? p.accuracy : 1000;
  return { lat: p.lat as number, lng: p.lng as number, accuracy };
}
