# Anova4All: hosted, reliable, redesigned, with MCP access

## Objective
A hosted service where Anova 900W Wi-Fi owners sign up, pair their cooker through a guided Bluetooth setup, share it with their household, and control it reliably from the browser or from Claude/ChatGPT over MCP. An optional per-cook auto-stop ends cooking when the timer runs out. A side project for tens of users: robust, never flaky, and the simplest dependable design wins.

## Constraints
- Scale: tens of users. No caches, extra layers or abstractions unless a test needs them.
- Compatibility: none. Clean cut-over from master; the owner signs up and re-pairs. The Pi keeps a backup of the previous build.
- Tracking: ticketless. The GitHub draft PR on AlmogBaku/Anova4All is the record.
- Hosting: Go server on the Pi 1 B+ (armv6l, 512 MB, IPv4 only), public at `home.baku.co.il:9800` (WAN 9800 → Pi 8443). Cookers reach it on public TCP 8080, which the router forwards.
- Supabase project `lebimptwgcdfsydgcvxl` (eu-central-1). ES256 tokens verified via JWKS. DB through the session pooler on 5432 (IPv4).
- Go: 1.25, `pgx/v5`, `golang-jwt/v5`, `keyfunc/v3`, `x/crypto/bcrypt`, `modelcontextprotocol/go-sdk` v1.8. Frontend: React 19, current supabase-js with the publishable key, Bun; `@modelcontextprotocol/ext-apps` + `vite-plugin-singlefile` for the cooker card.
- Frozen: `pkg/commands` strings and decoders (new validators allowed), `pkg/wifi/encoding.go`, the Pi TLS setup.
- Secrets live only in `.env` / env files, are never logged and never put in records. Test data is synthetic; nothing derives from `research/` or the root CSVs.
- The cooker protocol has no authentication and sends its key in clear text (firmware). The design trusts a cooker connection only as far as "it knows the stored key".
- gin trusts no proxy headers; JWTs pinned to ES256; anonymous sign-ins off; plaintext REST binds to loopback only.
- Supported: Anova 900W Wi-Fi ("A3") only. Setup needs Web Bluetooth (Chrome on Android or desktop); no iOS.
- Setup copy: 2.4 GHz WPA/WPA2, SSID/password without spaces or special characters, one BLE connection at a time. "Get the cooker ready" steps are verified on the real cooker.
- Success states are quiet: a plain confirmation, no celebration.
- Never without asking the owner: the router change, `supabase db push` to live, the Pi deploy/restart, anything that deletes data.

## Decisions
1. **Hosting.** The Pi hosts everyone; Supabase does auth and data; the browser talks to Go directly for live control; Go verifies tokens locally via JWKS.
   - Rejected: self-hosting per owner (too high a bar); Supabase Realtime + command table (extra hop and queue); `/auth/v1/user` per request (latency).
2. **Browser data through RLS.** `key_hash` never readable; only `name` writable, owner only. Go uses `anova_server` with its own policies and grants, never the superuser.
3. **Pairing by the Bluetooth-written key.**
   - Setup (browser, next to the cooker): `get id card` → `set number K` → `server para <ip> 8080` → optional `wifi para`.
   - On connect Go reads id_card + key. Key matches the stored bcrypt hash → **bound** (the newest matching connection replaces an older one). Otherwise → **pending**: memory only, uncontrollable, dropped after 120 s, at most 64 (oldest dropped). Connecting never writes the key.
   - `POST /api/devices/pair {id_card, K}`, polled every 2 s for up to 60 s (1/s per user). Under a per-id_card Go mutex, each connection for that id_card is asked for a fresh `get number`: none → `device_offline`; none reports K → `key_mismatch`; else store bcrypt(K), caller becomes owner, bind the newest reporting connection, close the others.
   - New owner → old row deleted with members, invites and cooks; new row. Same owner → same row, members kept.
   - Rejected: remote pairing with an existing key (no proof of presence); key history / `key_reused` / `key_ambiguous`, a Postgres advisory lock, and per-IP pair limits (simplified away: one server, Go mutex suffices).
