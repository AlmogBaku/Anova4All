# The web UI and the MCP cooker card. Vite bakes the Supabase settings into
# the UI, so they are build arguments, not runtime variables.
FROM --platform=$BUILDPLATFORM oven/bun:1 AS frontend
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
WORKDIR /src/frontend
COPY frontend/package.json frontend/bun.lockb ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build && bun run build:mcp-app

# The server, cross-compiled for the target platform (amd64, arm64, arm/v6, arm/v7).
FROM --platform=$BUILDPLATFORM golang:1.26 AS server
ARG TARGETOS TARGETARCH TARGETVARIANT
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/internal/mcp/ui/app.html internal/mcp/ui/app.html
RUN GOOS=$TARGETOS GOARCH=$TARGETARCH GOARM=${TARGETVARIANT#v} CGO_ENABLED=0 \
    go build -trimpath -ldflags="-s -w" -o /out/anova4all ./cmd/anova4all

FROM scratch
COPY --from=server /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=server /out/anova4all /anova4all
COPY --from=frontend /src/frontend/dist /ui
ENV UI_DIR=/ui REST_SERVER_HOST=0.0.0.0
USER 65532:65532
EXPOSE 8000 8080
ENTRYPOINT ["/anova4all"]
