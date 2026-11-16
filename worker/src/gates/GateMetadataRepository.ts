// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { KeyValueStore } from "../storage/KeyValueStore";

export interface GateMetadata {
  gate: string;
  lat?: number;
  lng?: number;
  radiusM: number;
  requireProximity: boolean;
  label?: string;
  /** Emoji-free icon key used by the UI: "car", "building", "home", "gate", "door". */
  icon?: string;
  updatedBy: string;
  updatedAt: number;
}

export const DEFAULT_RADIUS_M = 500;
export const MIN_RADIUS_M = 100;
export const MAX_RADIUS_M = 2000;
export const GATE_ICONS = ["gate", "car", "home", "building", "door", "tree"] as const;

export interface GateMetadataRepository {
  get(gate: string): Promise<GateMetadata | undefined>;
  list(): Promise<GateMetadata[]>;
  upsert(meta: GateMetadata): Promise<void>;
  delete(gate: string): Promise<boolean>;
}

export class StoredGateMetadataRepository implements GateMetadataRepository {
  constructor(private readonly store: KeyValueStore) {}

  get(gate: string): Promise<GateMetadata | undefined> {
    return this.store.get<GateMetadata>(`gate:${gate}`);
  }
  async list(): Promise<GateMetadata[]> {
    return [...(await this.store.list<GateMetadata>("gate:")).values()];
  }
  upsert(meta: GateMetadata): Promise<void> {
    return this.store.put(`gate:${meta.gate}`, meta);
  }
  delete(gate: string): Promise<boolean> {
    return this.store.delete(`gate:${gate}`);
  }
}

/** Metadata entries whose gate is no longer announced by the device (e.g. a renamed .sub). */
export function findOrphans(metadata: GateMetadata[], deviceGates: readonly string[]): GateMetadata[] {
  const known = new Set(deviceGates);
  return metadata.filter((m) => !known.has(m.gate));
}
