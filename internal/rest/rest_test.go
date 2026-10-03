package rest_test

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"

	"anova4all/internal/auth"
	"anova4all/internal/auth/authtest"
	"anova4all/internal/control"
	"anova4all/internal/rest"
	"anova4all/internal/store"
	"anova4all/internal/store/storetest"
	"anova4all/pkg/wifi"
	"anova4all/pkg/wifi/wifitest"
)

const origin = "https://ui.example.test"

type env struct {
	st   *store.Store
	mgr  *wifi.Manager
	ctl  *control.Service
	hub  *rest.Hub
	srv  *rest.Server
	http *httptest.Server
	sign *authtest.Signer
	logs *observer.ObservedLogs
}

func newEnv(t *testing.T) *env {
	t.Helper()
	e := &env{st: storetest.Open(t), hub: rest.NewHub(), sign: authtest.NewSigner(t)}
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
	e.ctl = control.New(e.st, mgr, control.Options{
		OnCookChanged: e.hub.CookChanged,
		OnPaired:      func(d store.Device) { e.hub.Repaired(d.IDCard, d.ID) },
	}, log)
	e.srv = rest.New(rest.Options{
		Control:     e.ctl,
		Verifier:    auth.New(e.sign.Keyfunc(), authtest.Issuer),
		Hub:         e.hub,
		CORSOrigins: []string{origin},
		PublicHost:  "203.0.113.7",
		PublicPort:  8080,
		Cookers:     mgr.BoundCount,
		PingEvery:   200 * time.Millisecond,
		Logger:      log,
	})
	e.http = httptest.NewServer(e.srv)
	t.Cleanup(e.http.Close)
	t.Cleanup(e.hub.Close)
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

func (e *env) dial(t *testing.T, id, key string) *wifitest.Conn {
	t.Helper()
	before := len(e.mgr.Connections(id))
	c := wifitest.Dial(t, e.mgr.Addr().String(), wifitest.Cooker{IDCard: "anova " + id, Key: key})
	waitFor(t, "connection", func() bool { return len(e.mgr.Connections(id)) > before })
	return c
}

func (e *env) paired(t *testing.T, owner uuid.UUID) (uuid.UUID, string, *wifitest.Conn) {
	t.Helper()
	id := card()
	c := e.dial(t, id, wifitest.Key0)
	d, err := e.ctl.Pair(context.Background(), owner, id, wifitest.Key0)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { storetest.DeleteDevice(t, d.ID) })
	return d.ID, id, c
}

type resp struct {
	status int
	header http.Header
	body   string
}

func (r resp) code() string {
	var b struct {
		Error struct{ Code string } `json:"error"`
	}
	_ = json.Unmarshal([]byte(r.body), &b)
	return b.Error.Code
}

