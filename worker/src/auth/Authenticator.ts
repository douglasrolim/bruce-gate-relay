// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

/** Who is making the request. Authentication only: what they may do is decided by an Authorizer. */
export interface Identity {
  /** Stable identifier: the email for people, the invite id for guests. */
  subject: string;
  email?: string;
  /** Which authenticator produced this identity, e.g. "cloudflare-access", "invite", "dev". */
  provider: string;
  /** Human-readable label (invite label for guests). */
  label?: string;
}

export type AuthFailureReason = "MISSING_CREDENTIALS" | "INVALID_CREDENTIALS" | "EXPIRED" | "MISCONFIGURED";

export type AuthResult = { ok: true; identity: Identity } | { ok: false; reason: AuthFailureReason };

/**
 * Strategy interface for authentication. Contract shared by every implementation:
 * - resolves to an identity or a typed failure;
 * - never throws for bad, missing or expired credentials.
 */
export interface Authenticator {
  readonly name: string;
  authenticate(req: Request): Promise<AuthResult>;
}

/** Tries several authenticators in order and returns the first success (any-of semantics). */
export class FirstMatchAuthenticator implements Authenticator {
  readonly name: string;

  constructor(private readonly authenticators: readonly Authenticator[]) {
    this.name = authenticators.map((a) => a.name).join(",");
  }

  async authenticate(req: Request): Promise<AuthResult> {
    let last: AuthResult = { ok: false, reason: "MISSING_CREDENTIALS" };
    for (const auth of this.authenticators) {
      const result = await auth.authenticate(req);
      if (result.ok) return result;
      // Prefer the most informative failure over "missing".
      if (last.ok || last.reason === "MISSING_CREDENTIALS") last = result;
    }
    return last;
  }
}
