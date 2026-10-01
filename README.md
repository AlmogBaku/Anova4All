<h1>
<img src=".github/logo.svg" width="20" alt="logo"> Anova for All
</h1>

> Recently, Anova decided to shut down their cloud services for the Anova Precision Cooker Wi-Fi 1 - although the device
> is still fully functional, and still serves its purpose.
>
> That means that while the device is still functional, the app is no longer able to connect to the device.

This project aims to provide a way to control the Anova Precision Cooker Wi-Fi without the need for the Anova app.

It uses the Anova Wi-Fi protocol to communicate with the device directly over the local network.

* **This project can be used as a library, a REST API, or a web interface.**
* This project was originally developed in Python, but then I decided to port it to Go for better performance, so it
  would run seamlessly on my Raspberry Pi.

## Features & Roadmap

- [x] Connect to the Anova Precision Cooker Wi-Fi
- [x] Discover the device on the local network (Bluetooth Low Energy)
- [x] Send commands to the device (Wi-Fi or Bluetooth)
- [x] Configure the device to work with the local server without any DNS patching
- [x] Receive responses from the device
- [x] Control the device settings
- [x] Monitor the device status
- [x] Use the library via a REST API
- [x] Use the library via a Python package
- [x] Use the library via a Go package
- [x] Implement a web interface

![Anova for All screenshot](./.github/screenshot.jpg)

## Installation

1. git clone
2. install dependencies: `go mod tidy`
3. build the project: `go build ./cmd/anova4all` (to build for raspberry pi without the BLE, use
   `GOOS=linux GOARCH=arm GOARM=6 go build --tags no_ble ./cmd/anova4all`)

### Building the UI

To build the UI:

1. navigate to the `frontend` directory
2. install the dependencies using `yarn install`
3. build the UI using `yarn build --outDir ../dist`
4. To serve the UI using the server, configure the environment variable `FRONTEND_DIST_DIR`
   to `./dist/` and run the server or use the `--frontend-dist-dir` flag (this is the default value).

## Configuration

To use the Anova for All, you need to change the `anova` package to use the server's IP address instead of the Anova
cloud services.

### Changing the server via the REST API

If your (server) device supports BLE, you can use the API to change the server address.

1. Run the server
2. Use the `POST /api/ble/config_wifi_server` endpoint.

To revert the changes, use the `POST /api/ble/restore_wifi_server` endpoint.

### Changing the server via the Web UI

You can also use the web interface to change the server address. This is usually more user-friendly :)

Notice: this require Web Bluetooth API support. Currently, it's not supported natively in iOS, but it's supported in
Android and desktop browsers. You can use an iOS app
like [BLE Link](https://apps.apple.com/us/app/ble-link-web-ble-browser/id6468414672) to connect to the device.

Notice that you must have an encrypted connection(tls - https) to the server to use the Web Bluetooth API. You can use
the server-less version of the UI over https://almogbaku.github.io/Anova4All/ .

## Usage

### Configuration

The following environment variables can be used to configure the server:

- `ENV`: Set the environment and reflect the logs behavior. Valid options are `DEV` or `PROD` (default: `PROD`).
- `SERVER_HOST`: The server host (default: empty).
- `ANOVA_SERVER_PORT`: The Anova server port (default: 8080).
- `REST_SERVER_PORT`: The REST server port (default: 8000).
- `FRONTEND_DIST_DIR`: The directory for the frontend distribution (default: `./dist`). If empty, the frontend is not
  served.
- `ADMIN_USERNAME`: The admin username (default: empty).
- `ADMIN_PASSWORD`: The admin password (default: empty).

To use TLS, set the following environment variables:
- `REST_SERVER_TLS_PORT`: The REST server TLS port (default: `-1` - which means disabled).
- `REST_SERVER_TLS_CERT`: The REST server TLS certificate file path (default: empty).
- `REST_SERVER_TLS_KEY`: The REST server TLS key file path (default: empty).

### Local development with a fake cooker

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

### Using the deployed UI

You can use the deployed UI, and set your own server address in the Settings page: https://almogbaku.github.io/Anova4All/
This saves the configuration in the browser's local storage.

This can be quite useful if you deploy the server on a Raspberry Pi or similar device, expose it externally, and use the
UI from anywhere.

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
   tunnels and DNS for the whole domain; keep it private (mode 600).

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
4. **Set the server's env file on the Pi.** Edit it with `sudoedit`:

   ```sh
   MCP_PUBLIC_URL=https://anova.example.com/mcp
   CORS_ORIGINS=https://<user>.github.io        # the web UI's origin, not the tunnel
   PUBLIC_HOST=<WAN IPv4, or a DNS-only name>   # what the cooker dials on 8080
   ```

   Don't use the tunnel hostname for `PUBLIC_HOST`. It resolves to Cloudflare, which
   won't carry the cooker's TCP. Restart the server afterwards
   (`sudo systemctl restart anova4all`).
5. **Build the web UI against the tunnel** with `VITE_API_URL=https://anova.example.com`.
6. **Set Supabase Auth.** Set `site_url` and the redirect URLs to the web UI's origin
   (for example `https://<user>.github.io/Anova4All/` and `…/**`). The tunnel hostname
   doesn't need to be a redirect URL: MCP clients find the auth server through
   `MCP_PUBLIC_URL`'s `/.well-known/oauth-protected-resource` metadata.

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
