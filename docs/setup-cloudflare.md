# Cloudflare setup (Worker, Durable Object, custom domain)

Everything fits in the Cloudflare **free plan** (Workers + SQLite-backed Durable Objects + Zero Trust
for up to 50 users).

## 1. Configure

```bash
cd worker
npm install
cp wrangler.toml.example wrangler.toml   # gitignored: holds your private settings
```

| Field | Example | Required | Description |
|---|---|---|---|
| `routes` | `[{ pattern = "gate.example.com", custom_domain = true }]` | yes | Hostname of the app (see step 3) |
| `workers_dev` | `false` | yes | Keep the app off `*.workers.dev`, so it is only reachable behind Access |
| `ENVIRONMENT` | `"production"` | yes | `"development"` enables the localhost-only dev login |
| `AUTH_MODES` | `"cloudflare-access"` | yes | Authentication strategy (see [authentication.md](authentication.md)) |
| `ACCESS_TEAM_DOMAIN` | `"myteam.cloudflareaccess.com"` | yes | Zero Trust team domain |
| `ACCESS_AUD` | `"4f1c…"` | yes | Application Audience tag of the Access application |
| `ALLOWED_EMAILS` | `"alice@example.com,bob@example.com"` | yes | People who may use the app |
| `ADMIN_EMAILS` | `"you@example.com"` | yes | Admins (manage locations, invites) |
| `GATE_PERMISSIONS` | `'{"bob@example.com":["Garage"]}'` | no | Per-person gate restrictions |
| secret `DEVICE_TOKEN` | 43 random characters | yes | Shared with the device; set with `wrangler secret put` |

## 2. Log in, create the device token and deploy

```bash
npx wrangler login                     # opens the browser to authorize your account
```

Generate a random token (32 bytes, base64url):

```powershell
# Windows PowerShell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($b); [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_')
```

```bash
# macOS / Linux
openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
```

```bash
npx wrangler secret put DEVICE_TOKEN   # paste the token; keep a copy for the device config
npm run deploy
```

Expected: `Deployed bruce-gate-relay … gate.example.com (custom domain)`.

## 3. Custom domain

The domain must be an **active zone** in your Cloudflare account (its nameservers point to Cloudflare).

- Check: dashboard → your domain → **Overview** says *Active*.
- If it isn't on Cloudflare yet, **stop and decide first**: moving nameservers affects the whole domain
  (website, email records), and partial (CNAME) setups need a paid plan. Copy every existing DNS record
  before switching.
- Make sure no DNS record already exists for the subdomain you want (e.g. `gate`).

With `custom_domain = true` in `routes`, `wrangler deploy` creates the DNS record and the TLS
certificate automatically. Verify: `https://gate.example.com` loads (after Access is configured, it shows
the Google login).

**Using `workers.dev` instead?** Set `workers_dev = true` and remove `routes`. Cloudflare Access can
protect `workers.dev` hostnames too (dashboard → Workers → your Worker → Settings → Domains & Routes →
enable Cloudflare Access), but a custom domain is simpler to manage and is what this guide assumes.

## 4. Cloudflare Access

Follow [authentication.md](authentication.md) (Zero Trust team, Google login, Allow policy, Bypass
for guest paths, Service Token for the device), then put `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in
`wrangler.toml` and run `npm run deploy` again.

## Operations

- **Logs:** `npx wrangler tail` streams live logs (device connections, malformed messages, errors).
- **Rotate `DEVICE_TOKEN`:** generate a new one, `npx wrangler secret put DEVICE_TOKEN`, update
  `/gate-relay.json` on the device and restart Gate Relay.
- **Rotate the Service Token:** create a new one in Zero Trust, add it to the Service Auth policy,
  update the device, then delete the old token.
- **Add/remove users:** update the Access Allow policy and `ALLOWED_EMAILS`, then deploy.
