// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

/** Bindings and configuration injected by the Workers runtime (see wrangler.toml.example). */
export interface Env {
  GATE_HUB: DurableObjectNamespace;

  /** "production" (default) or "development". The dev authenticator only works in "development". */
  ENVIRONMENT?: string;
  /** Comma-separated list of auth modes. v1: "cloudflare-access". */
  AUTH_MODES?: string;

  /** Cloudflare Access team domain, e.g. "myteam.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access application audience (AUD) tag. */
  ACCESS_AUD?: string;

  /** Comma-separated list of emails allowed to use the app ("*" is not supported on purpose). */
  ALLOWED_EMAILS?: string;
  /** Comma-separated list of admin emails (admins are always allowed). */
  ADMIN_EMAILS?: string;
  /** Optional JSON map of email -> gate names, e.g. {"bob@x.com":["Garage"],"*":["Garage","Main"]}. */
  GATE_PERMISSIONS?: string;

  /** Secret shared with the device (wrangler secret put DEVICE_TOKEN). */
  DEVICE_TOKEN?: string;

  /** Identity faked by the dev authenticator (development only). */
  DEV_USER_EMAIL?: string;
}
