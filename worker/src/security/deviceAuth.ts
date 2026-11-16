// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { timingSafeEqual } from "../util/base64url";

/** Minimum DEVICE_TOKEN length; shorter (or missing) tokens fail closed. */
export const MIN_DEVICE_TOKEN_LENGTH = 32;

/** Extracts the device token from `Authorization: Bearer` (preferred) or `?token=` (fallback). */
export function deviceTokenFrom(req: Request): string | null {
  const header = req.headers.get("Authorization");
  const m = header ? /^Bearer (.+)$/.exec(header) : null;
  if (m) return m[1]!.trim();
  return new URL(req.url).searchParams.get("token");
}

/** Constant-time check of the device's bearer secret against DEVICE_TOKEN. */
export function isAuthorizedDevice(req: Request, expected: string | undefined): boolean {
  if (!expected || expected.length < MIN_DEVICE_TOKEN_LENGTH) return false;
  const given = deviceTokenFrom(req);
  return given !== null && timingSafeEqual(given, expected);
}
