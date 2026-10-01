package mcp_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/google/uuid"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"

	"anova4all/internal/auth"
	"anova4all/internal/auth/authtest"
	"anova4all/internal/control"
	"anova4all/internal/mcp"
	"anova4all/internal/rest"
	"anova4all/internal/store"
	"anova4all/internal/store/storetest"
	"anova4all/pkg/wifi"
	"anova4all/pkg/wifi/wifitest"
)

// The client id authtest puts in app tokens.
const testClientID = "11111111-2222-3333-4444-555555555555"

type env struct {
	st   *store.Store
	mgr  *wifi.Manager
	ctl  *control.Service
	sign *authtest.Signer
	logs *observer.ObservedLogs
	base string // http://127.0.0.1:port
}

// envOpts override the test signer (for real Supabase tokens) and the generous limits.
type envOpts struct {
	verifier   *auth.Verifier
	authServer string
	limits     *mcp.Limits
	publicURL  string // MCP_PUBLIC_URL; default e.base + "/mcp"
}

// newEnv runs the real REST server with the MCP routes mounted, as main does.
func newEnv(t *testing.T, lim ...mcp.Limits) *env {
	t.Helper()
	var o envOpts
	if len(lim) > 0 {
		o.limits = &lim[0]
	}
	return newEnvWith(t, o)
}

func newEnvWith(t *testing.T, o envOpts) *env {
	t.Helper()
	e := &env{st: storetest.Open(t), sign: authtest.NewSigner(t)}
	core, logs := observer.New(zapcore.DebugLevel)
	e.logs = logs
	log := zap.New(core)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	mgr, err := wifi.NewManager(ctx, "127.0.0.1:0", wifi.Options{Verifier: e.st}, log)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mgr.Close() })
	e.mgr = mgr
	hub := rest.NewHub()
	t.Cleanup(hub.Close)
	e.ctl = control.New(e.st, mgr, control.Options{OnCookChanged: hub.CookChanged}, log)
	verifier, authServer := auth.New(e.sign.Keyfunc(), authtest.Issuer), authtest.Issuer
	if o.verifier != nil {
		verifier, authServer = o.verifier, o.authServer
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	e.base = "http://" + ln.Addr().String()
	limits := mcp.Limits{ReadEvery: time.Millisecond, ReadBurst: 1000, WriteEvery: time.Millisecond, WriteBurst: 1000}
	if o.limits != nil {
		limits = *o.limits
	}
	publicURL := e.base + "/mcp"
	if o.publicURL != "" {
		publicURL = o.publicURL
	}
	routes, err := mcp.New(mcp.Options{
		Control: e.ctl, Verifier: verifier, PublicURL: publicURL, AuthServer: authServer,
		Limits: limits, Logger: log,
	})
	if err != nil {
		t.Fatal(err)
	}
	srv := rest.New(rest.Options{Control: e.ctl, Verifier: verifier, Hub: hub, CORSOrigins: []string{"https://ui.example.test"}, Logger: log})
	for _, r := range routes {
		srv.Handle(r.Path, r.Handler)
	}
	ts := &httptest.Server{Listener: ln, Config: &http.Server{Handler: srv}}
	ts.Start()
	t.Cleanup(ts.Close)
	return e
}

func card() string { return "f0" + strings.ReplaceAll(uuid.NewString(), "-", "")[:22] }

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// paired returns a device owned by owner with a bound fake cooker.
func (e *env) paired(t *testing.T, owner uuid.UUID, st *wifitest.State) (uuid.UUID, string, *wifitest.Conn) {
	t.Helper()
	id := card()
	before := len(e.mgr.Connections(id))
	c := wifitest.Dial(t, e.mgr.Addr().String(), wifitest.Cooker{IDCard: "anova " + id, Key: wifitest.Key0, State: st})
	waitFor(t, "connection", func() bool { return len(e.mgr.Connections(id)) > before })
	d, err := e.ctl.Pair(context.Background(), owner, "anova "+id, wifitest.Key0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { storetest.DeleteDevice(t, d.ID) })
	return d.ID, id, c
}

