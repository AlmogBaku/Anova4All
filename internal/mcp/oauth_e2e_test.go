package mcp_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/google/uuid"

	"anova4all/internal/auth"
	"anova4all/internal/mcp"
)

// TestOAuthE2E runs the real OAuth 2.1 flow against the local Supabase OAuth server (check 20):
// dynamic client registration, authorize with PKCE, consent as the signed-in user, code
// exchange, then the app token on /mcp, /api, the Data API and the Auth API, and refresh.
//
// Needs `supabase start` and ANOVA_OAUTH_E2E=1. Keys come from `supabase status -o env`
// at run time and are never printed.
func TestOAuthE2E(t *testing.T) {
	if os.Getenv("ANOVA_OAUTH_E2E") != "1" {
		t.Skip("set ANOVA_OAUTH_E2E=1 with local Supabase running")
	}
	sb := localSupabase(t)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	issuer := sb.api + "/auth/v1"
	jwks, err := keyfunc.NewDefaultCtx(ctx, []string{issuer + "/.well-known/jwks.json"})
	if err != nil {
		t.Fatalf("jwks: %v", err)
	}
	e := newEnvWith(t, envOpts{verifier: auth.New(jwks.Keyfunc, issuer), authServer: issuer})

	// The resource metadata names Supabase, and Supabase publishes its AS metadata.
	code, body := e.get(t, "/.well-known/oauth-protected-resource/mcp", "")
	if code != http.StatusOK || !strings.Contains(body, `"`+issuer+`"`) {
		t.Fatalf("resource metadata %d %s", code, body)
	}
	var asMeta struct {
		Registration string   `json:"registration_endpoint"`
		Authorize    string   `json:"authorization_endpoint"`
		Token        string   `json:"token_endpoint"`
		PKCE         []string `json:"code_challenge_methods_supported"`
	}
	sb.json(t, http.MethodGet, "/auth/v1/.well-known/oauth-authorization-server", nil, nil, http.StatusOK, &asMeta)
	if asMeta.Registration == "" || asMeta.Authorize == "" || asMeta.Token == "" {
		t.Fatalf("authorization server metadata lacks endpoints: %+v", asMeta)
	}

	// A user with a cooker.
	email := "oauth-" + hex.EncodeToString(randBytes(4)) + "@example.test"
	password := base64.RawURLEncoding.EncodeToString(randBytes(16))
	var created struct {
		ID uuid.UUID `json:"id"`
	}
	sb.json(t, http.MethodPost, "/auth/v1/admin/users", sb.admin(),
		map[string]any{"email": email, "password": password, "email_confirm": true}, http.StatusOK, &created)
	t.Cleanup(func() { sb.do(t, http.MethodDelete, "/auth/v1/admin/users/"+created.ID.String(), sb.admin(), nil) })
	user := created.ID
	browser := sb.login(t, email, password)
	dev, _, _ := e.paired(t, user, nil)

	// Three clients, so the destructive Auth API checks below don't depend on each other.
	app, refresh, clientID := sb.authorize(t, browser)
	appB, _, clientB := sb.authorize(t, browser)
	appC, _, _ := sb.authorize(t, browser)

	claims := jwtClaims(t, app)
	if claims["aud"] != auth.AppAudience || claims["client_id"] != clientID || claims["sub"] != user.String() || claims["iss"] != issuer {
		t.Fatalf("app token claims aud=%v client_id ok=%v sub ok=%v iss=%v",
			claims["aud"], claims["client_id"] == clientID, claims["sub"] == user.String(), claims["iss"])
	}

	// /mcp accepts it and sees the user's cooker; /api refuses it.
	c, err := e.connect(t, app)
	if err != nil {
		t.Fatalf("app token on /mcp: %v", err)
	}
	r := c.call(mcp.ToolStatus, nil)
	if r.isError || len(r.res.Devices) != 1 || r.res.Devices[0].ID != dev {
		t.Fatalf("status via OAuth: %+v %q", r.res, r.text)
	}
	if code, _ := e.get(t, "/api/devices", app); code != http.StatusUnauthorized {
		t.Fatalf("app token on /api: %d", code)
	}
	if code, _ := e.get(t, "/api/devices", browser); code != http.StatusOK {
		t.Fatalf("browser token on /api: %d", code)
	}

	// Data API: the browser token sees the device (positive control), the app token sees nothing.
	var rows []map[string]any
	sb.json(t, http.MethodGet, "/rest/v1/devices?select=id", sb.user(browser), nil, http.StatusOK, &rows)
	if len(rows) != 1 || rows[0]["id"] != dev.String() {
		t.Fatalf("browser Data API rows %v", rows)
	}
	rows = nil
	if st, b := sb.do(t, http.MethodGet, "/rest/v1/devices?select=id", sb.user(app), nil); st == http.StatusOK {
		if err := json.Unmarshal(b, &rows); err != nil || len(rows) != 0 {
			t.Fatalf("app token reads %d device rows from the Data API", len(rows))
		}
	}

	// Refresh keeps the app audience and client.
	var refreshed struct {
		AccessToken string `json:"access_token"`
	}
	sb.form(t, "/auth/v1/oauth/token", url.Values{"grant_type": {"refresh_token"}, "refresh_token": {refresh}, "client_id": {clientID}}, http.StatusOK, &refreshed)
	rc := jwtClaims(t, refreshed.AccessToken)
	if rc["aud"] != auth.AppAudience || rc["client_id"] != clientID {
		t.Fatalf("refreshed token aud=%v client_id ok=%v", rc["aud"], rc["client_id"] == clientID)
	}
	if _, err := e.connect(t, refreshed.AccessToken); err != nil {
		t.Fatalf("refreshed token on /mcp: %v", err)
	}

	// Auth API: an app token must not manage the account or its grants. Last, because a
	// password change ends the user's sessions.
	refused := func(name string, status int) {
		t.Helper()
		if status < 400 {
			t.Errorf("Auth API accepted an app token for %s (HTTP %d); it must refuse", name, status)
		}
	}
	st, _ := sb.do(t, http.MethodGet, "/auth/v1/user/oauth/grants", sb.user(app), nil)
	refused("listing OAuth grants", st)
	st, _ = sb.do(t, http.MethodPut, "/auth/v1/user", sb.user(app), map[string]any{"email": "changed-" + email})
	refused("changing the email", st)
	st, _ = sb.do(t, http.MethodDelete, "/auth/v1/user/oauth/grants?client_id="+url.QueryEscape(clientB), sb.user(appB), nil)
	refused("revoking a grant", st)
	newPassword := base64.RawURLEncoding.EncodeToString(randBytes(16))
	st, _ = sb.do(t, http.MethodPut, "/auth/v1/user", sb.user(appC), map[string]any{"password": newPassword})
	refused("changing the password", st)
	if st >= 400 {
		newPassword = password
	}
	if st, _ := sb.do(t, http.MethodPost, "/auth/v1/token?grant_type=password", sb.anon(), map[string]any{"email": email, "password": password}); st != http.StatusOK {
		t.Errorf("the original password stopped working after app-token calls (HTTP %d)", st)
	}
	// Last: a global logout would end every session, the browser's included. It
	// needs a live session, so sign in again (the password may have changed above).
	browser2 := sb.login(t, email, newPassword)
	appD, _, _ := sb.authorize(t, browser2)
	st, _ = sb.do(t, http.MethodPost, "/auth/v1/logout?scope=global", sb.user(appD), nil)
	refused("signing out everywhere", st)
}

