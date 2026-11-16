// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { AuthResult, Authenticator } from "./Authenticator";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Fakes a signed-in user for local development with `wrangler dev`.
 *
 * Two independent guards keep it out of production:
 *  1. `createAuthenticator` only builds it when ENVIRONMENT === "development";
 *  2. it refuses any request whose host is not localhost.
 */
export class DevAuthenticator implements Authenticator {
  readonly name = "dev";

  constructor(
    private readonly environment: string | undefined,
    private readonly email: string,
  ) {}

  async authenticate(req: Request): Promise<AuthResult> {
    if (this.environment !== "development") return { ok: false, reason: "MISCONFIGURED" };
    const host = new URL(req.url).hostname;
    if (!LOCAL_HOSTS.has(host)) return { ok: false, reason: "MISCONFIGURED" };
    // Allow switching users locally: X-Dev-User: bob@example.com
    const email = (req.headers.get("X-Dev-User") ?? this.email).toLowerCase();
    return { ok: true, identity: { subject: email, email, provider: this.name } };
  }
}