4. **Cooker link rebuilt in `pkg/wifi`.** Framed reads on 0x16 (1 KB cap), one writer, one command in flight, user commands ahead of polls, per-command reply validation, 3 s timeout with stale-reply drain, write deadlines and keepalive, 3 missed polls close the link, compare-and-delete in the registry, callbacks outside locks, 10 s handshake deadline, accept backoff. Repeatable commands retry once; start/stop re-read status; offline fails fast.
5. **Live stream.** SSE hub keyed by device UUID: initial state, send on change only, 16-slot drop-oldest per subscriber, 15 s ping that re-checks membership and binding, online/offline/`cook_ended` events. Browser reconnects with backoff (1–30 s, jitter), refreshes the token once on 401, shows connection state.
6. **Browser Bluetooth setup.** New client: FIFO queue, 20-byte chunks 30 ms apart, notifications started once with a line buffer, 3 s timeout with 2 retries, one reconnect, always disconnect, no `forget()`. Setup is a step machine with repeatable steps (preflight, get ready, find, connect, key, server, optional Wi-Fi, wait + pair, name). SSID/password validated.
7. **Auto-stop.** Per cook, off by default, set through Go. `internal/cook` recomputes the deadline from every timer reading, calls `control.AutoStop` at timer end (event or poll; after a restart only after a fresh read), once per cook, 3 retries; the alarm keeps sounding. It writes no rows itself; heating stopped with a row open → `control.CloseIfIdle`.
8. **One control path: `internal/control`.** REST and MCP both call `StartCook`, `UpdateCook`, `StopCook`. Membership is read from the DB per command (no cache). Ranges: 25–100 °C / 77–211 °F, timer 0–6000 min.
   - A cook is active exactly when the cooker reports heating; the row only records auto-stop and the end reason; only `control` writes rows, under one mutex per cooker.
   - Start `{temperature, unit, minutes?, auto_stop?}`: `cook_in_progress` if heating; else close any leftover row (`manual`), run the steps, write the row; `auto_stop` without `minutes` refused.
   - Update `{temperature?+unit, minutes?, auto_stop?}`: `no_active_cook` if not heating (never starts the heater); `minutes` sets and starts the timer; writes a row for a cook started from the buttons; `auto_stop` with no timer refused.
   - Stop: stops heating and timer, clears the alarm, closes the row; works without a row (silences after auto-stop); a low-water alarm keeps sounding.
   - Cook screen: idle edits are a local draft sent by Start; during a cook each edit is an Update.
   - REST: `POST /api/devices/:device_id/cook`, `PATCH …/cook`, `POST …/cook/stop`. No low-level command endpoints.
9. **Sharing.** Owner + members; one-time invite links (32-byte token in the URL fragment, hash stored, 7-day expiry). Members control; only the owner renames, invites, removes, unpairs.
10. **MCP login.** Supabase OAuth 2.1 server (beta) with dynamic client registration and our consent page. A pure SQL access-token hook sets `aud="anova4all-mcp"` when `client_id` is present. Go accepts browser tokens (`aud=authenticated`, no `client_id`, not anonymous) on `/api` only, and app tokens (`aud=anova4all-mcp` with `client_id`) on `/mcp` only. Every policy and RPC for `authenticated`/`anon` also requires `private.is_browser_session()`, enforced by a catalog test. Consent shows Approve only for exact https `claude.ai`, `claude.com`, `chatgpt.com` or http loopback, and never inside a frame.
11. **MCP tools.** Official Go SDK inside the Go server, stateless, JSON responses. `anova_status` (read-only, idempotent, cached state), `anova_start_cook`, `anova_update_cook`, `anova_stop_cook` (thin wrappers over decision 8). Text summary plus structured content. Cooker card `ui://anova/cooker` (`text/html;profile=mcp-app`): polls status every 2 s while visible, buttons call the tools and update model context. Per-user limits: reads 2/s burst 10, writes 10/min burst 5. Audit log with user and client, never the token.
12. **Frontend.** Dependency refresh (React 19, Vite 7, react-router 7, shadcn re-init), then an impeccable redesign (Operate) with the direction picked by the owner.
13. **Deploy.** Router forwards WAN 8080 to the Pi; `server_info` reports the public IPv4 from `PUBLIC_HOST`; systemd `Restart=always`; public `/health` returns only a count.
14. **Database tooling.** `pgxpool` (4 conns, 5 s statement timeout, `verify-full`, fatal on bad config). Supabase CLI migrations replace `init.sql`. `anova_server` created without a password; the owner sets it once, only in the Pi env file. pgTAP against local Supabase.

