// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import type { PositionPayload } from "./api";
import { store } from "./storage";

export type LocationState = "idle" | "explain" | "locating" | "ok" | "denied" | "unavailable";

type Listener = (state: LocationState, pos: PositionPayload | null) => void;

const DISMISS_KEY = "loc-explainer-dismissed";
const ASKED_KEY = "loc-asked";

/**
 * Watches the phone's position while the page is visible. Never prompts without
 * context: the first time, the UI shows an explanation card and calls `request()`.
 * Positions stay on the device; they are only sent when opening a proximity-locked gate.
 */
export class LocationService {
  state: LocationState = "idle";
  position: PositionPayload | null = null;
  private watchId: number | null = null;
  private listeners = new Set<Listener>();

  constructor() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop();
      else if (this.state === "ok" || this.state === "locating") this.start();
    });
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(state: LocationState): void {
    this.state = state;
    for (const fn of this.listeners) fn(state, this.position);
  }

  /** Decides whether to start silently (already granted), explain first, or stay quiet. */
  async init(): Promise<void> {
    if (!("geolocation" in navigator)) return this.set("unavailable");
    let permission: PermissionState | "unknown" = "unknown";
    try {
      permission = (await navigator.permissions.query({ name: "geolocation" })).state;
    } catch {
      /* Safari < 16 */
    }
    if (permission === "granted" || (permission === "unknown" && store.get(ASKED_KEY) === "1")) {
      this.start();
    } else if (permission === "denied") {
      this.set("denied");
    } else if (store.get(DISMISS_KEY) !== "1") {
      this.set("explain");
    }
  }

  dismissExplainer(): void {
    store.set(DISMISS_KEY, "1");
    this.set("idle");
  }

  request(): void {
    store.set(ASKED_KEY, "1");
    this.start();
  }

  /** One-off high-accuracy fix (admin "Use my current location"). */
  current(timeoutMs = 20_000): Promise<PositionPayload> {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new Error("unavailable"));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
      );
    });
  }

  private start(): void {
    if (this.watchId !== null || !("geolocation" in navigator)) return;
    if (this.state !== "ok") this.set("locating");
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        this.position = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        this.set("ok");
      },
      (err) => {
        this.stop();
        this.set(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 },
    );
  }

  private stop(): void {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}
