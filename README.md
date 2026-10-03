<div align="center">

<img src=".github/logo.svg" width="48" alt="Anova4All logo">

# Anova for All

**Anova killed the cloud for its Wi-Fi sous vide. This brings it back, and lets Claude or ChatGPT cook with it.**

<a href="https://anova.baku.co.il"><img src="https://img.shields.io/badge/Use_the_hosted_app-anova.baku.co.il_%E2%86%92-c2552d?style=for-the-badge" alt="Use the hosted app at anova.baku.co.il" height="40"></a>

No app to install. MCP endpoint: `https://anova.baku.co.il/mcp`

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE.md)
![Go](https://img.shields.io/badge/Go-1.26-00ADD8?style=flat-square&logo=go&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-Claude_%7C_ChatGPT-black?style=flat-square)

[Cook with AI](#cook-with-an-ai-assistant) · [Get started](#get-started) · [How it works](#how-it-works) · [Self-host](#self-hosting) · [Develop](#development)

<img src=".github/screenshot.jpg" width="300" alt="The Anova4All cook screen on a phone, heating to 57 °C with a 1.5-hour timer and auto-stop on">

</div>

> [!IMPORTANT]
> **Why this exists:** Anova shut down the cloud service behind the Precision Cooker Wi-Fi (the first generation). The
> cooker still heats water perfectly well, but the official app can no longer reach it, so a working cooker became
> a brick on the counter.

Anova4All replaces that cloud. The cooker connects to an Anova4All server instead of Anova's, and you control it from
an AI assistant over MCP, or from a web app on your phone or desktop. You don't need to patch DNS or open the cooker.

- **Cook by asking:** "start the cooker at 57 °C for 2 hours" in Claude or ChatGPT, with a live cooker card in hosts
  that support MCP Apps.
- **Cook from your phone:** live water temperature, a draggable target dial, °C and °F, and a timer that starts once
  the water reaches temperature.
- **Auto-stop:** turns the heater off when the timer ends. It survives server restarts.
- **Share the cooker:** invite people in your household by link. They can cook but can't manage the cooker.
- **Bluetooth setup in the browser:** no app to install. The setup writes a new key, the server address and your Wi-Fi
  straight to the cooker.
- **Open:** MIT-licensed, with a REST API and Go packages for the cooker's protocol. Self-host it if you prefer.

## Cook with an AI assistant

Anova4All is an MCP server, so your assistant can check on the water, start a cook, change it and stop it.

1. [Set up your cooker](#get-started) on the hosted app (once).
2. Add `https://anova.baku.co.il/mcp` as a custom connector in Claude (web, desktop or mobile) or ChatGPT.
3. Sign in with your Anova4All account when it asks, and approve the connection.

You can see and remove connected apps under **Account**.

| Tool | What it does |
|---|---|
| `anova_status` | the cooker's temperature, set point, timer and state |
| `anova_start_cook` | starts a cook at a temperature, with an optional timer and auto-stop |
| `anova_update_cook` | changes the temperature or timer of a running cook |
| `anova_stop_cook` | stops the cook |

## Get started

Use the hosted instance at **[anova.baku.co.il](https://anova.baku.co.il)**. You set the cooker up once over
Bluetooth, from a phone or laptop standing next to it.

1. **Open the app in a browser with Web Bluetooth:**
   - **iPhone or iPad:** Safari has no Web Bluetooth, so install the free
     [BLE Link](https://apps.apple.com/us/app/ble-link-web-ble-browser/id6468414672) browser and open
     `anova.baku.co.il` in it.
   - **Android, Mac, Windows or Linux:** use Chrome or Edge.
2. **Sign up** and confirm your email.
3. **Choose _Set up a cooker_** and follow the steps. The cooker gets a new secret key and the server's address, and
   optionally your Wi-Fi network (2.4 GHz only). It then connects to the server and is paired to your account.
4. **Cook** from your assistant, or from any browser, Safari included. Add the app to your home screen for one-tap
   access.

> [!TIP]
> The cooker accepts only one Bluetooth connection at a time. If setup can't find it, close any other app that might
> be connected to it, and keep your phone close to the cooker.

> [!NOTE]
> Anova4All is a community project. It is not affiliated with or endorsed by Anova.

## How it works

```mermaid
flowchart LR
    cooker["Anova Wi-Fi cooker"] -- "TCP :8080" --> server["Go server"]
    browser["Web app"] -- "HTTPS: REST + live stream" --> server
    ai["Claude / ChatGPT"] -- "HTTPS: MCP + OAuth" --> server
    server --> supabase[("Supabase<br/>accounts, devices, sharing")]
    browser -. "Bluetooth, setup only" .-> cooker
```

- **Cooker link:** the cooker keeps a TCP connection open to the server. The server sends one command at a time,
  matches each reply to its command, and marks the cooker offline within 6 seconds when the link drops.
- **Accounts:** Supabase handles sign-in, sharing and row-level security. The Go server checks Supabase tokens and is
  the only thing that talks to cookers.
- **Web app:** React and Vite. The Go server serves it from the same origin as the API and `/mcp`.

| Path | What's inside |
|---|---|
| `cmd/anova4all` | the server |
| `cmd/fakecooker` | a fake cooker for local development |
| `internal/` | the REST API, MCP server, cook control, auth and storage |
| `pkg/wifi`, `pkg/commands`, `pkg/ble` | the cooker's TCP protocol, its commands and its Bluetooth protocol, usable on their own |
| `frontend/` | the web app and the MCP cooker card |
| `supabase/` | the schema, RLS policies, RPCs and pgTAP tests |

## Self-hosting

You can run your own instance with Docker or as a single Go binary. You'll need:

- a [Supabase](https://supabase.com) project, with the schema in `supabase/migrations` pushed to it;
- HTTPS in front of the HTTP port, because Web Bluetooth only works on secure origins;
- the cooker port (TCP 8080) reachable from the cooker's network.

### With Docker Compose

```sh
cp .env.example .env   # fill in your Supabase project, DATABASE_URL and PUBLIC_HOST
docker compose up -d
```

This builds one image with the server and the web UI, and publishes port 8000 (the UI, the API and `/mcp`) and port
8080 (the cooker). The image builds for amd64, arm64 and 32-bit ARM, so it also runs on a Raspberry Pi.

### From source

```sh
make ui                     # build the web UI into frontend/dist
make mcp-app                # build the MCP cooker card, which is embedded in the binary
go build ./cmd/anova4all
```

### Configuration

The server reads environment variables, or a `config` file next to the binary:

| Variable | Meaning | Default |
|---|---|---|
| `ENV` | `DEV` for readable logs, otherwise `PROD` | `PROD` |
| `DATABASE_URL` | Postgres URL for the `anova_server` role | required |
| `SUPABASE_URL` | the Supabase project URL, used to verify sign-in tokens | required |
| `PUBLIC_HOST` | the address the cooker dials | empty |
| `PUBLIC_ANOVA_PORT` | the port the cooker dials | `8080` |
| `ANOVA_SERVER_PORT` | the cooker TCP port the server listens on | `8080` |
| `REST_SERVER_HOST` | the address the HTTP port binds to (`0.0.0.0` in the Docker image) | `127.0.0.1` |
| `REST_SERVER_PORT` | the HTTP port | `8000` |
| `UI_DIR` | the built web UI (`frontend/dist`) to serve on the same origin | empty (no UI) |
| `MCP_PUBLIC_URL` | the public MCP endpoint, e.g. `https://anova.example.com/mcp` | empty (no MCP) |
| `CORS_ORIGINS` | comma-separated origins allowed to call the API from elsewhere | empty |

> [!IMPORTANT]
> The cooker speaks raw TCP, not HTTP, so `PUBLIC_HOST` must resolve straight to your server, not to an HTTPS proxy
> in front of it.

## Development

You don't need a real cooker to work on the server or the UI. `cmd/fakecooker` dials the cooker port and answers like a
cooker: it heats toward the set point while running, counts the timer down, and redials if the link drops. It uses a
synthetic identity (`anova f00000000000000000000000`, key `testkey000`).

```sh
supabase start   # local database and auth
ENV=dev CORS_ORIGINS=http://localhost:5173 SUPABASE_URL=http://127.0.0.1:54321 \
  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  go run ./cmd/anova4all   # REST on :8000, cooker port on :8080
make fake-cooker           # in a second terminal
```

The URLs are the local Supabase defaults; `supabase status` prints them. Change the fake with flags, for example
`make fake-cooker ARGS="-set-temp 57 -rate 2"`; `go run ./cmd/fakecooker -h` lists them all. To control it from the UI,
pair it with the key above.

For the web app, copy `frontend/.env.example` to `frontend/.env.local`, then run `bun install && bun run dev` in
`frontend/`. Run all Go checks with `make test`.

## Credits

Thanks to [@TheUbuntuGuy](https://github.com/TheUbuntuGuy) for the original research on the Anova Wi-Fi protocol:

- [Video walkthrough](https://www.youtube.com/watch?v=xDDPFHhY7ec)
- [Protocol notes (gist)](https://gist.github.com/TheUbuntuGuy/225492a8dec816d49b70d9c21811e8b1)
