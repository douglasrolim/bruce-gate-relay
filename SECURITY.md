# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](../../security/advisories/new) for this repository, or contact the
maintainer through their GitHub profile. Include steps to reproduce and the affected version.
You should get an answer within a few days.

## Threat model (summary)

What we protect: the ability to transmit your gate signals. Who may trigger it: people you allow,
and guests you invite for a limited time.

| Layer | Control |
|---|---|
| Edge | Cloudflare Access (Google login + email allowlist) in front of every route except guest/static paths |
| Worker | Validates the `Cf-Access-Jwt-Assertion` JWT itself (RS256 signature against the team JWKS, issuer, audience, expiry). Never trusts the plain email header |
| Authorization | Email allowlist, admins, optional per-gate permissions (`GATE_PERMISSIONS`), fails closed on invalid config |
| Guests | Random 192-bit invite tokens, only their SHA-256 is stored; time window, revocation, max opens, per-invite rate limit, proximity on by default; token sent in a header, never logged |
| Device link | Outbound WSS only (no open ports). Access Service Token at the edge **and** a 32+ byte `DEVICE_TOKEN` checked in constant time. TLS validated against pinned root CAs |
| Device | Only gate *names* from one folder; never paths from the network. Bounded message sizes |
| Abuse | `POST` + JSON + same-origin check (CSRF), 3 s cooldown per gate, 20 opens per user per hour |
| Audit | Last 200 opens (who, gate, result, IP for admins, rounded distance) |

### Known limitations

- Whoever controls an allowed Google account (or an unexpired invite link) can open the allowed gates.
  Protect those accounts with 2-step verification and keep invites short.
- Browser geolocation can be spoofed: proximity is a deterrent, not a security boundary.
- Fixed-code radio signals can be recorded by anyone nearby when the gate is used, with or without
  this project. That is a property of fixed-code remotes.
- A device with physical access exposes its tokens (they are stored on the SD card / flash).
  Rotate `DEVICE_TOKEN` and the Service Token if the device is lost.
