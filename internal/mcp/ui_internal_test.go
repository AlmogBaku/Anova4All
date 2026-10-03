package mcp

import (
	"strings"
	"testing"
	"testing/fstest"
)

func TestCardHTMLPrefersBuiltAppOverPlaceholder(t *testing.T) {
	placeholder := &fstest.MapFile{Data: []byte("<!doctype html><!-- anova4all-card-placeholder --><html></html>")}
	app := &fstest.MapFile{Data: []byte("<!doctype html><html><body>built card</body></html>")}

	if got := cardHTML(fstest.MapFS{"ui/placeholder.html": placeholder}); got != string(placeholder.Data) {
		t.Fatalf("without app.html: %q", got)
	}
	if got := cardHTML(fstest.MapFS{"ui/placeholder.html": placeholder, "ui/app.html": {}}); got != string(placeholder.Data) {
		t.Fatalf("empty app.html must fall back: %q", got)
	}
	if got := cardHTML(fstest.MapFS{"ui/placeholder.html": placeholder, "ui/app.html": app}); got != string(app.Data) {
		t.Fatalf("with app.html: %q", got)
	}
}

func TestEmbeddedPlaceholderIsCommitted(t *testing.T) {
	b, err := ui.ReadFile("ui/placeholder.html")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), "anova4all-card-placeholder") || !strings.Contains(string(b), "<html") {
		t.Fatalf("placeholder.html: %q", b)
	}
}
