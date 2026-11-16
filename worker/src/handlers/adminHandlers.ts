// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import {
  DEFAULT_RADIUS_M,
  GATE_ICONS,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  findOrphans,
  type GateMetadata,
} from "../gates/GateMetadataRepository";
import { isValidLatLng } from "../gates/geo";
import { HttpError, assertSameOriginJson, json, readJson } from "../http/http";
import type { Router } from "../http/router";
import { inviteStatus, type Invite } from "../invites/InviteRepository";
import { isValidGateName } from "../protocol/messages";
import { gateViews, requireAdmin, type AppServices } from "./context";

export const MAX_INVITE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function registerAdminRoutes(router: Router, s: AppServices): void {
  router.on("GET", "/api/admin/gates", async (req) => {
    await requireAdmin(s, req);
    const st = s.gateway.status();
    const all = await s.gateMeta.list();
    return json({
      online: st.online,
      gates: await gateViews(s, st.gates),
      orphans: st.online ? findOrphans(all, st.gates) : [],
    });
  });

  router.on("PUT", "/api/admin/gates/:name", async (req, params) => {
    assertSameOriginJson(req);
    const admin = await requireAdmin(s, req);
    const name = params.name!;
    if (!isValidGateName(name)) throw new HttpError(400, "BAD_REQUEST", "Invalid gate name");
    const meta = validateGateMetadata(await readJson(req), name, admin.email ?? admin.subject, s.now());
    await s.gateMeta.upsert(meta);
    return json({ ok: true, gate: meta });
  });

  router.on("DELETE", "/api/admin/gates/:name", async (req, params) => {
    const origin = req.headers.get("Origin");
    if (origin !== new URL(req.url).origin) throw new HttpError(403, "BAD_ORIGIN");
    await requireAdmin(s, req);
    const deleted = await s.gateMeta.delete(params.name!);
    if (!deleted) throw new HttpError(404, "NOT_FOUND");
    return json({ ok: true });
  });

  router.on("GET", "/api/admin/export", async (req) => {
    await requireAdmin(s, req);
    return json({ version: 1, exportedAt: s.now(), gates: await s.gateMeta.list() });
  });

  router.on("POST", "/api/admin/import", async (req) => {
    assertSameOriginJson(req);
    const admin = await requireAdmin(s, req);
    const body = await readJson(req, 64 * 1024);
    if (!Array.isArray(body.gates)) throw new HttpError(400, "BAD_REQUEST", "Expected {gates: [...]}");
    const valid = body.gates.map((g) => {
      const rec = (typeof g === "object" && g ? g : {}) as Record<string, unknown>;
      if (!isValidGateName(rec.gate)) throw new HttpError(400, "BAD_REQUEST", "Invalid gate name");
      return validateGateMetadata(rec, rec.gate, admin.email ?? admin.subject, s.now());
    });
    for (const meta of valid) await s.gateMeta.upsert(meta);
    return json({ ok: true, imported: valid.length });
  });

  router.on("GET", "/api/admin/invites", async (req) => {
    await requireAdmin(s, req);
    const now = s.now();
    return json({ invites: (await s.invites.list()).map((i) => publicInvite(i, now)) });
  });

  router.on("POST", "/api/admin/invites", async (req) => {
    assertSameOriginJson(req);
    const admin = await requireAdmin(s, req);
    const body = await readJson(req);
    const now = s.now();
    const input = validateInvite(body, s.gateway.status().gates, now);
    const { invite, token } = await s.invites.create({ ...input, createdBy: admin.email ?? admin.subject });
    const url = `${new URL(req.url).origin}/i/${token}`;
    return json({ ok: true, invite: publicInvite(invite, now), url }, 201);
  });

  router.on("POST", "/api/admin/invites/:id/revoke", async (req, params) => {
    assertSameOriginJson(req);
    await requireAdmin(s, req);
    if (!(await s.invites.revoke(params.id!))) throw new HttpError(404, "NOT_FOUND");
    return json({ ok: true });
  });
}

export function publicInvite(invite: Invite, now: number) {
  const { tokenHash: _hidden, ...rest } = invite;
  return { ...rest, status: inviteStatus(invite, now) };
}