// cookCmds returns the received commands that change the cooker (not polls or the handshake).
func cookCmds(c *wifitest.Conn) []string {
	var out []string
	for _, m := range c.Received() {
		if strings.HasPrefix(m, "set ") || m == "start" || m == "stop" || m == "start time" || m == "stop time" || m == "clear alarm" {
			out = append(out, m)
		}
	}
	return out
}

// ---- MCP client ----

type bearer struct {
	token string
	base  http.RoundTripper
}

func (b bearer) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	r.Header.Set("Authorization", "Bearer "+b.token)
	return b.base.RoundTrip(r)
}

type client struct {
	t     *testing.T
	cs    *sdk.ClientSession
	tools map[string]*sdk.Tool
}

func (e *env) connect(t *testing.T, token string) (*client, error) {
	t.Helper()
	hc := &http.Client{Transport: bearer{token, http.DefaultTransport}, Timeout: 30 * time.Second}
	c := sdk.NewClient(&sdk.Implementation{Name: "test-client", Version: "0"}, nil)
	cs, err := c.Connect(context.Background(), &sdk.StreamableClientTransport{
		Endpoint: e.base + "/mcp", HTTPClient: hc, MaxRetries: -1, DisableStandaloneSSE: true,
	}, nil)
	if err != nil {
		return nil, err
	}
	t.Cleanup(func() { _ = cs.Close() })
	return &client{t: t, cs: cs, tools: map[string]*sdk.Tool{}}, nil
}

func (e *env) client(t *testing.T, user uuid.UUID) *client {
	t.Helper()
	c, err := e.connect(t, e.sign.App(t, user))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	return c
}

func (c *client) listTools() []*sdk.Tool {
	c.t.Helper()
	res, err := c.cs.ListTools(context.Background(), nil)
	if err != nil {
		c.t.Fatalf("tools/list: %v", err)
	}
	for _, tl := range res.Tools {
		c.tools[tl.Name] = tl
	}
	return res.Tools
}

type result struct {
	text    string
	isError bool
	res     mcp.Result
}

func (r result) code() string {
	if r.res.Error == nil {
		return ""
	}
	return r.res.Error.Code
}

// call calls a tool and checks the result has text plus structured content that matches
// the tool's advertised output schema.
func (c *client) call(name string, args map[string]any) result {
	c.t.Helper()
	if len(c.tools) == 0 {
		c.listTools()
	}
	if args == nil {
		args = map[string]any{}
	}
	res, err := c.cs.CallTool(context.Background(), &sdk.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		c.t.Fatalf("%s: protocol error %v (tool errors must be results)", name, err)
	}
	var out result
	out.isError = res.IsError
	if len(res.Content) != 1 {
		c.t.Fatalf("%s: %d content blocks", name, len(res.Content))
	}
	tc, ok := res.Content[0].(*sdk.TextContent)
	if !ok || tc.Text == "" {
		c.t.Fatalf("%s: no text summary: %#v", name, res.Content[0])
	}
	out.text = tc.Text
	raw, err := json.Marshal(res.StructuredContent)
	if err != nil || res.StructuredContent == nil {
		c.t.Fatalf("%s: no structured content", name)
	}
	if err := json.Unmarshal(raw, &out.res); err != nil {
		c.t.Fatalf("%s: structured content: %v", name, err)
	}
	validate(c.t, name, c.tools[name].OutputSchema, raw)
	if res.IsError != (out.res.Error != nil) {
		c.t.Fatalf("%s: isError %v but error %+v", name, res.IsError, out.res.Error)
	}
	return out
}

func validate(t *testing.T, name string, schema any, raw []byte) {
	t.Helper()
	sb, _ := json.Marshal(schema)
	var s jsonschema.Schema
	if err := json.Unmarshal(sb, &s); err != nil {
		t.Fatalf("%s: output schema: %v", name, err)
	}
	r, err := s.Resolve(nil)
	if err != nil {
		t.Fatalf("%s: resolve output schema: %v", name, err)
	}
	var v any
	_ = json.Unmarshal(raw, &v)
	if err := r.Validate(v); err != nil {
		t.Fatalf("%s: structured content doesn't match outputSchema: %v\n%s", name, err, raw)
	}
}

