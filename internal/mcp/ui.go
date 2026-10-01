package mcp

import (
	"context"
	"embed"
	"io/fs"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
)

// CardURI is the MCP Apps resource the tools point to.
const CardURI = "ui://anova/cooker"

// CardMIMEType is the MCP Apps HTML profile.
const CardMIMEType = "text/html;profile=mcp-app"

// ui holds placeholder.html (committed) and app.html (built by `bun run build:mcp-app`,
// gitignored) when present.
//
//go:embed ui
var ui embed.FS

// cardHTML returns app.html if it was built, else the placeholder.
func cardHTML(fsys fs.FS) string {
	if b, err := fs.ReadFile(fsys, "ui/app.html"); err == nil && len(b) > 0 {
		return string(b)
	}
	b, err := fs.ReadFile(fsys, "ui/placeholder.html")
	if err != nil {
		panic("mcp: ui/placeholder.html is missing from the build")
	}
	return string(b)
}

// addCard registers the cooker card. It talks to the host only through postMessage and
// loads nothing from the network, so it needs no _meta.ui.csp.
func addCard(s *sdk.Server) {
	html := cardHTML(ui)
	s.AddResource(&sdk.Resource{
		URI:         CardURI,
		Name:        "cooker",
		Title:       "Cooker card",
		Description: "Live card for one cooker: temperature, timer and cook controls.",
		MIMEType:    CardMIMEType,
	}, func(_ context.Context, req *sdk.ReadResourceRequest) (*sdk.ReadResourceResult, error) {
		return &sdk.ReadResourceResult{Contents: []*sdk.ResourceContents{{
			URI: CardURI, MIMEType: CardMIMEType, Text: html,
		}}}, nil
	})
}
