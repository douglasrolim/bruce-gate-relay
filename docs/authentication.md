# Authentication and authorization

Authentication (*who are you?*) and authorization (*what may you open?*) are separate.
Authentication is a **strategy** selected with `AUTH_MODES`; every strategy implements the same
interface and never throws for bad credentials:

```ts
interface Identity { subject: string; email?: string; provider: string; label?: string }
type AuthResult = { ok: true; identity: Identity } | { ok: false; reason: "MISSING_CREDENTIALS" | "INVALID_CREDENTIALS" | "EXPIRED" | "MISCONFIGURED" };
interface Authenticator { readonly name: string; authenticate(req: Request): Promise<AuthResult> }
```

| Mode | Status | Notes |
|---|---|---|
| `cloudflare-access` | **v1** | Google (or any Access identity provider) login at the edge; the Worker validates the JWT |
| invite tokens | **v1** | Guests only, on `/i/*` and `/api/guest/*` |
| dev | local only | `ENVIRONMENT=development` **and** a localhost URL; impossible in production (tested) |
| `password`, `google` (direct OIDC), passkeys, TOTP, API tokens | roadmap | Same interface; add an `Authenticator` and register it in `createAuthenticator.ts` |

Unknown modes fail at startup (fail closed).

## Cloudflare Access with Google (v1)

Cloudflare handles the login. The Worker **also** checks the `Cf-Access-Jwt-Assertion` JWT (RS256
signature against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, issuer, `aud`, expiry),
so a misconfigured route can't be used with a forged email header.

### 1. Create the Zero Trust team

1. Cloudflare dashboard → **Zero Trust**. Pick a team name (it becomes `<team>.cloudflareaccess.com`)
   and the **Free** plan (up to 50 users).
2. Note the team domain: it goes into `ACCESS_TEAM_DOMAIN`.

### 2. Google as identity provider

1. [Google Cloud Console](https://console.cloud.google.com/) → create (or pick) a project →
   **APIs & Services → OAuth consent screen**: External, app name "Gates", your email. You can leave it
   in *Testing* mode and add the people who will sign in as test users, or publish it (only basic
   profile/email scopes are used).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized JavaScript origin: `https://<team>.cloudflareaccess.com`
   - Authorized redirect URI: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
3. Copy the client ID and secret.
4. Zero Trust → **Settings → Authentication → Login methods → Add new → Google**. Paste them, save, and
   click **Test**: you should see your Google account details.
5. Optional: also enable **One-time PIN** (a code by email) as a fallback for people without Google.

### 3. The application

Zero Trust → **Access → Applications → Add an application → Self-hosted**:

- Name: `Gates`; domain: `gate.example.com` (your custom domain), path empty (the whole site).
- Session duration: **1 month**, so phones stay signed in.
- Identity providers: Google (and One-time PIN if you enabled it); enable *Instant Auth* if Google is
  the only one.
- Policies:
  1. **Allow** – *Include → Emails*: the people allowed to use the app.
  2. **Service Auth** – *Include → Service Token*: `t-embed-relay` (created below).
- Save, then copy the **Application Audience (AUD) tag** into `ACCESS_AUD`.

Guest links and static files must skip the Google login. Add a **second self-hosted application**
on the same domain with these paths and a single **Bypass – Everyone** policy:

```
/i/*   /guest   /guest.webmanifest   /api/guest/*   /assets/*   /sw.js   /manifest.webmanifest
```

(The Worker itself enforces the invite token on the guest routes; the other paths are public files.)

### 4. Service token for the device

Zero Trust → **Access → Service credentials → Service tokens → Create**: name `t-embed-relay`,
duration *non-expiring* (or a year and set a reminder). Copy the **Client ID** and **Client Secret**
right away (the secret is shown once) into the device's `/gate-relay.json`. Never commit them.

### 5. Verify

- Incognito window → `https://gate.example.com` shows the Google login.
- An email that is not in the Allow policy is denied by Access.
- An allowed email reaches the app.
- `curl -i https://gate.example.com/device` returns a redirect/403 (no service token).

### Adding or removing people

Edit the **Allow** policy emails **and** `ALLOWED_EMAILS` in `wrangler.toml`, then `npx wrangler deploy`.
Both layers must agree: Access is the first gate, the Worker check is the second.

## Authorization

- `ALLOWED_EMAILS`: comma-separated allowlist. `ADMIN_EMAILS`: admins (always allowed, see all gates,
  can manage locations and invites, see IP addresses in the activity log).
- `GATE_PERMISSIONS` (optional JSON): restrict people to some gates. `"*"` is the default for anyone
  not listed. Invalid JSON denies all gates to non-admins (fail closed).

```toml
GATE_PERMISSIONS = '{"bob@example.com":["Garage"],"*":["Garage","Main Entrance"]}'
```

## Guest invites

Admins create invites in the app (**Manage → New**, or **⋯ → Share with guests** on a gate). An invite
has a label, gates, a validity window (max 30 days), an optional max number of opens and a
*Guests must be at the gate* switch (on by default). The link `https://gate.example.com/i/<token>`
contains a random 192-bit token; only its SHA-256 is stored, so the link is shown **once**. The page moves
the token out of the URL into the phone's storage and sends it as a `Bearer` header. Revoke any invite
from **Manage**.

## Adding another mode later

1. Implement `Authenticator` in `worker/src/auth/` (e.g. `PasswordAuthenticator` with constant-time
   comparison and lockout, or `GoogleOidcAuthenticator` with PKCE, `state` and a signed `HttpOnly`
   session cookie).
2. Add a `case` to `createUserAuthenticator`.
3. Add unit tests: valid, tampered, expired, not allowed.
4. Document it here, including trade-offs.
