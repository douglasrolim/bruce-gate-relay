// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { KeyValueStore } from "../storage/KeyValueStore";
import { randomToken, sha256Hex } from "../util/base64url";

export interface Invite {
  id: string;
  tokenHash: string;
  label: string;
  gates: string[];
  validFrom: number;
  validUntil: number;
  requireProximity: boolean;
  maxOpens?: number;
  opens: number;
  createdBy: string;
  createdAt: number;
  revoked: boolean;
}

export type InviteStatus = "scheduled" | "active" | "expired" | "exhausted" | "revoked";

export function inviteStatus(invite: Invite, now: number): InviteStatus {
  if (invite.revoked) return "revoked";
  if (now < invite.validFrom) return "scheduled";
  if (now >= invite.validUntil) return "expired";
  if (invite.maxOpens !== undefined && invite.opens >= invite.maxOpens) return "exhausted";
  return "active";
}

export interface NewInvite {
  label: string;
  gates: string[];
  validFrom: number;
  validUntil: number;
  requireProximity: boolean;
  maxOpens?: number;
  createdBy: string;
}

export interface InviteRepository {
  /** Creates an invite and returns it together with the one-time plaintext token. */
  create(input: NewInvite): Promise<{ invite: Invite; token: string }>;
  findByToken(token: string): Promise<Invite | undefined>;
  get(id: string): Promise<Invite | undefined>;
  list(): Promise<Invite[]>;
  revoke(id: string): Promise<boolean>;
  recordOpen(id: string): Promise<void>;
}

/** Stores invites in the hub's key-value storage. Only the SHA-256 of the token is persisted. */
export class StoredInviteRepository implements InviteRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async create(input: NewInvite): Promise<{ invite: Invite; token: string }> {
    const token = randomToken(24); // 192 bits
    const tokenHash = await sha256Hex(token);
    const invite: Invite = {
      id: crypto.randomUUID(),
      tokenHash,
      ...input,
      opens: 0,
      createdAt: this.now(),
      revoked: false,
    };
    await this.store.put(`invite:${invite.id}`, invite);
    await this.store.put(`invite-token:${tokenHash}`, invite.id);
    return { invite, token };
  }

  async findByToken(token: string): Promise<Invite | undefined> {
    const id = await this.store.get<string>(`invite-token:${await sha256Hex(token)}`);
    return id ? this.get(id) : undefined;
  }

  get(id: string): Promise<Invite | undefined> {
    return this.store.get<Invite>(`invite:${id}`);
  }

  async list(): Promise<Invite[]> {
    const all = await this.store.list<Invite>("invite:");
    return [...all.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  async revoke(id: string): Promise<boolean> {
    const invite = await this.get(id);
    if (!invite) return false;
    invite.revoked = true;
    await this.store.put(`invite:${id}`, invite);
    return true;
  }

  async recordOpen(id: string): Promise<void> {
    const invite = await this.get(id);
    if (!invite) return;
    invite.opens += 1;
    await this.store.put(`invite:${id}`, invite);
  }
}