## Accepted risks
- **Lockout:** anyone who knows an id_card can pair a fake cooker and lock the owner out until they re-pair over Bluetooth.
- **Network watcher:** someone on the home Wi-Fi or on the cooker↔Pi path can take over the cooker (submit the new key first during setup, or inject into the unencrypted connection). The protocol has no authentication; no server rule fixes it.
- **App revocation at token expiry:** a revoked MCP app keeps access until its token expires (≤1 h); refresh stops immediately.
- **Distributed floods on the cooker port:** many source addresses can still fill the 64 pending slots and evict a real cooker during setup; one address cannot (see the security-review change below).
- **Device names in members' AI context:** the owner's device name (≤ 40 chars, no control characters) reaches a member's assistant as quoted text.
- **Consent allowlist is host-only:** any `https://claude.ai|claude.com|chatgpt.com/<path>` redirect can be approved; PKCE and those hosts not being attacker-controlled limit it. Pinning callback paths would break silently when a provider changes its path.
- A home IP change breaks cookers (they store a raw IP). Supabase free tier limits email and pauses when idle.
- **MCP app tokens can manage the account** through Supabase's Auth API: change the password, start an email change (double-confirmed), manage grants, sign out everywhere. Owner decision 2026-10-01: a valid token is trusted, MCP is a public API; no Go-issued tokens, loopback redirects stay allowed.

## Non-goals
- Server-side Bluetooth linking (the `/internal` listener and server BLE routes are removed).
- Management over MCP; read-only scopes; instant app revocation.
- Other Anova models, native apps, iOS setup.
- Push notifications, recipes, cook-history UI beyond the last end reason.
- Custom SMTP; a no-login mode; migrating master's localStorage; moving off the Pi.

## Open questions
- None.

## Decision changes after the lock
2026-10-01, decided by the owner at plan approval ("keep the implementation simple … side project … robust, not flaky"): added MCP access (decisions 10–11); replaced the pairing details (key-must-change, per-IP limits) with decision 3; dropped server-side BLE linking (old decision 13); replaced the 15 s role cache with a per-command membership read; moved auto-stop toggling into the cook operations (decision 8). The locked brief below is kept as locked; where it differs, the decisions above win.

2026-10-01, pre-deploy security review (SEC-1…8), decided by the main session within the approved scope: the cooker listener now refuses a source's 9th not-yet-bound connection (handshaking or pending) and runs at most 2 key checks at once, protecting the 4-connection pool and the Pi's CPU (this is a listener cap, not the per-IP `/pair` limit that was dropped); `Pair` reads every connection's key in parallel under one 4 s deadline, so silent fakes can't stall re-pairing; the test harness refuses a non-loopback database; the systemd unit drops write access and capabilities; setup shows which account the cooker pairs to (mitigates login CSRF from the implicit flow). Before `config push`, `site_url` and redirect URLs in `supabase/config.toml` must be set to the Pages origin only.

2026-10-01, security re-review round 2 (SEC-2 partly open, SEC-9, SEC-10), decided by the main session within the approved scope: key checks now run one at a time per source address (still at most 2 overall), and the 5 s check timeout starts only when that address's turn comes, so one address flooding wrong keys can't starve a real cooker's check (bcrypt at cost 10 keeps a Pi 1 core busy; its time on the Pi was not measured). The cooker card quotes the device name in what it tells the model, matching the server's `%q`. The test harness's loopback guard checks the hosts pgx will actually dial, so a `?host=` override or a remote fallback host is refused. A scoped re-review approved this; its Minor SEC-11 (a caller with many IPv6 addresses still counts as many sources) is recorded only: the cooker port is reached through an IPv4 router forward, so grouping by /64 isn't needed now.

