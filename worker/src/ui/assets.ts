// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { SECURITY_HEADERS } from "../http/http";
import { APP_ICON_SVG, BUILD_ID, CLIENT_CSS, CLIENT_JS, PNG_ICONS } from "./generated/bundle";

export type AppMode = "user" | "guest";
export type UiLang = "en" | "pt";

/** Picks Portuguese or English from Accept-Language (the client re-detects from navigator.languages). */
export function langFromHeader(header: string | null): UiLang {
  for (const part of (header ?? "").split(",")) {
    const code = part.trim().toLowerCase();
    if (code.startsWith("pt")) return "pt";
    if (code.startsWith("en")) return "en";
  }
  return "en";
}

const APP_NAME: Record<UiLang, string> = { en: "Gates", pt: "Portões" };

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function renderShell(mode: AppMode, lang: UiLang = "en"): string {
  const name = APP_NAME[lang];
  const manifest = mode === "guest" ? "/guest.webmanifest" : "/manifest.webmanifest";
  return `<!doctype html>
<html lang="${lang === "pt" ? "pt-BR" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f3f4f7">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0d12">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${name}">
<meta name="robots" content="noindex, nofollow">
<title>${name}</title>
<link rel="manifest" href="${manifest}">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="stylesheet" href="/assets/app.css?v=${BUILD_ID}">
<script type="module" src="/assets/app.js?v=${BUILD_ID}"></script>
</head>
<body data-mode="${mode}">
<div id="app" aria-busy="true"><div class="boot"><div class="boot-logo"></div></div></div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<noscript><p class="noscript">${lang === "pt" ? "Este app precisa de JavaScript." : "This app needs JavaScript."}</p></noscript>
</body>
</html>`;
}

export function renderManifest(mode: AppMode, lang: UiLang = "en"): string {
  const user = mode === "user";
  const name = APP_NAME[lang];
  return JSON.stringify({
    name: user ? name : `${name} (${lang === "pt" ? "convidado" : "guest"})`,
    short_name: name,
    lang: lang === "pt" ? "pt-BR" : "en",
    description: lang === "pt" ? "Abra seus portões pelo celular." : "Open your gates from your phone.",
    id: user ? "/" : "/guest",
    start_url: user ? "/" : "/guest",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    icons: [
      { src: "/assets/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/assets/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/assets/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  });
}

/** Minimal service worker: caches the app shell only; never touches /api/*. */
export function renderServiceWorker(): string {
  return `// bruce-gate-relay service worker (${BUILD_ID})
const CACHE = "shell-${BUILD_ID}";
const ASSETS = ["/assets/app.css?v=${BUILD_ID}", "/assets/app.js?v=${BUILD_ID}", "/assets/icon.svg"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const cacheable = (res) => res && res.ok && res.type === "basic" && !res.redirected;
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/device") return;
  if (e.request.mode === "navigate") {
    // Network first: Cloudflare Access may need to redirect to the login page.
    e.respondWith(fetch(e.request).then((res) => {
      if (cacheable(res)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)); }
      return res;
    }).catch(() => caches.match(url.pathname).then((r) => r || caches.match("/"))));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (cacheable(res)) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
  }
});
`;
}

function respond(body: BodyInit, type: string, cache: string, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    headers: { "Content-Type": type, "Cache-Control": cache, ...SECURITY_HEADERS, ...extra },
  });
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=3600";

/** Serves the app shell and static assets. Returns null for anything else. */
export function serveStatic(req: Request): Response | null {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const { pathname, searchParams } = new URL(req.url);
  const versioned = searchParams.get("v") === BUILD_ID;
  const lang = langFromHeader(req.headers.get("Accept-Language"));
  const html = (mode: AppMode) =>
    respond(renderShell(mode, lang), "text/html; charset=utf-8", "no-store", {
      "Content-Security-Policy": CSP,
      Vary: "Accept-Language",
    });

  if (pathname === "/" || pathname === "/admin" || pathname === "/activity") return html("user");
  if (pathname === "/guest" || /^\/i\/[A-Za-z0-9_-]{16,128}$/.test(pathname)) return html("guest");

  switch (pathname) {
    case "/assets/app.js":
      return respond(CLIENT_JS, "text/javascript; charset=utf-8", versioned ? IMMUTABLE : "no-cache");
    case "/assets/app.css":
      return respond(CLIENT_CSS, "text/css; charset=utf-8", versioned ? IMMUTABLE : "no-cache");
    case "/assets/icon.svg":
      return respond(APP_ICON_SVG, "image/svg+xml", SHORT);
    case "/manifest.webmanifest":
      return respond(renderManifest("user", lang), "application/manifest+json", SHORT, { Vary: "Accept-Language" });
    case "/guest.webmanifest":
      return respond(renderManifest("guest", lang), "application/manifest+json", SHORT, { Vary: "Accept-Language" });
    case "/sw.js":
      return respond(renderServiceWorker(), "text/javascript; charset=utf-8", "no-cache", {
        "Service-Worker-Allowed": "/",
      });
  }

  const png = /^\/assets\/([a-z0-9-]+)\.png$/.exec(pathname);
  if (png && PNG_ICONS[png[1]!]) return respond(base64ToBytes(PNG_ICONS[png[1]!]!), "image/png", SHORT);

  return null;
}
