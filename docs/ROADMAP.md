# Anova4All roadmap

Status as of 2026-10-01. The approved plan for `feat/store` (hosted multi-user service
on the Pi) replaced the earlier phased roadmap. Its decision record is
`.agents/ADRs/dazzling-tumbling-ripple.md`. A few of the old roadmap's choices were
reversed:
- local no-auth mode is gone, and the cut-over is clean, with no compatibility with master;
- devices can be shared with members;
- the server-side Bluetooth routes were removed.

## Done on `feat/store`

- [x] **Repo hygiene:**
  - `.gitignore` covers env files, `research/`, the root CSVs and the binary;
  - Go 1.26.
- [x] **Database:**
  - the Supabase schema, RLS, RPCs and the `anova_server` role;
  - the MCP access-token hook;
  - the pgTAP suite.
- [x] **Cooker link:**
  - one command in flight at a time, with replies matched to commands and timeouts;
  - offline within 6 s;
  - the bound/pending registry;
  - caps per source address on unbound connections and on key checks.
- [x] **Setup:** the Web Bluetooth client, in 20-byte chunks with a FIFO queue, and a step-by-step setup machine (key → server → optional Wi-Fi → pair → name).
- [x] **Go API:**
  - JWKS (ES256) auth that accepts browser tokens only;
  - pairing by the key written over Bluetooth;
  - `internal/control` cook operations;
  - the SSE hub;
  - typed errors;
  - ordered shutdown.
- [x] **Auto-stop:** per cook, it survives restarts and leaves the alarm sounding.
- [x] **Frontend core:**
  - the data layer through RLS;
  - the Go client with backoff and token refresh;
  - the cook screen's draft and updates;
  - invites and members.
- [x] **MCP:**
  - four tools over the official Go SDK;
  - OAuth through Supabase's OAuth server and our consent page;
  - connected apps in settings;
  - the live cooker card for MCP-Apps hosts.
- [x] **Deploy prep:**
  - `Makefile` targets `ui`, `mcp-app`, `pi`, `deploy-pi` (with health-check rollback) and `test`;
  - a hardened systemd unit.
- [x] **Security review before deploy:** findings fixed or recorded in the ADR.

- [x] **Live on 2026-10-01** at https://anova.baku.co.il:
  - the UI, API and `/mcp` on one origin, served by Go through a Cloudflare Tunnel;
  - the Supabase schema and auth config pushed.
- [x] **First real pairing fixes:**
  - id cards with hyphens;
  - `PUBLIC_HOST` set to the LAN IP;
  - an optional setup server address.

- [x] **Real cooker paired** and connected through `home.baku.co.il:8080`. The router forwards WAN 8080 to the Pi.
- [x] **Redesign** in the Copper Ring direction:
  - the cook dial with a draggable target, and °C/°F in the dial's gap;
  - the setup wizard, settings and account as grouped lists;
  - the MCP cooker card;
  - DESIGN.md.
- [x] **The cooker's own replies to `set unit`** (the unit letter instead of `ok`) are accepted. Before this, the change worked but reported a server error.

## Waiting on the owner

- [ ] **Cut-over checks:**
  - an auto-stop cook;
  - a replug;
  - the journal;
  - a systemd restart;
  - a cook from Claude in an MCP-Apps host (Claude web/desktop or ChatGPT), where the card shows.
- [ ] **Setup copy:** check the "get the cooker ready" steps against the real cooker; `frontend/src/components/setup/copy.ts` still marks them unverified.
- [ ] **Supabase dashboard:**
  - set the OAuth authorization path to `/oauth/consent`;
  - allow dynamic client registration;
  - delete the test OAuth client `a4a-redirect-check`.

## Then

- [ ] **Combined review fixes**, then mark the PR ready.
- [ ] **Custom SMTP** (e.g. Resend): Supabase's built-in sender only reaches team addresses.

## Later (out of scope for this branch)

- Linking a cooker server-side through the Pi's own Bluetooth.
- Management over MCP, and read-only scopes.
- Instant app revocation (today it takes effect at token expiry, up to 1 h).
- MCP sign-in for agents that can't open a browser on their own machine: a pairing code or a personal access token (deferred by the owner on 2026-10-01).
- CI: Go and frontend checks on PRs, plus release binaries including `linux/armv6`.
