// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { Env } from "../env";
import { FirstMatchAuthenticator, type Authenticator } from "./Authenticator";
import { CloudflareAccessAuthenticator, HttpJwksProvider, type JwksProvider } from "./CloudflareAccessAuthenticator";
import { DevAuthenticator } from "./DevAuthenticator";

export const SUPPORTED_AUTH_MODES = ["cloudflare-access"] as const;

let sharedJwks: { team: string; provider: HttpJwksProvider } | null = null;

/**
 * Builds the authenticator for signed-in users from `AUTH_MODES`.
 * Unknown modes are a configuration error (fail closed).
 */
export function createUserAuthenticator(env: Env, jwks?: JwksProvider): Authenticator {
  const modes = (env.AUTH_MODES ?? "cloudflare-access")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const authenticators: Authenticator[] = [];

  // Development identity first, so `wrangler dev` works without Access.
  if (env.ENVIRONMENT === "development") {
    authenticators.push(new DevAuthenticator(env.ENVIRONMENT, env.DEV_USER_EMAIL ?? "dev@example.com"));
  }

  for (const mode of modes) {
    switch (mode) {
      case "cloudflare-access": {
        const team = env.ACCESS_TEAM_DOMAIN ?? "";
        authenticators.push(new CloudflareAccessAuthenticator(team, env.ACCESS_AUD ?? "", jwks ?? getSharedJwks(team)));
        break;
      }
      default:
        throw new Error(`Unsupported auth mode: ${mode}`);
    }
  }
  return new FirstMatchAuthenticator(authenticators);
}

function getSharedJwks(team: string): HttpJwksProvider {
  if (!sharedJwks || sharedJwks.team !== team) {
    sharedJwks = { team, provider: new HttpJwksProvider(team) };
  }
  return sharedJwks.provider;
}