// ---- local Supabase client ----

type supabase struct {
	api, publishable, secret string
	hc                       *http.Client
}

func localSupabase(t *testing.T) *supabase {
	t.Helper()
	cmd := exec.Command("supabase", "status", "-o", "env")
	cmd.Dir = "../.."
	out, err := cmd.Output()
	if err != nil {
		t.Fatal("supabase status failed; run `supabase start`") // output may hold keys: not printed
	}
	env := map[string]string{}
	for _, line := range strings.Split(string(out), "\n") {
		if k, v, ok := strings.Cut(line, "="); ok {
			env[strings.TrimSpace(k)] = strings.Trim(strings.TrimSpace(v), `"`)
		}
	}
	sb := &supabase{api: strings.TrimRight(env["API_URL"], "/"), publishable: env["PUBLISHABLE_KEY"], secret: env["SECRET_KEY"],
		hc: &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
	if sb.api == "" || sb.publishable == "" || sb.secret == "" {
		t.Fatal("supabase status lacks API_URL, PUBLISHABLE_KEY or SECRET_KEY")
	}
	return sb
}

func (sb *supabase) anon() http.Header { return http.Header{"Apikey": {sb.publishable}} }
func (sb *supabase) admin() http.Header {
	return http.Header{"Apikey": {sb.secret}, "Authorization": {"Bearer " + sb.secret}}
}
func (sb *supabase) user(tok string) http.Header {
	return http.Header{"Apikey": {sb.publishable}, "Authorization": {"Bearer " + tok}}
}

// do sends a JSON request and returns the status and body. Bodies may hold tokens: callers
// must not print them.
func (sb *supabase) do(t *testing.T, method, path string, h http.Header, body any) (int, []byte) {
	t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, sb.api+path, rd)
	for k, v := range h {
		req.Header[k] = v
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return sb.send(t, req)
}

func (sb *supabase) send(t *testing.T, req *http.Request) (int, []byte) {
	t.Helper()
	res, err := sb.hc.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", req.Method, req.URL.Path, err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode == http.StatusFound || res.StatusCode == http.StatusSeeOther {
		b = []byte(res.Header.Get("Location"))
	}
	return res.StatusCode, b
}