func wantCode(t *testing.T, r result, code string) {
	t.Helper()
	if !r.isError || r.code() != code {
		t.Fatalf("got isError=%v code=%q (%s), want %q", r.isError, r.code(), r.text, code)
	}
}

func ptr[T any](v T) *T { return &v }

// ---- check 16: auth ----

const initBody = `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}`

func (e *env) post(t *testing.T, path, token, body string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, e.base+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.Copy(io.Discard, res.Body)
	_ = res.Body.Close()
	return res
}

func (e *env) get(t *testing.T, path, token string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, e.base+path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(b)
}

func TestAuthNoTokenPointsToMetadataNamingSupabase(t *testing.T) {
	e := newEnv(t)
	res := e.post(t, "/mcp", "", initBody)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status %d, want 401", res.StatusCode)
	}
	metaURL := e.base + "/.well-known/oauth-protected-resource/mcp"
	if h := res.Header.Get("WWW-Authenticate"); !strings.HasPrefix(h, "Bearer ") || !strings.Contains(h, `resource_metadata="`+metaURL+`"`) {
		t.Fatalf("WWW-Authenticate %q", h)
	}

	for _, p := range []string{"/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"} {
		code, body := e.get(t, p, "")
		if code != http.StatusOK {
			t.Fatalf("%s: %d", p, code)
		}
		var m struct {
			Resource             string   `json:"resource"`
			AuthorizationServers []string `json:"authorization_servers"`
		}
		if err := json.Unmarshal([]byte(body), &m); err != nil {
			t.Fatal(err)
		}
		if m.Resource != e.base+"/mcp" || len(m.AuthorizationServers) != 1 || m.AuthorizationServers[0] != authtest.Issuer {
			t.Fatalf("%s: metadata %+v", p, m)
		}
	}
}

// Behind the tunnel the server listens on loopback but requests carry the public Host. The
// SDK's DNS-rebinding guard refused them all with 403; only the public host and loopback
// names may pass.
func TestPublicHostAcceptedOnLoopbackListener(t *testing.T) {
	e := newEnvWith(t, envOpts{publicURL: "https://anova.example.test/mcp"})
	tok := e.sign.App(t, uuid.New())
	for host, want := range map[string]int{
		"anova.example.test":           http.StatusOK,
		"localhost":                    http.StatusOK,
		"ANOVA.example.test:443":       http.StatusOK,
		"127.0.0.1:8000":               http.StatusOK,
		"[::1]:8000":                   http.StatusOK,
		"evil.example.test":            http.StatusForbidden,
		"anova.example.test.evil.test": http.StatusForbidden,
		"192.168.1.208":                http.StatusForbidden,
		"localhost.evil.test":          http.StatusForbidden,
	} {
		req, _ := http.NewRequest(http.MethodPost, e.base+"/mcp", strings.NewReader(initBody))
		req.Host = host
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json, text/event-stream")
		req.Header.Set("Authorization", "Bearer "+tok)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_ = res.Body.Close()
		if res.StatusCode != want {
			t.Errorf("Host %s: status %d, want %d", host, res.StatusCode, want)
		}
	}
}