func (e *env) do(t *testing.T, method, path, token, body string, hdr ...string) resp {
	t.Helper()
	req, _ := http.NewRequest(method, e.http.URL+path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for i := 0; i+1 < len(hdr); i += 2 {
		req.Header.Set(hdr[i], hdr[i+1])
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return resp{res.StatusCode, res.Header, string(b)}
}

func TestEveryAPIRouteRefusesBadTokens(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	other := authtest.NewSigner(t)
	hs := func() string {
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, authtest.Claims(alice, "authenticated"))
		tok.Header["kid"] = "test"
		s, _ := tok.SignedString([]byte("not-a-real-secret-0000000000000000"))
		return s
	}()
	claims := func(mut func(jwt.MapClaims)) string {
		c := authtest.Claims(alice, "authenticated")
		mut(c)
		return e.sign.Sign(t, c)
	}
	bad := map[string]string{
		"none":         "",
		"garbage":      "not.a.jwt",
		"wrong key":    other.Sign(t, authtest.Claims(alice, "authenticated")),
		"HS256":        hs,
		"expired":      claims(func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Minute).Unix() }),
		"wrong aud":    claims(func(c jwt.MapClaims) { c["aud"] = "something-else" }),
		"two auds":     claims(func(c jwt.MapClaims) { c["aud"] = []string{"authenticated", "anova4all-mcp"} }),
		"wrong issuer": claims(func(c jwt.MapClaims) { c["iss"] = "http://evil.test/auth/v1" }),
		"anonymous":    claims(func(c jwt.MapClaims) { c["is_anonymous"] = true }),
		"client_id":    claims(func(c jwt.MapClaims) { c["client_id"] = "11111111-2222-3333-4444-555555555555" }),
		"app token":    e.sign.App(t, alice),
		"role anon":    claims(func(c jwt.MapClaims) { c["role"] = "anon" }),
		"no subject":   claims(func(c jwt.MapClaims) { delete(c, "sub") }),
		"bad subject":  claims(func(c jwt.MapClaims) { c["sub"] = "not-a-uuid" }),
	}
	dev := uuid.NewString()
	routes := [][2]string{
		{"GET", "/api/server-info"},
		{"GET", "/api/devices"},
		{"POST", "/api/devices/pair"},
		{"GET", "/api/devices/" + dev},
		{"GET", "/api/devices/" + dev + "/events"},
		{"POST", "/api/devices/" + dev + "/cook"},
		{"PATCH", "/api/devices/" + dev + "/cook"},
		{"POST", "/api/devices/" + dev + "/cook/stop"},
	}
	for _, r := range routes {
		for name, tok := range bad {
			got := e.do(t, r[0], r[1], tok, "{}")
			if got.status != http.StatusUnauthorized || got.code() != "unauthorized" {
				t.Errorf("%s %s with %s: %d %s", r[0], r[1], name, got.status, got.body)
			}
		}
		got := e.do(t, r[0], r[1], e.sign.Browser(t, alice), "{}")
		if got.status == http.StatusUnauthorized {
			t.Errorf("%s %s refused a valid browser token", r[0], r[1])
		}
	}
	// One-element aud arrays (what Supabase sends) are fine.
	tok := claims(func(c jwt.MapClaims) { c["aud"] = []string{"authenticated"} })
	if got := e.do(t, "GET", "/api/devices", tok, ""); got.status != http.StatusOK {
		t.Fatalf("array aud: %d %s", got.status, got.body)
	}
}

func TestAccessAndTypedErrors(t *testing.T) {
	e := newEnv(t)
	alice, eve := storetest.User(t, "alice"), storetest.User(t, "eve")
	dev, _, _ := e.paired(t, alice)
	at, et := e.sign.Browser(t, alice), e.sign.Browser(t, eve)

	for _, r := range [][3]string{
		{"GET", "/api/devices/" + dev.String(), ""},
		{"GET", "/api/devices/" + dev.String() + "/events", ""},
		{"POST", "/api/devices/" + dev.String() + "/cook", `{"temperature":57,"unit":"c"}`},
		{"PATCH", "/api/devices/" + dev.String() + "/cook", `{"minutes":5}`},
		{"POST", "/api/devices/" + dev.String() + "/cook/stop", ""},
		{"GET", "/api/devices/not-a-uuid", ""},
	} {
		got := e.do(t, r[0], r[1], et, r[2])
		if got.status != http.StatusForbidden || got.code() != "not_member" {
			t.Errorf("eve %s %s: %d %s", r[0], r[1], got.status, got.body)
		}
	}
	var list struct{ Devices []control.DeviceStatus }
	if got := e.do(t, "GET", "/api/devices", et, ""); json.Unmarshal([]byte(got.body), &list) != nil || len(list.Devices) != 0 {
		t.Fatalf("eve lists %s", got.body)
	}

	cases := []struct {
		method, path, body string
		status             int
		code               string
	}{
		{"POST", "/cook", `{"temperature":57,"unit":"c","extra":1}`, 400, "invalid_input"},
		{"POST", "/cook", `{"temperature":`, 400, "invalid_input"},
		{"POST", "/cook", `{"temperature":120,"unit":"c"}`, 400, "invalid_input"},
		{"PATCH", "/cook", `{"minutes":5}`, 409, "no_active_cook"},
		{"POST", "/cook", `{"temperature":57,"unit":"c","minutes":30,"auto_stop":true}`, 200, ""},
		{"POST", "/cook", `{"temperature":57,"unit":"c"}`, 409, "cook_in_progress"},
		{"PATCH", "/cook", `{"temperature":58,"unit":"c"}`, 200, ""},
		{"POST", "/cook/stop", ``, 200, ""},
	}
	for _, c := range cases {
		got := e.do(t, c.method, "/api/devices/"+dev.String()+c.path, at, c.body)
		if got.status != c.status || got.code() != c.code {
			t.Errorf("%s %s %s: %d %s", c.method, c.path, c.body, got.status, got.body)
		}
	}
	big := `{"temperature":57,"unit":"c","x":"` + strings.Repeat("a", 5000) + `"}`
	if got := e.do(t, "POST", "/api/devices/"+dev.String()+"/cook", at, big); got.status != 400 {
		t.Errorf("oversized body: %d", got.status)
	}
	if got := e.do(t, "GET", "/nope", "", ""); got.status != 404 || got.code() != "not_found" {
		t.Errorf("unknown route: %d %s", got.status, got.body)
	}

	var ds control.DeviceStatus
	got := e.do(t, "GET", "/api/devices/"+dev.String(), at, "")
	if err := json.Unmarshal([]byte(got.body), &ds); err != nil || !ds.IsOwner || !ds.Online || ds.State == nil {
		t.Fatalf("status %s", got.body)
	}
}