func (sb *supabase) json(t *testing.T, method, path string, h http.Header, body any, want int, out any) {
	t.Helper()
	if h == nil {
		h = sb.anon()
	}
	st, b := sb.do(t, method, path, h, body)
	if st != want && !(want == http.StatusOK && st == http.StatusCreated) {
		t.Fatalf("%s %s: HTTP %d, want %d", method, strings.SplitN(path, "?", 2)[0], st, want)
	}
	if out != nil {
		if err := json.Unmarshal(b, out); err != nil {
			t.Fatalf("%s %s: decode: %v", method, path, err)
		}
	}
}

func (sb *supabase) form(t *testing.T, path string, v url.Values, want int, out any) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, sb.api+path, strings.NewReader(v.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Apikey", sb.publishable)
	st, b := sb.send(t, req)
	if st != want {
		t.Fatalf("POST %s: HTTP %d, want %d", path, st, want)
	}
	if err := json.Unmarshal(b, out); err != nil {
		t.Fatalf("POST %s: decode: %v", path, err)
	}
}

func (sb *supabase) login(t *testing.T, email, password string) string {
	t.Helper()
	var tok struct {
		AccessToken string `json:"access_token"`
	}
	sb.json(t, http.MethodPost, "/auth/v1/token?grant_type=password", sb.anon(), map[string]any{"email": email, "password": password}, http.StatusOK, &tok)
	return tok.AccessToken
}

// authorize registers a public client and runs authorize + consent + code exchange as the
// browser user. It returns the access token, refresh token and client id.
func (sb *supabase) authorize(t *testing.T, browser string) (string, string, string) {
	t.Helper()
	const redirect = "http://127.0.0.1:9/callback"
	var client struct {
		ClientID string `json:"client_id"`
	}
	sb.json(t, http.MethodPost, "/auth/v1/oauth/clients/register", sb.anon(), map[string]any{
		"client_name": "anova4all e2e", "redirect_uris": []string{redirect}, "token_endpoint_auth_method": "none",
		"grant_types": []string{"authorization_code", "refresh_token"}, "response_types": []string{"code"},
	}, http.StatusCreated, &client)

	verifier := base64.RawURLEncoding.EncodeToString(randBytes(32))
	sum := sha256.Sum256([]byte(verifier))
	state := hex.EncodeToString(randBytes(8))
	q := url.Values{"response_type": {"code"}, "client_id": {client.ClientID}, "redirect_uri": {redirect},
		"code_challenge": {base64.RawURLEncoding.EncodeToString(sum[:])}, "code_challenge_method": {"S256"}, "state": {state}}
	st, loc := sb.do(t, http.MethodGet, "/auth/v1/oauth/authorize?"+q.Encode(), sb.anon(), nil)
	if st != http.StatusFound && st != http.StatusSeeOther {
		t.Fatalf("authorize: HTTP %d, want a redirect to the consent page", st)
	}
	u, err := url.Parse(string(loc))
	authID := ""
	if err == nil {
		authID = u.Query().Get("authorization_id")
	}
	if authID == "" {
		t.Fatal("authorize redirect has no authorization_id")
	}
	sb.json(t, http.MethodGet, "/auth/v1/oauth/authorizations/"+url.PathEscape(authID), sb.user(browser), nil, http.StatusOK, nil)
	var consent struct {
		RedirectURL string `json:"redirect_url"`
	}
	sb.json(t, http.MethodPost, "/auth/v1/oauth/authorizations/"+url.PathEscape(authID)+"/consent", sb.user(browser),
		map[string]any{"action": "approve"}, http.StatusOK, &consent)
	back, err := url.Parse(consent.RedirectURL)
	if err != nil || back.Query().Get("state") != state || back.Query().Get("code") == "" {
		t.Fatal("consent redirect lacks the code or the state")
	}
	var tok struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	sb.form(t, "/auth/v1/oauth/token", url.Values{"grant_type": {"authorization_code"}, "code": {back.Query().Get("code")},
		"client_id": {client.ClientID}, "redirect_uri": {redirect}, "code_verifier": {verifier}}, http.StatusOK, &tok)
	if tok.AccessToken == "" || tok.RefreshToken == "" {
		t.Fatal("code exchange returned no tokens")
	}
	return tok.AccessToken, tok.RefreshToken, client.ClientID
}

func jwtClaims(t *testing.T, tok string) map[string]any {
	t.Helper()
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		t.Fatal("not a JWT")
	}
	b, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatal(errors.New("bad JWT payload"))
	}
	var c map[string]any
	if err := json.Unmarshal(b, &c); err != nil {
		t.Fatal(err)
	}
	return c
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}