func TestAuthTokenSurfaces(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")

	// Browser token: REST yes, MCP no.
	browser := e.sign.Browser(t, alice)
	if code, _ := e.get(t, "/api/devices", browser); code != http.StatusOK {
		t.Fatalf("browser token on REST: %d", code)
	}
	if res := e.post(t, "/mcp", browser, initBody); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("browser token on /mcp: %d", res.StatusCode)
	}
	if _, err := e.connect(t, browser); err == nil {
		t.Fatal("MCP client connected with a browser token")
	}

	// App token: MCP yes, REST no.
	app := e.sign.App(t, alice)
	c, err := e.connect(t, app)
	if err != nil {
		t.Fatalf("app token on /mcp: %v", err)
	}
	if r := c.call(mcp.ToolStatus, nil); r.isError {
		t.Fatalf("status with app token: %s", r.text)
	}
	if code, _ := e.get(t, "/api/devices", app); code != http.StatusUnauthorized {
		t.Fatalf("app token on REST: %d", code)
	}

	// client_id with aud=authenticated: neither.
	mixed := authtest.Claims(alice, "authenticated")
	mixed["client_id"] = testClientID
	tok := e.sign.Sign(t, mixed)
	if res := e.post(t, "/mcp", tok, initBody); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("client_id+authenticated on /mcp: %d", res.StatusCode)
	}
	if code, _ := e.get(t, "/api/devices", tok); code != http.StatusUnauthorized {
		t.Fatalf("client_id+authenticated on REST: %d", code)
	}

	// App audience without client_id, expired app token, and a foreign key: refused on /mcp.
	noClient := e.sign.Sign(t, authtest.Claims(alice, auth.AppAudience))
	expired := authtest.Claims(alice, auth.AppAudience)
	expired["client_id"] = testClientID
	expired["exp"] = time.Now().Add(-time.Hour).Unix()
	other := authtest.NewSigner(t).App(t, alice)
	for name, tok := range map[string]string{"no client_id": noClient, "expired": e.sign.Sign(t, expired), "foreign key": other} {
		if res := e.post(t, "/mcp", tok, initBody); res.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s on /mcp: %d", name, res.StatusCode)
		}
	}
}

// ---- check 17: tools ----

func TestToolsListHintsAndCardMeta(t *testing.T) {
	e := newEnv(t)
	c := e.client(t, storetest.User(t, "alice"))
	tools := c.listTools()
	type hints struct{ readOnly, idempotent bool }
	want := map[string]hints{
		mcp.ToolStatus: {true, true},
		mcp.ToolStart:  {false, false},
		mcp.ToolUpdate: {false, true},
		mcp.ToolStop:   {false, true},
	}
	if len(tools) != len(want) {
		t.Fatalf("%d tools, want %d", len(tools), len(want))
	}
	for _, tl := range tools {
		w, ok := want[tl.Name]
		if !ok {
			t.Fatalf("unexpected tool %q", tl.Name)
		}
		a := tl.Annotations
		if a == nil || a.ReadOnlyHint != w.readOnly || a.IdempotentHint != w.idempotent {
			t.Fatalf("%s annotations %+v, want %+v", tl.Name, a, w)
		}
		if a.DestructiveHint != nil {
			t.Fatalf("%s sets destructiveHint; it must stay at its default", tl.Name)
		}
		if tl.Description == "" || tl.InputSchema == nil || tl.OutputSchema == nil {
			t.Fatalf("%s lacks description or schemas", tl.Name)
		}
		// check 18: the card is linked (plus the legacy key).
		ui, _ := tl.Meta["ui"].(map[string]any)
		if ui == nil || ui["resourceUri"] != mcp.CardURI || tl.Meta["ui/resourceUri"] != mcp.CardURI {
			t.Fatalf("%s _meta %v", tl.Name, tl.Meta)
		}
	}
	// The start schema carries the ranges.
	sb, _ := json.Marshal(c.tools[mcp.ToolStart].InputSchema)
	for _, s := range []string{`"required":["temperature","unit"]`, `"maximum":6000`, `"minimum":25`, `"maximum":211`, `"enum":["c","f"]`} {
		if !strings.Contains(string(sb), s) {
			t.Fatalf("start input schema lacks %s: %s", s, sb)
		}
	}
}

