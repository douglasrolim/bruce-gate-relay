// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

/** Typed HTTP error: handlers throw it, the router turns it into a JSON response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}

export function errorResponse(err: HttpError): Response {
  return json({ ok: false, error: err.code, message: err.message, ...err.extra }, err.status);
}

/**
 * CSRF protection for mutating requests: JSON body and an Origin that matches the host.
 * Browsers always send Origin on cross-origin POSTs, and a JSON content-type forces a CORS preflight.
 */
export function assertSameOriginJson(req: Request): void {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");
  if (!origin || origin !== url.origin) throw new HttpError(403, "BAD_ORIGIN", "Cross-origin request blocked");
  const ct = req.headers.get("Content-Type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json");
  }
}

export async function readJson(req: Request, maxBytes = 8 * 1024): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE");
  try {
    const data: unknown = JSON.parse(text || "{}");
    if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "Invalid JSON body");
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP") ?? "unknown";
}
