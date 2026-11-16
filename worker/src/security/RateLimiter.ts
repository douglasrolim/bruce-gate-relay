// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { KeyValueStore } from "../storage/KeyValueStore";

export interface RatePolicy {
  /** Minimum time between two opens of the same gate (any user). */
  gateCooldownMs: number;
  /** Minimum time between two opens by the same subject. */
  subjectCooldownMs: number;
  /** Maximum opens per subject in `windowMs`. */
  maxPerWindow: number;
  windowMs: number;
}

export const USER_POLICY: RatePolicy = {
  gateCooldownMs: 3_000,
  subjectCooldownMs: 0,
  maxPerWindow: 20,
  windowMs: 60 * 60 * 1000,
};

export const GUEST_POLICY: RatePolicy = {
  gateCooldownMs: 3_000,
  subjectCooldownMs: 5_000,
  maxPerWindow: 60,
  windowMs: 60 * 60 * 1000,
};

export type RateDecision = { ok: true } | { ok: false; error: "COOLDOWN" | "RATE_LIMITED"; retryAfterS: number };

export interface RateLimiter {
  /** Checks the limits and, when allowed, records the attempt atomically. */
  consume(subject: string, gate: string, policy: RatePolicy): Promise<RateDecision>;
}

/**
 * Sliding-window limiter persisted in Durable Object storage. The hub processes
 * requests one at a time per input gate, so read-modify-write is safe here.
 */
export class StoredRateLimiter implements RateLimiter {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async consume(subject: string, gate: string, policy: RatePolicy): Promise<RateDecision> {
    const now = this.now();

    const gateKey = `rl-gate:${gate}`;
    const lastGate = (await this.store.get<number>(gateKey)) ?? 0;
    if (now - lastGate < policy.gateCooldownMs) {
      return {
        ok: false,
        error: "COOLDOWN",
        retryAfterS: Math.ceil((policy.gateCooldownMs - (now - lastGate)) / 1000),
      };
    }

    const subjectKey = `rl-subject:${subject}`;
    const history = ((await this.store.get<number[]>(subjectKey)) ?? []).filter((t) => now - t < policy.windowMs);

    const lastSubject = history.length ? Math.max(...history) : 0;
    if (policy.subjectCooldownMs > 0 && now - lastSubject < policy.subjectCooldownMs) {
      return {
        ok: false,
        error: "COOLDOWN",
        retryAfterS: Math.ceil((policy.subjectCooldownMs - (now - lastSubject)) / 1000),
      };
    }
    if (history.length >= policy.maxPerWindow) {
      const oldest = Math.min(...history);
      return { ok: false, error: "RATE_LIMITED", retryAfterS: Math.ceil((policy.windowMs - (now - oldest)) / 1000) };
    }

    history.push(now);
    await this.store.put(subjectKey, history);
    await this.store.put(gateKey, now);
    return { ok: true };
  }
}