func TestStatusListsOnlyCallersCookersAndSendsNoCommands(t *testing.T) {
	e := newEnv(t)
	alice, eve := storetest.User(t, "alice"), storetest.User(t, "eve")
	aDev, _, aConn := e.paired(t, alice, &wifitest.State{Status: "running", Temp: 56.5, SetTemp: 57, Unit: "c", TimerMinutes: 42, TimerRunning: true})
	eDev, _, eConn := e.paired(t, eve, nil)
	// Wait until the cached state reflects the fake cooker.
	waitFor(t, "cached state", func() bool {
		ds, err := e.ctl.Status(context.Background(), alice, aDev)
		return err == nil && ds.State != nil && ds.State.Status == "running" && ds.State.TimerRunning
	})
	keysBefore := aConn.Count("get number") + eConn.Count("get number")

	ac := e.client(t, alice)
	r := ac.call(mcp.ToolStatus, nil)
	if r.isError || len(r.res.Devices) != 1 || r.res.Devices[0].ID != aDev {
		t.Fatalf("alice sees %+v (%s)", r.res.Devices, r.text)
	}
	if !strings.Contains(r.text, "heating to 57.0 °C") || !strings.Contains(r.text, "42 min left") {
		t.Fatalf("summary %q", r.text)
	}
	r = ac.call(mcp.ToolStatus, map[string]any{"device_id": aDev.String()})
	if r.isError || len(r.res.Devices) != 1 || r.res.Devices[0].ID != aDev {
		t.Fatalf("alice by id: %+v", r.res)
	}
	wantCode(t, ac.call(mcp.ToolStatus, map[string]any{"device_id": eDev.String()}), "not_member")
	wantCode(t, ac.call(mcp.ToolStatus, map[string]any{"device_id": "not-a-uuid"}), "not_member")

	ec := e.client(t, eve)
	r = ec.call(mcp.ToolStatus, nil)
	if r.isError || len(r.res.Devices) != 1 || r.res.Devices[0].ID != eDev {
		t.Fatalf("eve sees %+v", r.res.Devices)
	}

	if got := append(cookCmds(aConn), cookCmds(eConn)...); len(got) != 0 {
		t.Fatalf("status sent cooker commands %v", got)
	}
	if n := aConn.Count("get number") + eConn.Count("get number"); n != keysBefore {
		t.Fatal("status read the cooker key")
	}

	// No cookers: an empty list, not an error.
	r = e.client(t, storetest.User(t, "bob")).call(mcp.ToolStatus, nil)
	if r.isError || r.res.Devices == nil || len(r.res.Devices) != 0 || !strings.Contains(r.text, "no cookers") {
		t.Fatalf("bob: %+v %q", r.res, r.text)
	}
}

