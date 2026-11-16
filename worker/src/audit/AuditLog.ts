// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { KeyValueStore } from "../storage/KeyValueStore";

export interface AuditEntry {
  ts: number;
  /** Email for people, invite label for guests. */
  who: string;
  provider: string;
  ip: string;
  gate: string;
  ok: boolean;
  error?: string;
  /** Rounded distance to the gate when location was checked. Raw coordinates are never stored. */
  distanceM?: number;
}

export interface AuditLog {
  append(entry: AuditEntry): Promise<void>;
  recent(limit?: number): Promise<AuditEntry[]>;
}

export const AUDIT_CAPACITY = 200;

/** Ring buffer of the most recent opens, stored as a single value (small and bounded). */
export class StoredAuditLog implements AuditLog {
  private static readonly KEY = "audit";

  constructor(
    private readonly store: KeyValueStore,
    private readonly capacity = AUDIT_CAPACITY,
  ) {}

  async append(entry: AuditEntry): Promise<void> {
    const entries = (await this.store.get<AuditEntry[]>(StoredAuditLog.KEY)) ?? [];
    entries.unshift(entry);
    await this.store.put(StoredAuditLog.KEY, entries.slice(0, this.capacity));
  }

  async recent(limit = this.capacity): Promise<AuditEntry[]> {
    const entries = (await this.store.get<AuditEntry[]>(StoredAuditLog.KEY)) ?? [];
    return entries.slice(0, limit);
  }
}
