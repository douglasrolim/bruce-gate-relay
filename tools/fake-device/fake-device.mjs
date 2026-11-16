#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

// Simulates the T-Embed: connects to the Worker over WebSocket, announces gates,
// answers pings and "transmits" gates. Use it with `wrangler dev` or a deployed Worker.
//
//   node tools/fake-device/fake-device.mjs --url ws://localhost:8787/device --token <DEVICE_TOKEN>
//
// Options:
//   --url <ws(s)://host/device>   Worker device endpoint (default ws://localhost:8787/device)
//   --token <secret>              DEVICE_TOKEN (or env DEVICE_TOKEN)
//   --gates "Garage,Main"         gate names to announce (default "Garage,Main Entrance")
//   --mode ok|fail|timeout|malformed   how to answer "open" (default ok)
//   --delay <ms>                  simulated transmit time (default 700)
//   --access-id/--access-secret   Cloudflare Access service token (or env CF_ACCESS_CLIENT_ID/SECRET)
//   --query-token                 send the token as ?token= instead of a header
// Requires Node.js 22+ (global WebSocket).

import { parseArgs } from "node:util";

const { values: opt } = parseArgs({
  options: {
    url: { type: "string", default: "ws://localhost:8787/device" },
    token: { type: "string", default: process.env.DEVICE_TOKEN ?? "" },
    gates: { type: "string", default: "Garage,Main Entrance" },
    mode: { type: "string", default: "ok" },
    delay: { type: "string", default: "700" },
    "access-id": { type: "string", default: process.env.CF_ACCESS_CLIENT_ID ?? "" },
    "access-secret": { type: "string", default: process.env.CF_ACCESS_CLIENT_SECRET ?? "" },
    "query-token": { type: "boolean", default: false },
  },
});

if (typeof WebSocket === "undefined") {
  console.error("This script needs Node.js 22 or newer (global WebSocket).");
  process.exit(1);
}
if (!opt.token) {
  console.error("Missing --token (or DEVICE_TOKEN env var).");
  process.exit(1);
}

const gates = opt.gates.split(",").map((g) => g.trim()).filter(Boolean);
const delay = Number(opt.delay);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let backoff = 2000;

function connect() {
  const url = new URL(opt.url);
  const headers = {};
  if (opt["query-token"]) url.searchParams.set("token", opt.token);
  else headers.Authorization = `Bearer ${opt.token}`;
  if (opt["access-id"]) {
    headers["CF-Access-Client-Id"] = opt["access-id"];
    headers["CF-Access-Client-Secret"] = opt["access-secret"];
  }

  log(`connecting to ${url.origin}${url.pathname} …`);
  // Node's WebSocket (undici) accepts extra handshake headers in its init object.
  const ws = new WebSocket(url, { headers });

  ws.addEventListener("open", () => {
    backoff = 2000;
    log("connected; announcing gates:", gates.join(", "));
    ws.send(JSON.stringify({ v: 1, type: "hello", fw: "fake-device/1.0.0", gates }));
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return log("ignored non-JSON frame");
    }
    if (msg.type === "ping") {
      ws.send(JSON.stringify({ v: 1, type: "pong" }));
      return;
    }
    if (msg.type === "open") {
      log(`OPEN "${msg.gate}" (id ${msg.id.slice(0, 8)}) → ${opt.mode}`);
      if (opt.mode === "timeout") return;
      setTimeout(() => {
        if (opt.mode === "malformed") return ws.send("{this is not json");
        const known = gates.includes(msg.gate);
        const ok = opt.mode === "ok" && known;
        const error = !known ? "GATE_NOT_FOUND" : opt.mode === "fail" ? "TX_FAILED" : undefined;
        ws.send(JSON.stringify({ v: 1, type: "result", id: msg.id, ok, ...(error ? { error } : {}) }));
      }, delay);
    }
  });

  ws.addEventListener("close", (ev) => {
    log(`disconnected (${ev.code}${ev.reason ? `: ${ev.reason}` : ""}); retrying in ${backoff / 1000}s`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 60_000);
  });
  ws.addEventListener("error", () => {
    /* the close event follows */
  });
}

connect();