func TestOfflineDevice(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, id, c := e.paired(t, alice)
	_ = c.Close()
	waitFor(t, "offline", func() bool { _, ok := e.mgr.Bound(id); return !ok })
	at := e.sign.Browser(t, alice)
	got := e.do(t, "POST", "/api/devices/"+dev.String()+"/cook/stop", at, "")
	if got.status != 409 || got.code() != "device_offline" {
		t.Fatalf("%d %s", got.status, got.body)
	}
	got = e.do(t, "GET", "/api/devices/"+dev.String(), at, "")
	if got.status != 200 || strings.Contains(got.body, `"state"`) || !strings.Contains(got.body, `"online":false`) {
		t.Fatalf("%d %s", got.status, got.body)
	}
}

func TestPairOverHTTP(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	at := e.sign.Browser(t, alice)
	id := card()

	got := e.do(t, "POST", "/api/devices/pair", at, `{"id_card":"`+id+`","key":"testkey000"}`)
	if got.status != 409 || got.code() != "device_offline" {
		t.Fatalf("no connection: %d %s", got.status, got.body)
	}
	time.Sleep(time.Second) // refill the limiter
	e.dial(t, id, wifitest.Key0)
	got = e.do(t, "POST", "/api/devices/pair", at, `{"id_card":"`+id+`","key":"testkey111"}`)
	if got.status != 409 || got.code() != "key_mismatch" {
		t.Fatalf("wrong key: %d %s", got.status, got.body)
	}
	time.Sleep(time.Second)
	got = e.do(t, "POST", "/api/devices/pair", at, `{"id_card":"anova `+id+`","key":"testkey000"}`)
	var d struct {
		ID   uuid.UUID
		Name string
	}
	if got.status != 200 || json.Unmarshal([]byte(got.body), &d) != nil || d.ID == uuid.Nil {
		t.Fatalf("pair: %d %s", got.status, got.body)
	}
	t.Cleanup(func() { storetest.DeleteDevice(t, d.ID) })
	if _, ok := e.mgr.Bound(id); !ok {
		t.Fatal("not bound")
	}

	// Hammering is limited (1/s, burst 2).
	limited := false
	for i := 0; i < 4; i++ {
		if e.do(t, "POST", "/api/devices/pair", at, `{"id_card":"x","key":"y"}`).code() == "rate_limited" {
			limited = true
		}
	}
	if !limited {
		t.Fatal("pair not rate limited")
	}
}

func TestCORSAllowList(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	at := e.sign.Browser(t, alice)

	got := e.do(t, "GET", "/api/devices", at, "", "Origin", origin)
	if got.header.Get("Access-Control-Allow-Origin") != origin {
		t.Fatalf("listed origin: %v", got.header)
	}
	pre := e.do(t, "OPTIONS", "/api/devices", "", "", "Origin", origin, "Access-Control-Request-Method", "GET", "Access-Control-Request-Headers", "authorization")
	if pre.status >= 300 || pre.header.Get("Access-Control-Allow-Origin") != origin {
		t.Fatalf("preflight: %d %v", pre.status, pre.header)
	}
	for _, o := range []string{"https://evil.example.test", "https://ui.example.test.evil.test", "null"} {
		got := e.do(t, "GET", "/api/devices", at, "", "Origin", o)
		if v := got.header.Get("Access-Control-Allow-Origin"); v != "" {
			t.Errorf("unlisted origin %s got %q", o, v)
		}
	}
}

