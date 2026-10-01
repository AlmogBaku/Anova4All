package rest_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"anova4all/internal/rest"
)

func TestServesUIWithSPAFallback(t *testing.T) {
	dir := t.TempDir()
	write := func(name, body string) {
		p := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("index.html", "INDEX")
	write("assets/app.js", "JS")
	if err := os.WriteFile(filepath.Join(filepath.Dir(dir), "outside.txt"), []byte("SECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(rest.New(rest.Options{UIDir: dir}))
	t.Cleanup(srv.Close)

	get := func(path string) (int, string, string) {
		req, _ := http.NewRequest(http.MethodGet, srv.URL+path, nil)
		req.URL.Opaque = path // keep "../" as sent
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(res.Body)
		return res.StatusCode, string(b), res.Header.Get("Cache-Control")
	}
	for path, want := range map[string]string{
		"/":              "INDEX",
		"/devices/abc":   "INDEX",
		"/oauth/consent": "INDEX",
		"/assets/app.js": "JS",
	} {
		if code, body, _ := get(path); code != http.StatusOK || body != want {
			t.Errorf("GET %s = %d %q, want 200 %q", path, code, body, want)
		}
	}
	for _, path := range []string{"/../outside.txt", "/assets/../../outside.txt", "/%2e%2e/outside.txt"} {
		if _, body, _ := get(path); strings.Contains(body, "SECRET") {
			t.Errorf("GET %s served a file outside UIDir", path)
		}
	}
	if _, _, cc := get("/assets/app.js"); !strings.Contains(cc, "immutable") {
		t.Errorf("hashed asset Cache-Control = %q", cc)
	}
	if _, _, cc := get("/devices/abc"); cc != "no-cache" {
		t.Errorf("index Cache-Control = %q", cc)
	}
	if code, body, _ := get("/api/nope"); code != http.StatusNotFound || !strings.Contains(body, "not_found") {
		t.Errorf("GET /api/nope = %d %q, want the JSON 404", code, body)
	}
}

func TestNoUIDirKeepsJSON404(t *testing.T) {
	srv := httptest.NewServer(rest.New(rest.Options{}))
	t.Cleanup(srv.Close)
	res, err := http.Get(srv.URL + "/devices/abc")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", res.StatusCode)
	}
}
