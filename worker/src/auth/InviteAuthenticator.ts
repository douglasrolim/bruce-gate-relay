// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { AuthResult, Authenticator } from "./Authenticator";
import type { InviteRepository } from "../invites/InviteRepository";
import { inviteStatus } from "../invites/InviteRepository";

/**
 * Authenticates party guests with an invite token sent as `Authorization: Bearer <token>`.
 * Only the token's SHA-256 hash is stored, so the token itself never touches storage or logs.
 */
export class InviteAuthenticator implements Authenticator {
  readonly name = "invite";

  constructor(
    private readonly invites: InviteRepository,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async authenticate(req: Request): Promise<AuthResult> {
    const header = req.headers.get("Authorization") ?? "";
    const match = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(header);
    if (!match) return { ok: false, reason: "MISSING_CREDENTIALS" };

    const invite = await this.invites.findByToken(match[1]!);
    if (!invite) return { ok: false, reason: "INVALID_CREDENTIALS" };

    const status = inviteStatus(invite, this.now());
    if (status === "expired" || status === "exhausted") return { ok: false, reason: "EXPIRED" };
    if (status !== "active") return { ok: false, reason: "INVALID_CREDENTIALS" };

    return {
      ok: true,
      identity: { subject: invite.id, provider: this.name, label: invite.label },
    };
  }
}