func TestHealthAndServerInfo(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	e.paired(t, alice)
	if got := e.do(t, "GET", "/health", "", ""); got.status != 200 || strings.TrimSpace(got.body) != `{"cookers":1}` {
		t.Fatalf("health: %d %s", got.status, got.body)
	}
	got := e.do(t, "GET", "/api/server-info", e.sign.Browser(t, alice), "")
	if got.status != 200 || strings.TrimSpace(got.body) != `{"host":"203.0.113.7","port":8080}` {
		t.Fatalf("server-info: %d %s", got.status, got.body)
	}
}

// ---- SSE ----

type event struct{ name, data string }

type stream struct {
	events chan event
	closed chan struct{}
	cancel func()
}

func (e *env) stream(t *testing.T, dev uuid.UUID, token string) *stream {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", e.http.URL+"/api/devices/"+dev.String()+"/events", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	if res.StatusCode != 200 || res.Header.Get("Content-Type") != "text/event-stream" {
		cancel()
		t.Fatalf("events: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
	s := &stream{events: make(chan event, 64), closed: make(chan struct{}), cancel: cancel}
	t.Cleanup(cancel)
	go func() {
		defer close(s.closed)
		defer res.Body.Close()
		sc := bufio.NewScanner(res.Body)
		var ev event
		for sc.Scan() {
			line := sc.Text()
			switch {
			case strings.HasPrefix(line, "event: "):
				ev.name = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				ev.data = strings.TrimPrefix(line, "data: ")
			case line == "" && ev.name != "":
				select {
				case s.events <- ev:
				case <-ctx.Done():
					return
				}
				ev = event{}
			}
		}
	}()
	return s
}

func (s *stream) next(t *testing.T) event {
	t.Helper()
	select {
	case ev := <-s.events:
		return ev
	case <-s.closed:
		t.Fatal("stream closed")
	case <-time.After(5 * time.Second):
		t.Fatal("no event")
	}
	return event{}
}

func (s *stream) status(t *testing.T) control.DeviceStatus {
	t.Helper()
	ev := s.next(t)
	if ev.name != "status" {
		t.Fatalf("got %s %s, want status", ev.name, ev.data)
	}
	var ds control.DeviceStatus
	if err := json.Unmarshal([]byte(ev.data), &ds); err != nil {
		t.Fatal(err)
	}
	return ds
}

func (s *stream) waitClosed(t *testing.T, within time.Duration) {
	t.Helper()
	deadline := time.After(within)
	for {
		select {
		case <-s.events:
		case <-s.closed:
			return
		case <-deadline:
			t.Fatal("stream still open")
		}
	}
}

func TestEventsStream(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, id, _ := e.paired(t, alice)
	s := e.stream(t, dev, e.sign.Browser(t, alice))

	first := s.status(t)
	if !first.Online || first.State == nil || first.ID != dev {
		t.Fatalf("first event %+v", first)
	}

	// Identical states send nothing; the next distinct one comes through.
	same := *first.State
	e.hub.State(id, &same)
	e.hub.State(id, &same)
	changed := same
	changed.CurrentTemperature = 42.5
	e.hub.State(id, &changed)
	if ds := s.status(t); ds.State == nil || ds.State.CurrentTemperature != 42.5 {
		t.Fatalf("got %+v, want the changed state", ds.State)
	}

	// Offline.
	e.hub.State(id, nil)
	if ds := s.status(t); ds.Online || ds.State != nil {
		t.Fatalf("offline event %+v", ds)
	}
	e.hub.State(id, &changed)
	if ds := s.status(t); !ds.Online {
		t.Fatal("online again not sent")
	}

	// A cook start/stop through the API: cook_ended then status.
	at := e.sign.Browser(t, alice)
	if got := e.do(t, "POST", "/api/devices/"+dev.String()+"/cook", at, `{"temperature":57,"unit":"c","minutes":30,"auto_stop":true}`); got.status != 200 {
		t.Fatalf("start: %s", got.body)
	}
	if ds := s.status(t); ds.Cook == nil || !ds.Cook.AutoStop {
		t.Fatalf("cook not in status: %+v", ds.Cook)
	}
	if got := e.do(t, "POST", "/api/devices/"+dev.String()+"/cook/stop", at, ""); got.status != 200 {
		t.Fatalf("stop: %s", got.body)
	}
	if ev := s.next(t); ev.name != "cook_ended" || ev.data != `{"reason":"stopped"}` {
		t.Fatalf("got %s %s", ev.name, ev.data)
	}
	if ds := s.status(t); ds.Cook == nil || ds.Cook.EndReason == nil || *ds.Cook.EndReason != "stopped" {
		t.Fatalf("ended cook not in status: %+v", ds.Cook)
	}
}

func TestEventsStreamClosesOnLostAccess(t *testing.T) {
	e := newEnv(t)
	alice, bob := storetest.User(t, "alice"), storetest.User(t, "bob")
	dev, id, _ := e.paired(t, alice)
	storetest.AddMember(t, dev, bob)
	bt := e.sign.Browser(t, bob)

	s := e.stream(t, dev, bt)
	s.status(t)
	storetest.RemoveMember(t, dev, bob)
	s.waitClosed(t, 2*time.Second) // within one ping (200 ms here)
	if got := e.do(t, "GET", "/api/devices/"+dev.String()+"/events", bt, ""); got.status != 403 || got.code() != "not_member" {
		t.Fatalf("reconnect: %d %s", got.status, got.body)
	}

	// Re-pair to a new owner kicks the old row's streams at once.
	at := e.sign.Browser(t, alice)
	s = e.stream(t, dev, at)
	s.status(t)
	eve := storetest.User(t, "eve")
	e.dial(t, id, wifitest.Key1)
	d, err := e.ctl.Pair(context.Background(), eve, id, wifitest.Key1)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { storetest.DeleteDevice(t, d.ID) })
	s.waitClosed(t, time.Second)
}