export function validateGateMetadata(
  body: Record<string, unknown>,
  gate: string,
  updatedBy: string,
  now: number,
): GateMetadata {
  const hasLocation = body.lat !== undefined && body.lat !== null;
  if (hasLocation && !isValidLatLng(body.lat, body.lng)) {
    throw new HttpError(400, "BAD_REQUEST", "Latitude must be -90..90 and longitude -180..180");
  }
  const radiusM = body.radiusM === undefined ? DEFAULT_RADIUS_M : body.radiusM;
  if (typeof radiusM !== "number" || !Number.isFinite(radiusM) || radiusM < MIN_RADIUS_M || radiusM > MAX_RADIUS_M) {
    throw new HttpError(400, "BAD_REQUEST", `Radius must be ${MIN_RADIUS_M}..${MAX_RADIUS_M} m`);
  }
  if (body.requireProximity !== undefined && typeof body.requireProximity !== "boolean") {
    throw new HttpError(400, "BAD_REQUEST", "requireProximity must be a boolean");
  }
  if (body.requireProximity === true && !hasLocation) {
    throw new HttpError(400, "BAD_REQUEST", "Set a location before requiring proximity");
  }
  const label = body.label === undefined || body.label === "" ? undefined : body.label;
  if (label !== undefined && (typeof label !== "string" || label.length > 40)) {
    throw new HttpError(400, "BAD_REQUEST", "Label must be a string up to 40 characters");
  }
  const icon = body.icon === undefined ? undefined : body.icon;
  if (icon !== undefined && !(GATE_ICONS as readonly unknown[]).includes(icon)) {
    throw new HttpError(400, "BAD_REQUEST", "Unknown icon");
  }
  return {
    gate,
    lat: hasLocation ? (body.lat as number) : undefined,
    lng: hasLocation ? (body.lng as number) : undefined,
    radiusM: Math.round(radiusM),
    requireProximity: body.requireProximity === true,
    label: label as string | undefined,
    icon: icon as string | undefined,
    updatedBy,
    updatedAt: now,
  };
}

export function validateInvite(body: Record<string, unknown>, deviceGates: readonly string[], now: number) {
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (label.length < 1 || label.length > 60) throw new HttpError(400, "BAD_REQUEST", "Label is required (max 60)");

  if (!Array.isArray(body.gates) || body.gates.length === 0 || !body.gates.every(isValidGateName)) {
    throw new HttpError(400, "BAD_REQUEST", "Pick at least one gate");
  }
  const gates = [...new Set(body.gates as string[])];
  if (deviceGates.length > 0 && !gates.every((g) => deviceGates.includes(g))) {
    throw new HttpError(400, "BAD_REQUEST", "Unknown gate");
  }

  const validFrom = body.validFrom === undefined ? now : body.validFrom;
  const validUntil = body.validUntil === undefined ? now + 24 * 60 * 60 * 1000 : body.validUntil;
  if (
    typeof validFrom !== "number" ||
    typeof validUntil !== "number" ||
    !Number.isFinite(validFrom) ||
    !Number.isFinite(validUntil)
  ) {
    throw new HttpError(400, "BAD_REQUEST", "Invalid dates");
  }
  if (validUntil <= validFrom || validUntil <= now)
    throw new HttpError(400, "BAD_REQUEST", "The end must be in the future and after the start");
  if (validUntil - validFrom > MAX_INVITE_DURATION_MS)
    throw new HttpError(400, "BAD_REQUEST", "Invites can last 30 days at most");

  const requireProximity = body.requireProximity === undefined ? true : body.requireProximity;
  if (typeof requireProximity !== "boolean")
    throw new HttpError(400, "BAD_REQUEST", "requireProximity must be a boolean");

  let maxOpens: number | undefined;
  if (body.maxOpens !== undefined && body.maxOpens !== null) {
    if (
      typeof body.maxOpens !== "number" ||
      !Number.isInteger(body.maxOpens) ||
      body.maxOpens < 1 ||
      body.maxOpens > 1000
    ) {
      throw new HttpError(400, "BAD_REQUEST", "maxOpens must be 1..1000");
    }
    maxOpens = body.maxOpens;
  }
  return { label, gates, validFrom, validUntil, requireProximity, maxOpens };
}
