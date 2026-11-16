// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { HttpError, assertSameOriginJson, clientIp, json, readJson } from "../http/http";
import type { Router } from "../http/router";
import { GUEST_POLICY } from "../security/RateLimiter";
import { gateViews, requireGuest, type AppServices } from "./context";

/** Guest routes are reachable without Cloudflare Access (Bypass policy); the invite token is the only key. */
export function registerGuestRoutes(router: Router, s: AppServices): void {
  router.on("GET", "/api/guest/gates", async (req) => {
    const identity = await requireGuest(s, req);
    const invite = await s.invites.get(identity.subject);
    if (!invite) throw new HttpError(401, "INVITE_INVALID");
    const st = s.gateway.status();
    const names = await s.authorizer.allowedGates(identity, st.online ? st.gates : invite.gates);
    return json({
      online: st.online,
      label: invite.label,
      validUntil: invite.validUntil,
      opensLeft: invite.maxOpens !== undefined ? Math.max(0, invite.maxOpens - invite.opens) : null,
      gates: await gateViews(s, names, invite.requireProximity),
    });
  });

  router.on("POST", "/api/guest/open", async (req) => {
    assertSameOriginJson(req);
    const identity = await requireGuest(s, req);
    const invite = await s.invites.get(identity.subject);
    if (!invite) throw new HttpError(401, "INVITE_INVALID");
    const body = await readJson(req);
    const result = await s.openGate.open({
      identity,
      gate: body.gate,
      position: typeof body.position === "object" && body.position ? (body.position as never) : undefined,
      ip: clientIp(req),
      policy: GUEST_POLICY,
      forceProximity: invite.requireProximity,
    });
    return json(result);
  });
}