2026-10-01, decided by the owner: sign-up is open to any Anova owner, at small scale (tens to low hundreds), still on the Pi; the redesign adds onboarding and trust copy for strangers. MCP app tokens are trusted as they are (see Accepted risks); check 20 no longer requires the Auth API to refuse them.

2026-10-01, go-live (the owner said "give me access"): the Go server serves the built UI from `UI_DIR` on the same origin as `/api` and `/mcp`, so there is no GitHub Pages and no CORS. `site_url` is `https://anova.baku.co.il` (the owner corrected the Pages origin). HTTPS goes through a Cloudflare Tunnel instead of the 9800 forward. The agent set the `anova_server` password, which lives only in the Pi env file and a git-excluded local copy. The DB is reached through the Supabase session pooler, because the direct host is IPv6-only.

2026-10-01, found at the first real pairing: real id cards contain hyphens. The id-card check now allows `[a-z0-9-]`, with a test. The cooker port can't use the tunnel, which only carries HTTP to plain clients; raw TCP needs Spectrum. The owner's cooker on the Pi's LAN couldn't reach the public address (no forward, or no hairpin NAT), so `PUBLIC_HOST` is the Pi's LAN IP for now, and setup has an optional "Server address" field (decided by the owner). Remote cookers still need a router forward.

2026-10-01, after go-live, decided by the main session within the approved scope:
- **MCP host check.** The SDK's localhost guard refused every request through the tunnel. The tunnel reaches a loopback listener with the public `Host`, and the guard answers 403 to that. The guard is turned off (`DisableLocalhostProtection`). In its place, `allowHosts` accepts only the `MCP_PUBLIC_URL` host, `localhost` and loopback IPs, with bearer auth still inside it. A DNS-rebinding page can't attach the bearer token, so the remaining risk is low.
- **Pairing code.** The owner deferred the pairing code for agents that can't open a browser on their own machine (see the ROADMAP).
- **Set-command replies.** The real cooker answers `set unit c` with `c`, not `ok`. A set command now also accepts its echoed value (the unit, or the set point). The timer status reads `45 running` / `45 stopped` as well as `45 1`.
- **Unit only when it changes.** Every temperature change used to resend `set unit`, and the real cooker's display kept flipping to °F; with the unit read wrong, a °C tap clamped the set point to 25 °C. Start and update now read the unit fresh and send `set unit` only when it differs, and on a unit switch the UI converts the set point only when it fits the old unit's range; otherwise it keeps the number instead of clamping it.

2026-10-03, bug reported by the owner: Start sent `start time` right after `start`, so the timer counted down during preheat. As in the Anova app, the timer now waits for the set point: Start (and an Update that adds a timer while the timer isn't running) only sets it unless the water is already there, and records `cooks.timer_waiting` (new migration; a DB column so a restart mid-preheat still starts it, decided by the owner). `internal/cook` calls `control.StartWaitingTimer` when a reading becomes "heating, timer set but stopped, water at the set point", on bind, and on the temp-reached event; control re-reads the cooker under its mutex, starts the timer once and clears the flag. "At the set point" is within 0.5 °C / 1 °F below it or anywhere above (decided by the owner: water that starts too hot doesn't wait to cool). A timer stopped from the buttons later is left alone. The status adds `cook.timer_waiting`.

## Locked brief
The interactive page is kept beside this file as `dazzling-tumbling-ripple.brief.html`. Its content, as locked:

