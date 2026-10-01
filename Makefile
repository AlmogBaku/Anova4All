# Builds and deploys. The Pi's address, directory and service come from the
# environment or the command line, e.g. `make deploy-pi PI_HOST=pi@192.168.1.208`.
PI_HOST    ?=
PI_DIR     ?= /opt/anova4all
PI_SERVICE ?= anova4all
PI_HEALTH  ?= http://127.0.0.1:8000/health

BIN := anova4all

.PHONY: ui mcp-app pi deploy-pi test

ui:
	cd frontend && bun install --frozen-lockfile && bun run build

# The cooker card is embedded in the binary, so build it first.
mcp-app:
	cd frontend && bun install --frozen-lockfile && bun run build:mcp-app

pi: mcp-app
	GOOS=linux GOARCH=arm GOARM=6 CGO_ENABLED=0 go build -trimpath -o $(BIN) ./cmd/anova4all

test:
	go vet ./... && go test -race ./...

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
