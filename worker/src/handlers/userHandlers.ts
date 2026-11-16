// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { assertSameOriginJson, clientIp, json, readJson } from "../http/http";
import type { Router } from "../http/router";
import { USER_POLICY } from "../security/RateLimiter";
import { gateViews, requireUser, type AppServices } from "./context";

export function registerUserRoutes(router: Router, s: AppServices): void {
  router.on("GET", "/api/me", async (req) => {
    const identity = await requireUser(s, req);
    return json({
      email: identity.email,
      provider: identity.provider,
      isAdmin: await s.authorizer.isAdmin(identity),
    });
  });

  router.on("GET", "/api/status", async (req) => {
    const identity = await requireUser(s, req);
    const st = s.gateway.status();
    return json({
      online: st.online,
      lastSeen: st.lastSeen ?? null,
      fw: st.fw ?? null,
      gates: await s.authorizer.allowedGates(identity, st.gates),
    });
  });

  router.on("GET", "/api/gates", async (req) => {
    const identity = await requireUser(s, req);
    const st = s.gateway.status();
    const names = await s.authorizer.allowedGates(identity, st.gates);
    return json({ online: st.online, lastSeen: st.lastSeen ?? null, gates: await gateViews(s, names) });
  });

  router.on("POST", "/api/open", async (req) => {
    assertSameOriginJson(req);
    const identity = await requireUser(s, req);
    const body = await readJson(req);
    const result = await s.openGate.open({
      identity,
      gate: body.gate,
      position: typeof body.position === "object" && body.position ? (body.position as never) : undefined,
      ip: clientIp(req),
      policy: USER_POLICY,
    });
    return json(result);
  });

  router.on("GET", "/api/log", async (req) => {
    const identity = await requireUser(s, req);
    const isAdmin = await s.authorizer.isAdmin(identity);
    const entries = await s.audit.recent(isAdmin ? 200 : 50);
    // IP addresses are personal data: only admins see them.
    return json({ entries: isAdmin ? entries : entries.map(({ ip: _ip, ...rest }) => rest) });
  });
}