func TestCookToolsGoThroughControl(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, conn := e.paired(t, alice, nil)
	c := e.client(t, alice)

	// device_id is optional with a single cooker.
	r := c.call(mcp.ToolStart, map[string]any{"temperature": 57, "unit": "c", "minutes": 60, "auto_stop": true})
	if r.isError {
		t.Fatalf("start: %s", r.text)
	}
	want := []string{"set temp 57.0", "set timer 60", "start", "start time"}
	if got := cookCmds(conn); strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("commands %v, want %v", got, want)
	}
	if len(r.res.Devices) != 1 || r.res.Devices[0].ID != dev || r.res.Devices[0].Cook == nil || !r.res.Devices[0].Cook.AutoStop {
		t.Fatalf("start result %+v", r.res.Devices)
	}
	if n := storetest.Count(t, `select count(*) from public.cooks where device_id = $1 and ended_at is null and auto_stop`, dev); n != 1 {
		t.Fatalf("%d open auto-stop cooks", n)
	}

	wantCode(t, c.call(mcp.ToolStart, map[string]any{"device_id": dev.String(), "temperature": 60, "unit": "c"}), "cook_in_progress")

	before := len(cookCmds(conn))
	r = c.call(mcp.ToolUpdate, map[string]any{"device_id": dev.String(), "minutes": 30})
	if r.isError {
		t.Fatalf("update: %s", r.text)
	}
	if got := cookCmds(conn)[before:]; strings.Join(got, ",") != "set timer 30,start time" {
		t.Fatalf("update commands %v", got)
	}

	before = len(cookCmds(conn))
	r = c.call(mcp.ToolStop, map[string]any{"device_id": dev.String()})
	if r.isError {
		t.Fatalf("stop: %s", r.text)
	}
	if got := cookCmds(conn)[before:]; strings.Join(got, ",") != "stop,stop time,clear alarm" {
		t.Fatalf("stop commands %v", got)
	}
	if n := storetest.Count(t, `select count(*) from public.cooks where device_id = $1 and end_reason = 'stopped'`, dev); n != 1 {
		t.Fatal("cook not closed as stopped")
	}
	// Stop is idempotent: again works and closes nothing new.
	if r := c.call(mcp.ToolStop, nil); r.isError {
		t.Fatalf("second stop: %s", r.text)
	}

	wantCode(t, c.call(mcp.ToolUpdate, map[string]any{"temperature": 60, "unit": "c"}), "no_active_cook")

	// invalid_input comes from control's validation, with the same code as REST.
	before = len(cookCmds(conn))
	for name, args := range map[string]map[string]any{
		"auto_stop without minutes": {"temperature": 57, "unit": "c", "auto_stop": true},
		"too hot":                   {"temperature": 101, "unit": "c"},
		"too cold °F":               {"temperature": 76, "unit": "f"},
		"bad unit":                  {"temperature": 57, "unit": "k"},
		"too long":                  {"temperature": 57, "unit": "c", "minutes": 6001},
		"no temperature":            {"unit": "c"},
		"wrong type":                {"temperature": "hot", "unit": "c"},
		"unknown field":             {"temperature": 57, "unit": "c", "speed": 3},
	} {
		r := c.call(mcp.ToolStart, args)
		if r.code() != "invalid_input" || !strings.HasPrefix(r.text, "Invalid input: ") {
			t.Fatalf("%s: %q %q", name, r.code(), r.text)
		}
	}
	wantCode(t, c.call(mcp.ToolUpdate, map[string]any{"temperature": 57}), "invalid_input")
	if got := cookCmds(conn)[before:]; len(got) != 0 {
		t.Fatalf("invalid input sent %v", got)
	}

	// Another user can't touch it.
	eve := storetest.User(t, "eve")
	ec := e.client(t, eve)
	cook := map[string]any{"device_id": dev.String(), "temperature": 57, "unit": "c"}
	wantCode(t, ec.call(mcp.ToolStart, cook), "not_member")
	wantCode(t, ec.call(mcp.ToolUpdate, cook), "not_member")
	wantCode(t, ec.call(mcp.ToolStop, map[string]any{"device_id": dev.String()}), "not_member")
	wantCode(t, ec.call(mcp.ToolStatus, map[string]any{"device_id": dev.String()}), "not_member")
	if got := cookCmds(conn)[before:]; len(got) != 0 {
		t.Fatalf("another user's calls sent %v", got)
	}
	wantCode(t, ec.call(mcp.ToolStop, nil), "no_cookers")
}

func TestCookToolErrorsOfflineAndDeviceSelection(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	d1, id1, conn1 := e.paired(t, alice, nil)
	d2, _, _ := e.paired(t, alice, nil)
	c := e.client(t, alice)

	r := c.call(mcp.ToolStart, map[string]any{"temperature": 57, "unit": "c"})
	wantCode(t, r, "device_required")
	if len(r.res.Devices) != 2 || !strings.Contains(r.text, d1.String()) || !strings.Contains(r.text, d2.String()) {
		t.Fatalf("device_required lists %+v %q", r.res.Devices, r.text)
	}

	_ = conn1.Close()
	waitFor(t, "unbound", func() bool { _, ok := e.mgr.Bound(id1); return !ok })
	r = c.call(mcp.ToolStart, map[string]any{"device_id": d1.String(), "temperature": 57, "unit": "c"})
	wantCode(t, r, "device_offline")
	if !strings.Contains(r.text, "powered and on Wi-Fi") {
		t.Fatalf("offline text %q", r.text)
	}
	r = c.call(mcp.ToolStatus, map[string]any{"device_id": d1.String()})
	if r.isError || r.res.Devices[0].Online || !strings.Contains(r.text, "offline") {
		t.Fatalf("offline status %+v %q", r.res, r.text)
	}
}

