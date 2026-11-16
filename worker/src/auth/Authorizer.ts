// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { Identity } from "./Authenticator";
import type { InviteRepository } from "../invites/InviteRepository";

/** Authorization: what an authenticated identity may do. Kept separate from authentication. */
export interface Authorizer {
  canUseApp(identity: Identity): Promise<boolean>;
  isAdmin(identity: Identity): Promise<boolean>;
  /** Filters `gates` down to the ones this identity may open. */
  allowedGates(identity: Identity, gates: readonly string[]): Promise<string[]>;
}

export interface EmailPolicyConfig {
  allowedEmails: string[];
  adminEmails: string[];
  /** email (or "*") -> gate names. Missing map means every allowed user may open every gate. */
  gatePermissions?: Record<string, string[]>;
}

export function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/** Parses GATE_PERMISSIONS. Invalid JSON fails closed (nobody gets any gate). */
export function parseGatePermissions(raw: string | undefined): Record<string, string[]> | undefined | null {
  if (!raw || !raw.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!Array.isArray(v) || !v.every((g) => typeof g === "string")) return null;
      out[k.toLowerCase()] = v as string[];
    }
    return out;
  } catch {
    return null;
  }
}

/** Second layer behind Cloudflare Access: email allowlist, admins and optional per-gate permissions. */
export class EmailAuthorizer implements Authorizer {
  private readonly allowed: Set<string>;
  private readonly admins: Set<string>;

  /** `gatePermissions === null` means the config was invalid: deny every gate. */
  constructor(
    config: EmailPolicyConfig,
    private readonly gatePermissions: Record<string, string[]> | undefined | null = config.gatePermissions,
  ) {
    this.allowed = new Set(config.allowedEmails.map((e) => e.toLowerCase()));
    this.admins = new Set(config.adminEmails.map((e) => e.toLowerCase()));
  }

  async canUseApp(identity: Identity): Promise<boolean> {
    const email = identity.email?.toLowerCase();
    if (!email || identity.provider === "invite") return false;
    return this.allowed.has(email) || this.admins.has(email);
  }

  async isAdmin(identity: Identity): Promise<boolean> {
    const email = identity.email?.toLowerCase();
    return !!email && identity.provider !== "invite" && this.admins.has(email);
  }

  async allowedGates(identity: Identity, gates: readonly string[]): Promise<string[]> {
    if (!(await this.canUseApp(identity))) return [];
    if (await this.isAdmin(identity)) return [...gates];
    if (this.gatePermissions === null) return [];
    if (this.gatePermissions === undefined) return [...gates];
    const email = identity.email!.toLowerCase();
    const permitted = this.gatePermissions[email] ?? this.gatePermissions["*"] ?? [];
    return gates.filter((g) => permitted.includes(g));
  }
}

/** Guests: only the gates listed in their (active) invite. Never admins. */
export class InviteAuthorizer implements Authorizer {
  constructor(private readonly invites: InviteRepository) {}

  async canUseApp(identity: Identity): Promise<boolean> {
    return identity.provider === "invite";
  }
  async isAdmin(): Promise<boolean> {
    return false;
  }
  async allowedGates(identity: Identity, gates: readonly string[]): Promise<string[]> {
    if (identity.provider !== "invite") return [];
    const invite = await this.invites.get(identity.subject);
    if (!invite) return [];
    return gates.filter((g) => invite.gates.includes(g));
  }
}

/** Routes each identity to the authorizer for its provider. */
export class CompositeAuthorizer implements Authorizer {
  constructor(
    private readonly people: Authorizer,
    private readonly guests: Authorizer,
  ) {}

  private pick(identity: Identity): Authorizer {
    return identity.provider === "invite" ? this.guests : this.people;
  }
  canUseApp(identity: Identity): Promise<boolean> {
    return this.pick(identity).canUseApp(identity);
  }
  isAdmin(identity: Identity): Promise<boolean> {
    return this.pick(identity).isAdmin(identity);
  }
  allowedGates(identity: Identity, gates: readonly string[]): Promise<string[]> {
    return this.pick(identity).allowedGates(identity, gates);
  }
}
