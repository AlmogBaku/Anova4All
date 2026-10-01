# Builds and deploys. The Pi's address, directory and service come from the
# environment or the command line, e.g. `make deploy-pi PI_HOST=pi@192.168.1.208`.
PI_HOST    ?=
PI_DIR     ?= /opt/anova4all
PI_SERVICE ?= anova4all
PI_HEALTH  ?= http://127.0.0.1:8000/health

BIN := anova4all

.PHONY: ui mcp-app pi deploy-pi test fake-cooker

ui:
	cd frontend && bun install --frozen-lockfile && bun run build

# The cooker card is embedded in the binary, so build it first.
mcp-app:
	cd frontend && bun install --frozen-lockfile && bun run build:mcp-app

pi: mcp-app
	GOOS=linux GOARCH=arm GOARM=6 CGO_ENABLED=0 go build -trimpath -o $(BIN) ./cmd/anova4all

test:
	go vet ./... && go test -race ./...

# A fake cooker (synthetic identity) that dials a local server's cooker port.
# Pass flags with ARGS, e.g. `make fake-cooker ARGS="-set-temp 57 -rate 2"`.
fake-cooker:
	go run ./cmd/fakecooker $(ARGS)

# Back up the running binary, copy the new one, restart, and check /health.
# Rolls back to the backup when the new binary doesn't come up healthy.
deploy-pi: pi
	@test -n "$(PI_HOST)" || { echo "set PI_HOST (user@host)"; exit 1; }
	scp $(BIN) $(PI_HOST):$(PI_DIR)/$(BIN).new
	ssh $(PI_HOST) 'set -e; cd $(PI_DIR); \
		[ -f $(BIN) ] && cp -p $(BIN) $(BIN).bak; \
		mv $(BIN).new $(BIN); chmod 755 $(BIN); \
		sudo systemctl restart $(PI_SERVICE); \
		for i in 1 2 3 4 5 6 7 8 9 10; do \
			sleep 1; curl -fsS $(PI_HEALTH) >/dev/null && { echo healthy; exit 0; }; \
		done; \
		echo "not healthy, rolling back"; \
		[ -f $(BIN).bak ] && mv $(BIN).bak $(BIN) && sudo systemctl restart $(PI_SERVICE); \
		exit 1'

# Install the Cloudflare Tunnel (locally-managed) on the Pi, e.g.
#   make deploy-tunnel PI_HOST=pi@192.168.1.208 TUNNEL_ID=<uuid> \
#     TUNNEL_HOST=anova.example.com TUNNEL_CREDS=$HOME/.cloudflared/<uuid>.json
# Renders deploy/cloudflared.yml.example, then copies the config, the
# credentials JSON (root-owned, mode 600) and the unit, validates the ingress
# rules, and enables and starts cloudflared. The credentials file is only ever
# copied: never read, printed or logged. Needs /usr/local/bin/cloudflared on
# the Pi (the cloudflared-linux-arm release asset).
TUNNEL_ID    ?=
TUNNEL_HOST  ?=
TUNNEL_CREDS ?=

.PHONY: deploy-tunnel
deploy-tunnel:
	@test -n "$(PI_HOST)" || { echo "set PI_HOST (user@host)"; exit 1; }
	@echo "$(TUNNEL_ID)" | grep -Eqx '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' \
		|| { echo "set TUNNEL_ID to the tunnel UUID"; exit 1; }
	@echo "$(TUNNEL_HOST)" | grep -Eqx '[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+' \
		|| { echo "set TUNNEL_HOST to the public hostname, e.g. anova.example.com"; exit 1; }
	@test -n "$(TUNNEL_CREDS)" && test -f "$(TUNNEL_CREDS)" && test -s "$(TUNNEL_CREDS)" \
		|| { echo "set TUNNEL_CREDS to the local tunnel credentials JSON"; exit 1; }
	@set -e; \
	cfg=$$(mktemp); trap 'rm -f "$$cfg"' EXIT; \
	sed -e 's/TUNNEL_ID/$(TUNNEL_ID)/g' -e 's/TUNNEL_HOST/$(TUNNEL_HOST)/g' deploy/cloudflared.yml.example > "$$cfg"; \
	tmp=$$(ssh $(PI_HOST) 'command -v /usr/local/bin/cloudflared >/dev/null || { echo "install /usr/local/bin/cloudflared first" >&2; exit 1; }; mktemp -d'); \
	trap 'rm -f "$$cfg"; ssh $(PI_HOST) "rm -rf $$tmp"' EXIT; \
	scp -q "$$cfg" $(PI_HOST):"$$tmp/config.yml"; \
	scp -q "$(TUNNEL_CREDS)" $(PI_HOST):"$$tmp/creds.json"; \
	scp -q deploy/cloudflared.service $(PI_HOST):"$$tmp/cloudflared.service"; \
	ssh $(PI_HOST) "set -e; \
		sudo install -d -o root -g root -m 755 /etc/cloudflared; \
		sudo install -o root -g root -m 600 $$tmp/creds.json /etc/cloudflared/$(TUNNEL_ID).json; \
		sudo install -o root -g root -m 644 $$tmp/config.yml /etc/cloudflared/config.yml; \
		sudo install -o root -g root -m 644 $$tmp/cloudflared.service /etc/systemd/system/cloudflared.service; \
		sudo test -s /etc/cloudflared/$(TUNNEL_ID).json || { echo 'credentials missing on the Pi' >&2; exit 1; }; \
		sudo /usr/local/bin/cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate; \
		sudo systemctl daemon-reload; \
		sudo systemctl enable --now cloudflared; \
		systemctl is-active cloudflared"
