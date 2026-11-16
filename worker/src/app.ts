// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { Env } from "./env";
import type { Authenticator } from "./auth/Authenticator";
import {
  CompositeAuthorizer,
  EmailAuthorizer,
  InviteAuthorizer,
  parseEmailList,
  parseGatePermissions,
} from "./auth/Authorizer";
import { createUserAuthenticator } from "./auth/createAuthenticator";
import { InviteAuthenticator } from "./auth/InviteAuthenticator";
import { StoredAuditLog } from "./audit/AuditLog";
import type { GateGateway } from "./device/DeviceSession";
import { StoredGateMetadataRepository } from "./gates/GateMetadataRepository";
import { registerAdminRoutes } from "./handlers/adminHandlers";
import type { AppServices } from "./handlers/context";
import { registerGuestRoutes } from "./handlers/guestHandlers";
import { registerUserRoutes } from "./handlers/userHandlers";
import { Router } from "./http/router";
import { StoredInviteRepository } from "./invites/InviteRepository";
import { StoredRateLimiter } from "./security/RateLimiter";
import { OpenGateService } from "./services/OpenGateService";
import type { KeyValueStore } from "./storage/KeyValueStore";

export interface AppOptions {
  env: Env;
  store: KeyValueStore;
  gateway: GateGateway;
  now?: () => number;
  /** Overrides for tests. */
  userAuth?: Authenticator;
}

/** Composition root: wires concrete implementations behind the interfaces the handlers use. */
export function createApp(opts: AppOptions): { router: Router; services: AppServices } {
  const now = opts.now ?? (() => Date.now());
  const { env, store, gateway } = opts;

  const invites = new StoredInviteRepository(store, now);
  const gateMeta = new StoredGateMetadataRepository(store);
  const audit = new StoredAuditLog(store);
  const rateLimiter = new StoredRateLimiter(store, now);

  const authorizer = new CompositeAuthorizer(
    new EmailAuthorizer(
      { allowedEmails: parseEmailList(env.ALLOWED_EMAILS), adminEmails: parseEmailList(env.ADMIN_EMAILS) },
      parseGatePermissions(env.GATE_PERMISSIONS),
    ),
    new InviteAuthorizer(invites),
  );

  const services: AppServices = {
    userAuth: opts.userAuth ?? createUserAuthenticator(env),
    guestAuth: new InviteAuthenticator(invites, now),
    authorizer,
    gateway,
    audit,
    gateMeta,
    invites,
    now,
    openGate: new OpenGateService({ authorizer, gateway, rateLimiter, audit, gateMeta, invites, now }),
  };

  const router = new Router();
  registerUserRoutes(router, services);
  registerAdminRoutes(router, services);
  registerGuestRoutes(router, services);
  return { router, services };
}
