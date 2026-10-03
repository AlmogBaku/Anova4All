# Builds and checks. Machine-specific deploy targets go in local.mk (git-ignored).
BIN := anova4all

.PHONY: ui mcp-app test fake-cooker

ui:
	cd frontend && bun install --frozen-lockfile && bun run build

# The cooker card is embedded in the binary, so build it first.
mcp-app:
	cd frontend && bun install --frozen-lockfile && bun run build:mcp-app

test:
	go vet ./... && go test -race ./...

# A fake cooker (synthetic identity) that dials a local server's cooker port.
# Pass flags with ARGS, e.g. `make fake-cooker ARGS="-set-temp 57 -rate 2"`.
fake-cooker:
	go run ./cmd/fakecooker $(ARGS)

-include local.mk
