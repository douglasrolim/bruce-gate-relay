// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { Env } from "./env";
import { json } from "./http/http";
import { serveStatic } from "./ui/assets";
import { isAuthorizedDevice } from "./security/deviceAuth";

export { GateHub } from "./hub/GateHub";

function hub(env: Env): DurableObjectStub {
  return env.GATE_HUB.get(env.GATE_HUB.idFromName("main"));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/device") {
      if (!isAuthorizedDevice(req, env.DEVICE_TOKEN)) return json({ ok: false, error: "UNAUTHENTICATED" }, 401);
      return hub(env).fetch(req);
    }

    if (url.pathname.startsWith("/api/")) return hub(env).fetch(req);

    const asset = serveStatic(req);
    if (asset) return asset;

    return json({ ok: false, error: "NOT_FOUND" }, 404);
  },
} satisfies ExportedHandler<Env>;