func TestRateLimits(t *testing.T) {
	e := newEnv(t, mcp.Limits{}) // the defaults: reads 2/s burst 10, writes 10/min burst 5
	alice := storetest.User(t, "alice")
	c := e.client(t, alice)

	for i := 0; i < 5; i++ { // writes: the burst of 5 is spent (no cookers, so each is a quick tool error)
		if r := c.call(mcp.ToolStop, nil); r.code() != "no_cookers" {
			t.Fatalf("write %d: %q", i, r.code())
		}
	}
	r := c.call(mcp.ToolStop, nil)
	wantCode(t, r, "rate_limited")
	if r.res.Error.RetryAfterSeconds < 1 || !strings.Contains(r.text, "Wait") {
		t.Fatalf("rate_limited result %+v %q", r.res.Error, r.text)
	}

	// Reads have their own bucket: the first 10 pass, then rate_limited.
	limited := false
	for i := 0; i < 30 && !limited; i++ {
		r := c.call(mcp.ToolStatus, nil)
		switch {
		case r.code() == "rate_limited":
			if i < 10 {
				t.Fatalf("read %d limited inside the burst", i)
			}
			limited = true
		case r.isError:
			t.Fatalf("read %d: %s", i, r.text)
		}
	}
	if !limited {
		t.Fatal("reads never rate limited")
	}

	// Limits are per user.
	if r := e.client(t, storetest.User(t, "bob")).call(mcp.ToolStop, nil); r.code() != "no_cookers" {
		t.Fatalf("bob limited by alice: %q", r.code())
	}
}

func TestAuditLogHasUserAndClientNeverToken(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	token := e.sign.App(t, alice)
	c, err := e.connect(t, token)
	if err != nil {
		t.Fatal(err)
	}
	c.call(mcp.ToolStatus, nil)
	c.call(mcp.ToolStart, map[string]any{"temperature": 57, "unit": "c"})
	_ = e.post(t, "/mcp", e.sign.Browser(t, alice), initBody) // refused, logged at debug

	calls := e.logs.FilterMessage("tool call").All()
	if len(calls) != 2 {
		t.Fatalf("%d tool call lines, want 2", len(calls))
	}
	outcomes := map[string]string{}
	for _, l := range calls {
		f := l.ContextMap()
		if f["user"] != alice.String() || f["client"] != testClientID {
			t.Fatalf("audit line %v", f)
		}
		if _, ok := f["took"]; !ok {
			t.Fatalf("no duration: %v", f)
		}
		outcomes[f["tool"].(string)] = f["outcome"].(string)
	}
	if outcomes[mcp.ToolStatus] != "ok" || outcomes[mcp.ToolStart] != "no_cookers" {
		t.Fatalf("outcomes %v", outcomes)
	}
	sig := token[strings.LastIndex(token, ".")+1:]
	for _, l := range e.logs.All() {
		line := l.Message + fmt.Sprint(l.ContextMap())
		if strings.Contains(line, sig) || strings.Contains(line, "Bearer") || strings.Contains(line, "eyJ") {
			t.Fatalf("log leaks a token: %s", line)
		}
	}
}

// ---- check 18: the card resource ----

func TestCardResource(t *testing.T) {
	e := newEnv(t)
	c := e.client(t, storetest.User(t, "alice"))
	list, err := c.cs.ListResources(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(list.Resources) != 1 || list.Resources[0].URI != mcp.CardURI || list.Resources[0].MIMEType != "text/html;profile=mcp-app" {
		t.Fatalf("resources %+v", list.Resources)
	}
	res, err := c.cs.ReadResource(context.Background(), &sdk.ReadResourceParams{URI: mcp.CardURI})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Contents) != 1 || res.Contents[0].MIMEType != "text/html;profile=mcp-app" || res.Contents[0].URI != mcp.CardURI {
		t.Fatalf("contents %+v", res.Contents)
	}
	if res.Contents[0].Text != mcp.CardHTML() || !strings.Contains(res.Contents[0].Text, "<html") {
		t.Fatal("served card is not the embedded card HTML")
	}
}
