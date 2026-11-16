// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

// Shared by the Worker and the browser client: keep it dependency-free.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Position extends LatLng {
  /** Reported accuracy radius in meters. */
  accuracy: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in meters (haversine). */
export function haversineM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Client-side rule: the gate is "nearby" when it may be inside the radius given the GPS accuracy. */
export function isNearby(distanceM: number, accuracyM: number, radiusM: number): boolean {
  return distanceM - accuracyM <= radiusM;
}

/** Server-side rule: accuracy credit is capped so a vague fix cannot unlock a far-away gate. */
export const MAX_ACCURACY_CREDIT_M = 100;

export type ProximityCheck =
  { ok: true; distanceM: number } | { ok: false; error: "LOCATION_REQUIRED" | "TOO_FAR"; distanceM?: number };

export function checkProximity(gate: LatLng & { radiusM: number }, pos: Position | undefined): ProximityCheck {
  if (!pos) return { ok: false, error: "LOCATION_REQUIRED" };
  const distanceM = haversineM(gate, pos);
  const credit = Math.min(Math.max(pos.accuracy, 0), MAX_ACCURACY_CREDIT_M);
  if (distanceM - credit > gate.radiusM) return { ok: false, error: "TOO_FAR", distanceM };
  return { ok: true, distanceM };
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Parses "-23.55, -46.63" (as copied from Google Maps). Returns null when invalid. */
export function parseLatLng(text: string): LatLng | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
}

/** Rounds a distance for display/audit so exact positions are never stored. */
export function roundDistance(m: number): number {
  if (m < 100) return Math.round(m / 10) * 10;
  if (m < 1000) return Math.round(m / 50) * 50;
  return Math.round(m / 100) * 100;
}
