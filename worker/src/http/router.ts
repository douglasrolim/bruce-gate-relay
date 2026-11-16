// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { HttpError, errorResponse, json } from "./http";

export type Params = Record<string, string>;
export type Handler = (req: Request, params: Params) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

/** Tiny method + path router. Path params use `:name` and match one URL segment. */
export class Router {
  private readonly routes: Route[] = [];

  on(method: string, path: string, handler: Handler): this {
    const keys: string[] = [];
    const source = path
      .split("/")
      .map((seg) => {
        if (seg.startsWith(":")) {
          keys.push(seg.slice(1));
          return "([^/]+)";
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");
    this.routes.push({ method, pattern: new RegExp(`^${source}$`), keys, handler });
    return this;
  }

  async handle(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url);
    let pathMatched = false;
    for (const route of this.routes) {
      const m = route.pattern.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== req.method) continue;
      const params: Params = {};
      route.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1]!);
      });
      try {
        return await route.handler(req, params);
      } catch (err) {
        if (err instanceof HttpError) return errorResponse(err);
        console.error("Unhandled error", err);
        return json({ ok: false, error: "INTERNAL" }, 500);
      }
    }
    return pathMatched
      ? json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405)
      : json({ ok: false, error: "NOT_FOUND" }, 404);
  }
}
