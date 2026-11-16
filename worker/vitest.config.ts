// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

import { defineConfig } from "vitest/config";

// The business logic is runtime-agnostic (Web Crypto, Request/Response) and depends on
// interfaces, so tests run in Node. The Durable Object glue (src/hub, src/index.ts) is
// exercised end-to-end with `wrangler dev` + tools/fake-device.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