func TestEventsStreamsDisconnectingDuringBroadcast(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, id, _ := e.paired(t, alice)
	at := e.sign.Browser(t, alice)
	stop := make(chan struct{})
	go func() {
		for i := 0; ; i++ {
			select {
			case <-stop:
				return
			default:
				e.hub.State(id, &wifi.DeviceState{CurrentTemperature: float64(i % 100)})
				time.Sleep(50 * time.Microsecond)
			}
		}
	}()
	defer close(stop)
	for i := 0; i < 20; i++ {
		s := e.stream(t, dev, at)
		s.status(t)
		s.cancel()
		<-s.closed
	}
}

// ---- logs ----

func TestLogsNeverContainTokensOrKeys(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, _ := e.paired(t, alice)
	at := e.sign.Browser(t, alice)
	e.srv.GET("/api/boom", func(c *gin.Context) { panic("boom") })

	if got := e.do(t, "GET", "/api/boom", at, ""); got.status != 500 || got.code() != "internal" {
		t.Fatalf("panic route: %d %s", got.status, got.body)
	}
	e.do(t, "POST", "/api/devices/pair", at, `{"id_card":"`+card()+`","key":"testkey111"}`)
	e.do(t, "GET", "/api/devices", e.sign.Sign(t, authtest.Claims(alice, "wrong")), "")
	e.do(t, "POST", "/api/devices/"+dev.String()+"/cook", at, `{"temperature":57,"unit":"c"}`)

	if e.logs.FilterMessage("panic").Len() != 1 {
		t.Fatal("panic not logged")
	}
	for _, entry := range e.logs.All() {
		line := entry.Message
		for k, v := range entry.ContextMap() {
			line += " " + k + "=" + toString(v)
		}
		for _, secret := range []string{at, wifitest.Key0, wifitest.Key1, "Bearer"} {
			if strings.Contains(line, secret) {
				t.Fatalf("log entry %q leaks a secret starting %q", entry.Message, secret[:min(len(secret), 6)])
			}
		}
	}
}

func toString(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
