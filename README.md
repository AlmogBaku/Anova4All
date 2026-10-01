<h1>
<img src=".github/logo.svg" width="20" alt="logo"> Anova for All
</h1>

> Recently, Anova decided to shut down their cloud services for the Anova Precision Cooker Wi-Fi 1 - although the device
> is still fully functional, and still serves its purpose.
>
> That means that while the device is still functional, the app is no longer able to connect to the device.

This project lets you control the Anova Precision Cooker Wi-Fi without the Anova app. A small Go server (a Raspberry Pi
is enough) takes the place of Anova's cloud: the cooker dials it over TCP, and you control the cooker from a web UI or
from an AI assistant over MCP. Accounts and sharing run on Supabase, so several people can share one cooker.

* **Web UI:** setup over Web Bluetooth, the cook screen with live temperature, a timer with optional auto-stop, sharing
  by invite link, and connected apps.
* **MCP:** Claude or ChatGPT can check, start, change and stop a cook after you sign in through OAuth.
* **Libraries:** `pkg/wifi` (the cooker's TCP protocol) and `pkg/commands` (its commands) can be used on their own.

![Anova for All screenshot](./.github/screenshot.jpg)

## Build

- **Server:** `go build ./cmd/anova4all`. For a Raspberry Pi 1, `make pi` cross-compiles (`GOARM=6`) after building
  the MCP cooker card.
- **Web UI:** `make ui` (Bun) writes `frontend/dist`. The server serves it when `UI_DIR` points there.

## Setting up a cooker

Open the web UI on a browser with Web Bluetooth (Chrome on desktop or Android; on iOS use an app like
[BLE Link](https://apps.apple.com/us/app/ble-link-web-ble-browser/id6468414672)), sign in, and choose
**Add a cooker**. The setup talks to the cooker over Bluetooth: it writes a new secret key, the server's address, and
optionally your Wi-Fi. The cooker then dials the server, which pairs it to your account. Web Bluetooth needs HTTPS,
which the Cloudflare Tunnel below provides.

## Configuration

The server reads environment variables (or a `config` file next to it):

| Variable | Meaning | Default |
|---|---|---|
| `ENV` | `DEV` for readable logs, otherwise `PROD` | `PROD` |
| `DATABASE_URL` | Postgres URL for the `anova_server` role, `sslmode=verify-full` | required |
| `SUPABASE_URL` | the Supabase project URL, used to verify sign-in tokens | required |
| `PUBLIC_HOST` | the address the cooker dials (a WAN IP, a DNS-only name or a LAN IP) | empty |
| `PUBLIC_ANOVA_PORT` | the port the cooker dials | `8080` |
| `ANOVA_SERVER_PORT` | the cooker TCP port the server listens on | `8080` |
| `REST_SERVER_PORT` | the HTTP port, on loopback only | `8000` |
| `UI_DIR` | the built web UI to serve on the same origin | empty (no UI) |
| `MCP_PUBLIC_URL` | the public MCP endpoint, e.g. `https://anova.example.com/mcp` | empty (no MCP) |
| `CORS_ORIGINS` | comma-separated origins allowed to call the API from elsewhere | empty |

## Local development with a fake cooker

You don't need a real cooker to work on the server or the UI. `cmd/fakecooker` dials the cooker port and
answers like a cooker: it heats toward the set point while running, counts the timer down, and redials if the
link drops. It uses a synthetic identity (`anova f00000000000000000000000`, key `testkey000`).

```sh
supabase start   # local database and auth
ENV=dev SUPABASE_URL=http://127.0.0.1:54321 \
  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  go run ./cmd/anova4all   # REST on :8000, cooker port on :8080
make fake-cooker         # in a second terminal
```

The URLs are the local Supabase defaults; `supabase status` prints them. Change the fake with flags, e.g.
`make fake-cooker ARGS="-set-temp 57 -rate 2"`; `go run ./cmd/fakecooker -h` lists them all. Stop it with
Ctrl-C. To control it from the UI, pair it with the key above.

## Cloudflare Tunnel

On the Pi, the HTTP API listens on `127.0.0.1:8000` only. A locally-managed
Cloudflare Tunnel publishes it over HTTPS, covering `/api`, the SSE stream, `/mcp`,
`/.well-known/oauth-protected-resource` and `/health`. The cooker port (8080) is raw
TCP, and cooker firmware can't use a tunnel, so the router still forwards WAN 8080
to the Pi. The examples below use `anova.example.com` as the hostname.

1. **Install cloudflared on the Pi.** You need only the binary. A Pi 1 is ARMv6, so use
   the `cloudflared-linux-arm` release asset, which is built with `GOARM=5`. The `armhf`
   asset and Cloudflare's apt package are ARMv7 builds and won't run on it. Copy the
   asset to `/usr/local/bin/cloudflared` with mode 755, and check it against the
   SHA256 in the release notes.
2. **Create the tunnel on the Pi.** `tunnel login` prints a URL; open it in any
   browser and pick your domain. It saves `~/.cloudflared/cert.pem`, which can manage
   tunnels and DNS for the whole domain. Once the tunnel and its DNS route exist, move it off the Pi; the tunnel
   runs on its own credentials file.

   ```sh
   cloudflared tunnel login
   cloudflared tunnel create anova4all      # writes ~/.cloudflared/<TUNNEL_ID>.json
   cloudflared tunnel route dns anova4all anova.example.com
   ```

3. **Install the tunnel on the Pi.** Run this from the Mac:

   ```sh
   make deploy-tunnel PI_HOST=pi@<pi-address> TUNNEL_ID=<TUNNEL_ID> \
     TUNNEL_HOST=anova.example.com
   ```

   This renders `deploy/cloudflared.yml.example` into `/etc/cloudflared/config.yml`,
   which sends `anova.example.com` to `http://localhost:8000` and everything else to a
   404. It installs the credentials as `/etc/cloudflared/<TUNNEL_ID>.json` (root-owned,
   mode 600) and installs `deploy/cloudflared.service`. Then it validates the ingress
   rules and enables and starts `cloudflared`. The credentials file is never printed.
4. **Set the server's env file on the Pi** (`/opt/anova4all/anova4all.env`, mode 600).
   The server serves the web UI too, so the UI, the API and `/mcp` share one origin and
   no CORS is needed:

   ```sh
   MCP_PUBLIC_URL=https://anova.example.com/mcp
   UI_DIR=/opt/anova4all/ui                     # the built frontend/dist
   PUBLIC_HOST=<WAN IPv4, or a DNS-only name>   # what the cooker dials on 8080
   ```

   Don't use the tunnel hostname for `PUBLIC_HOST`. It resolves to Cloudflare, which
   won't carry the cooker's TCP. Restart the server afterwards
   (`sudo systemctl restart anova4all`).
5. **Build the web UI** with `make ui`, leaving `VITE_API_URL` unset so it calls its own
   origin, and copy `frontend/dist` to `UI_DIR`.
6. **Set Supabase Auth.** `site_url` and the redirect URLs are the tunnel origin
   (`[remotes.production.auth]` in `supabase/config.toml`, pushed with
   `supabase config push`). In the dashboard, set the OAuth server's authorization path
   to `/oauth/consent` and allow dynamic client registration; `config push` can't set
   those two.

Check that it works with `curl https://anova.example.com/health` and
`systemctl status cloudflared`. Every request reaches the server from 127.0.0.1. That
is harmless here: rate limits are per user, and the server neither logs client IPs
nor keys anything on them. If cloudflared uses too much CPU on a Pi 1, add
`protocol: http2` to the config. It falls back to that by itself when UDP 7844 is
blocked.

## References

Thanks for @TheUbuntuGuy for the initial research on the Anova Wi-Fi protocol:

- https://www.youtube.com/watch?v=xDDPFHhY7ec
- https://gist.github.com/TheUbuntuGuy/225492a8dec816d49b70d9c21811e8b1

**Important**: This project is not affiliated with Anova or any other company. It's a community project that aims to
keep the device functional after the cloud services are shut down.