### Problem
Anova shut down the cloud for the 900W Wi-Fi cooker. Anova4All replaces it: the cooker dials into our server over TCP and the browser controls it. Today it works for one household only, and it's unreliable:
- Commands get lost or crossed.
- The UI lies or goes blank.
- Setup fails silently (Bluetooth writes over 20 bytes are cut; there's no guidance).
- The multi-user branch can't run (startup and request panics, an unsafe grant).
- A finished timer doesn't stop cooking.

Why now: other Anova Wi-Fi owners should be able to use it.

### Current state
- master on the Pi runs with no login, and the cooker key is kept in localStorage.
- `pkg/wifi` has a single reply slot, 6 polls every 2 s, and a registry keyed by ID card.
- `sse.go` starts a goroutine per send and has no dedup or initial state.
- `feat/store` has Supabase login in the browser, HS256 checks in Go, sqlx/lib-pq, `init.sql` with `devices.user_id`, and React 18.
- Setup is Web Bluetooth with no chunking.
- The new Supabase project is empty. It uses ES256/JWKS and the session pooler.

### Proposed solution
One hosted server that many owners sign up to.

Requirements:
- **Auth:** Supabase sign-up, confirmation and reset, from the browser.
- **Access:** RLS-enforced, for owners and invited members.
- **Pairing:** browser-only, over Bluetooth. Setup writes the key, then the server, then (optionally) the Wi-Fi. Pairing is an ownership upsert: it needs a valid token, the connected cooker reporting exactly the submitted key, and a key that differs from the stored one. A cooker connection is controllable only while its key matches the stored key. No remote pairing.
- **Setup experience:** smooth, with automatic Bluetooth retries, retry from the failed step, progress on every wait, and a fix named for every failure.
- **Invites:** one-time links that expire after 7 days.
- **Scale:** tens of users; prefer the simplest dependable fix.
- **Defects:** every defect A1–F4 and requirement G1–G5 fixed, each with a test that fails before the fix, run with `-race`.
- **Commands:** never crossed; a dead link shows "Cooker offline" within about 6 s and recovers without a reload.
- **Setup guidance:** explains how to get the cooker ready and validates the Wi-Fi details.
- **Auto-stop:** per cook, off by default, survives restarts.
- **Redesign:** via impeccable.
- **Compatibility:** none (clean cut-over).

Architecture:
- The browser talks to Supabase for auth and its device list under RLS, and to Go for live control.
- The cooker dials into Go.
- Go reads and writes Supabase as `anova_server`.
- Setup uses Bluetooth only.

### Defects and fixes (feat/store line numbers)

**A. `pkg/wifi/connection.go`**

| # | Defect | Fix |
|---|---|---|
| A1 (:89–135, :171) | Single reply slot with a 10 s timeout. Late replies shift every later reply. Seen: "parse error in GetTimerStatus". | One writer, one command in flight, per-command validator, drain window after a timeout. |
| A2 (:90, :92, :140–171) | `responseQueue` is read by `listen()` with no lock (data race). | Single-goroutine reply routing. |
| A3 (:181–200) | One `Read(1024)` is treated as one message. | `ReadBytes(0x16)`. |
| A4 (:112) | Inverted flush check, so a closed socket stays "alive". | Any write error closes the connection. |
| A5 (:143–148, :184–188) | Decode or read errors exit `listen()` without cancelling. Seen: zombie link. | The read loop owns cancellation. |
| A6 (:58–62, :146) | `close(responseQueue)` races a send, which panics. | No cross-goroutine close. |
| A7 | No deadlines, so half-open connections are never noticed. | Write deadlines, heartbeat liveness, keepalive. |
| A8 (:155–165) | The event callback runs inline on the read loop. | Buffered event channel. |

**B. `device.go`, `manager.go`, `server.go`**

| # | Defect | Fix |
|---|---|---|
| B1 (device.go:137–163) | The 6-command poll every 2 s starves user commands. Seen. | Priority queue, one poll pass per tick, 3 s timeout. |
| B2 (device.go:158–160) | Poll failures are only logged. | 3 failures close the link. |
| B3 (device.go:75) | `%e`. | `%w`. |
| B4 (device.go:73–76; server.go:117–131) | A failed handshake isn't closed, and the handler waits for server shutdown, leaking a goroutine and socket. | Close on failure; return when the connection ends. |
| B5 (device.go:78–83; manager.go:124–145) | The old device's disconnect deletes the new device. Seen. | Compare-and-delete. |
| B6 (manager.go:131–133) | Callbacks are set after goroutines start. | Pass them to the constructor. |
| B7 (device.go:185–246) | Callbacks run under `stateChangeMu`. | Copy, unlock, then call. |
| B8 (device.go:191–209) | Unchecked assertions panic on a misrouted reply. | Checked assertions. |
| B9 (device.go:225–240) | Unknown events error, and `time finish` isn't forwarded. | Handle all events and forward to auto-stop. |
| B10 (device.go:295) | `String()` prints the key. | Remove it. |
| B11 (server.go:95–109) | The accept loop dies on the first error. | Back off; exit only on `ErrClosed`. |

**C. Live stream**

| # | Defect | Fix |
|---|---|---|
| C1 (sse.go:29 vs :63, :79) | Subscribers are keyed by UUID, broadcasts by ID card, so nothing is delivered. | Key both by UUID. |
| C2 (sse.go:53–55, :41–42) | A goroutine per send plus close, which panics. | Per-subscriber drop-oldest buffer. |
| C3 | The full state is broadcast on every poll. | Send on change only. |
| C4 (sse.go:106–124) | No initial state, `WriteHeader` before the Flusher check, 30 s ping. Seen: blank °F. | Send state immediately, check first, 15 s ping. |
| C5 (client.ts:198–217; device.ts:118–150) | Reconnect recursion with no backoff and a stale token. | Backoff, token refresh on 401, connection state. |
| C6 (device.ts:128–133) | Online/offline doesn't trigger a change. | Treat it as a state change. |
| C7 (device.ts:12–17, :40) | `stop()` doesn't abort the stream. | Abort the controller. |

**D. HTTP, auth, data**

| # | Defect | Fix |
|---|---|---|
| D1 (wifi.go:13, :16 vs device_handlers.go:29–31) | Wildcard conflict and a duplicate route, so gin panics at startup. | One wildcard; drop the list route. |
| D2 (device_handlers.go:52, :80, :106) | `.(string)` on a `uuid.UUID`. | `userIDFrom(c)`. |
| D3 (wifi.go:201) | `timer.(int)` on a `TimerStatus`. | Use the decoded type. |
| D4 (auth.go:52–58) | HS256 only. | JWKS ES256. |
| D5 (auth.go:15–36, :84–88) | LAN IPs bypass admin auth. | Remove. |
| D6 (auth.go:122–139) | A list-and-loop ownership check on every request. | One query plus a 15 s cache. |
| D7 (store.go:97–153) | Stale hash plus a sleep-retry, with no rate limit. | Live key check plus a rate limit. |
| D8 (init.sql) | Broad UPDATE grant. | Column grants plus pgTAP. |
| D9 (main.go:39–45, :73–75) | Errors are logged and execution continues, then a nil panic. | Fatal. |
| D10 (main.go:89–97) | The TLS server runs in the foreground, so there's no graceful shutdown. | Goroutines plus ordered shutdown. |
| D11 (service.go:51–55) | All origins allowed, with credentials. | `CORS_ORIGINS` allow-list. |
| D12 | Raw 500s. | Typed error codes. |
| D13 (store.go:54, :87) | `Background` context and `log`. | Timeout context and zap. |

**E. Browser Bluetooth**

| # | Defect | Fix |
|---|---|---|
| E1 (client.ts:100–101) | No 20-byte chunking. Seen: truncated `wifi para`. | Chunk with `\r`. |
| E2 (client.ts:148–186) | `startNotifications` per command, plus leaked listeners and timers. | Start once, line buffer, clear on timeout. |
| E3 (client.ts:91–96) | Broken lock. | FIFO queue. |
| E4 (client.ts:29–35) | The `idCard` getter returns undefined. | `connect()` returns the ID card. |
| E5 | No disconnect handler. | Typed error plus one reconnect. |
| E6 (client.ts:66–83) | No disconnect on failure, and `forget()`. | Always disconnect; no `forget()`. |
| E7 (device-setup.tsx:38–40) | Scan errors are swallowed. | Specific guidance per error. |
| E8 (device-setup.tsx:83–93) | Reset-key unchecked skips pairing. | Removed. |
| E9 (device-setup.tsx:67–100) | All-or-nothing setup. | Step machine with repeatable steps. |
| E10 (device-setup.tsx:91; commands.ts:70–71) | No wait for the cooker to dial in, and no SSID/password validation. | 60 s wait plus validation. |
| E11 (anova.tsx:86–90) | LAN IP cached forever. | Fresh public address. |

**F. Server Bluetooth (internal only)**

| # | Defect | Fix |
|---|---|---|
| F1 (ble.go:75–89) | UUID panic. | `New16BitUUID`. |
| F2 (ble.go:108–121) | No chunking; replies read with `Read`. | Chunks plus notifications. |
| F3 (ble.go:42–47; rest/ble.go) | Scan close race; scan per call; never disconnects. | Guarded channel, timeout, `defer Disconnect`. |
| F4 (rest/ble.go + auth.go:84–88) | BLE routes are public behind the LAN-IP check. | Internal LAN listener. |

**G. Public cooker server (hobby scale)**

| # | Requirement |
|---|---|
| G1 | A connection is bound only if its key matches the stored key; otherwise it's pending (in memory, uncontrollable). A duplicate replaces a bound connection only on a key match. Connecting never writes the key. |
| G2 | 1 KB frame cap and a 10 s handshake deadline. |
| G3 | Repeatable commands retry once; start and stop re-read the status. |
| G4 | Commands to an offline cooker fail at once. |
| G5 | systemd `Restart=always`. Public `/health` returns a count only; the internal `/internal/health` lists cookers. |

### Traces
- **Scenario: Alice (owner), Bob (member), Eve (another user), Mallory (anonymous).**
  - Alice pairs over Bluetooth, and Go makes her owner after the live key check.
  - Her invite goes through an owner-only RPC that stores the token hash.
  - Bob accepts after signing up and becomes a member, so his device list shows the cooker.
  - Eve's list is empty, and calling Go directly gets 403 `not_member`.
  - Mallory gets 401, and `anon` has no access.
- **Withheld action:** Bob can't unpair (the RPC checks for owner) or rename (owner-only policy), and the UI hides both. He can start, stop and set temperature, timer and auto-stop.
- **Round trip:** Bob turns on auto-stop and starts a 90-minute cook.
  - Go opens a cook with its deadline, and the live stream shows "Stops at 14:30".
  - The Pi restarts at 13:00. Go resumes from the open cook.
  - At 14:30 Go sends stop, records end reason = timer and sends `cook_ended`.
  - The alarm keeps sounding, and the UI offers "Silence".
- **Refusal:** Eve guesses a key. The live key check fails with `key_mismatch`, and after 5 tries in 10 minutes she gets `rate_limited`. If Eve replays Alice's current key (it was seen in transit), she gets `key_unchanged`.
- **Fake cooker:** Mallory's script dials 8080 as Alice's id_card with the key `ZZZZ`, and stays pending. If Mallory pairs it, she owns only the record. Alice's real cooker reports its own key, which no longer matches, so nobody controls it. Alice re-runs Bluetooth setup, re-pairs, and owns it again.

### Risks
- A change of home IP breaks remote cookers, because the cooker stores a raw IP.
- Pi 1 B+ capacity is fine at this scale.
- The Supabase free tier limits emails and pauses the project when idle.
- Pi→Frankfurt latency, which the 15 s cache absorbs. A removed member keeps control, and their live stream, for up to 15 s.
- The steps for getting the cooker ready aren't documented and must be verified on the real cooker.
- **Accepted: remote lockout.** The cooker protocol can't tell a real cooker from a script. Anyone who knows a cooker's id_card can pair a fake and leave the real cooker uncontrollable until its owner re-pairs over Bluetooth. They can never control the real cooker. We accept this at hobby scale rather than adding a busy rule or hiding id_cards.
- The cooker sends its key in clear text over the internet on every connection; the firmware dictates this. Pairing requires a changed key, so a key seen in transit can't be replayed into ownership.
- Pending connections are memory only, and their count is bounded by the G2 limits. A flood of fake cookers can't fill the database.

### Behavior changes
- Everyone must sign in.
- The GH Pages UI needs a rebuild.
- The device list comes from Supabase.
- Pairing is browser-only, over Bluetooth, with a fresh key: no reset-key checkbox, no remote pairing, no iOS.
- A cooker whose key no longer matches is uncontrollable until someone re-pairs it over Bluetooth. Pairing by a different user transfers ownership and removes the old owner and members.
- Setup writes the key, then the server, then optionally the Wi-Fi. "Keep current Wi-Fi" is supported.
- New: members, invites, auto-stop, an explicit offline state, and the internal linking listener.
