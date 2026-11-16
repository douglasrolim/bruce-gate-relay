# Contributing

Thanks for helping! Please read [LEGAL.md](LEGAL.md) first: contributions must keep the project
focused on operating gates you own, with fixed-code remotes.

## Ground rules

- English everywhere in the code base (identifiers, comments, commit messages, docs). UI strings are
  written in English and translated in `worker/client/i18n.ts` (Portuguese today).
- Every source file starts with `SPDX-License-Identifier: AGPL-3.0-or-later`.
- Never commit secrets or personal data: no tokens, real `wrangler.toml`, `.dev.vars`, `.sub`
  captures, real URLs, Wi-Fi names or emails. Run `scripts/check-private.sh` before pushing.
- Small commits using [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:` …).

## Development

```bash
cd worker
npm install
npm test            # Vitest: unit + integration tests with a simulated device
npm run typecheck
npm run lint
npx tsx ../tools/ui-preview/server.ts   # click through the UI without Cloudflare (http://localhost:8788)
```

End to end with the real Worker runtime:

```bash
cp .dev.vars.example .dev.vars
cp wrangler.toml.example wrangler.toml   # the dev server ignores the custom domain
npm run dev                              # http://localhost:8787 (dev login, localhost only)
node ../tools/fake-device/fake-device.mjs --url ws://localhost:8787/device --token <DEVICE_TOKEN from .dev.vars>
```

Firmware unit tests run on your computer:

```bash
python -m platformio test -d firmware -e native
```

## Pull requests

Describe what changed and how you tested it. CI must be green (lint, typecheck, tests, firmware host
tests, secret scan).
