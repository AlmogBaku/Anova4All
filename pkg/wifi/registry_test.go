//go:build !no_wifi

package wifi_test

import (
	"context"
	"errors"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"anova4all/pkg/commands"
	"anova4all/pkg/wifi"
	"anova4all/pkg/wifi/wifitest"
)

// --- Check 3: bound and pending ---

func TestMatchingKeyBinds(t *testing.T) {
	e := newEnv(t, envCfg{})
	e.dial(t, wifitest.Cooker{Key: wifitest.Key0})
	dev := e.waitBound(t, 2*time.Second)
	if dev.IDCard() != id || dev.Version() != wifitest.Version || dev.ConnectedAt().IsZero() {
		t.Fatalf("device = %s %q %v", dev.IDCard(), dev.Version(), dev.ConnectedAt())
	}
	if st := dev.State(); st.TargetTemperature != 60 || st.Unit != commands.Celsius || st.Status != commands.Stopped {
		t.Fatalf("state after bind = %+v; want the first poll pass", st)
	}
	if _, err := dev.SendCommand(ctxT(t, 2*time.Second), commands.SetTargetTemperature{Temperature: 57, Unit: commands.Celsius}); err != nil {
		t.Fatal(err)
	}
	eventually(t, 2*time.Second, "OnBound and a 57° state", func() bool {
		b, _, sts, _ := e.rec.snapshot()
		return len(b) == 1 && b[0] == dev && len(sts) > 0 && sts[len(sts)-1].TargetTemperature == 57
	})
	if e.m.BoundCount() != 1 || len(e.m.BoundIDCards()) != 1 || e.m.BoundIDCards()[0] != id {
		t.Fatalf("BoundCount=%d BoundIDCards=%v", e.m.BoundCount(), e.m.BoundIDCards())
	}
}

func TestStateCallbackOnlyOnChange(t *testing.T) {
	e := newEnv(t, envCfg{}) // polling every 100ms
	f := e.dial(t, wifitest.Cooker{})
	e.waitBound(t, 2*time.Second)
	time.Sleep(500 * time.Millisecond) // ~5 identical poll passes
	_, _, sts, _ := e.rec.snapshot()
	if len(sts) != 0 { // the initial state is read on OnBound; nothing changed since
		t.Fatalf("got %d state callbacks for identical polls: %+v", len(sts), sts)
	}
	f.SetState(func(s *wifitest.State) { s.Temp = 30 })
	eventually(t, time.Second, "state change", func() bool { _, _, s, _ := e.rec.snapshot(); return len(s) == 1 })
	time.Sleep(300 * time.Millisecond)
	if _, _, s, _ := e.rec.snapshot(); len(s) != 1 || s[0].CurrentTemperature != 30 {
		t.Fatalf("states = %+v", s)
	}
}

func TestWrongKeyStaysPendingAndUncontrollable(t *testing.T) {
	e := newEnv(t, envCfg{})
	f := e.dial(t, wifitest.Cooker{Key: wifitest.Key1})
	eventually(t, 2*time.Second, "pending", func() bool { return len(e.m.Connections(id)) == 1 })
	if _, ok := e.m.Bound(id); ok {
		t.Fatal("wrong key bound")
	}
	if err := f.Emit("event wifi time finish"); err != nil {
		t.Fatal(err)
	}
	f.SetState(func(s *wifitest.State) { s.Temp = 33 })
	time.Sleep(400 * time.Millisecond)
	b, _, sts, evs := e.rec.snapshot()
	if len(b) != 0 || len(sts) != 0 || len(evs) != 0 || e.m.BoundCount() != 0 {
		t.Fatalf("pending device leaked callbacks: bound=%d states=%d events=%d", len(b), len(sts), len(evs))
	}
	// Verifier errors also leave the connection pending.
	e.v.SetErr(errors.New("db down"))
	e.dial(t, wifitest.Cooker{Key: wifitest.Key0})
	eventually(t, 2*time.Second, "second pending", func() bool { return len(e.m.Connections(id)) == 2 })
	if _, ok := e.m.Bound(id); ok {
		t.Fatal("verifier error bound the device")
	}
}

func TestWrongKeyDuplicateLeavesBoundAlive(t *testing.T) {
	e := newEnv(t, envCfg{})
	e.dial(t, wifitest.Cooker{Key: wifitest.Key0})
	a := e.waitBound(t, 2*time.Second)
	e.dial(t, wifitest.Cooker{Key: wifitest.Key1})
	eventually(t, 2*time.Second, "duplicate pending", func() bool { return len(e.m.Connections(id)) == 2 })
	time.Sleep(200 * time.Millisecond)
	if d, ok := e.m.Bound(id); !ok || d != a {
		t.Fatal("bound connection replaced by wrong-key duplicate")
	}
	select {
	case <-a.Done():
		t.Fatal("bound connection closed")
	default:
	}
	if c := e.m.Connections(id); c[0] == a {
		t.Fatal("Connections not newest first")
	}
}

func TestMatchingDuplicateReplacesAndOldTeardownKeepsNew(t *testing.T) {
	e := newEnv(t, envCfg{})
	fa := e.dial(t, wifitest.Cooker{Key: wifitest.Key0})
	a := e.waitBound(t, 2*time.Second)
	e.dial(t, wifitest.Cooker{Key: wifitest.Key0})
	eventually(t, 2*time.Second, "replacement", func() bool { d, ok := e.m.Bound(id); return ok && d != a })
	b, _ := e.m.Bound(id)
	waitDone(t, a, time.Second)
	if !fa.WaitClosed(time.Second) {
		t.Fatal("old cooker not disconnected")
	}
	eventually(t, time.Second, "OnGone(old)", func() bool { _, g, _, _ := e.rec.snapshot(); return len(g) == 1 && g[0] == a })
	time.Sleep(100 * time.Millisecond) // let the old teardown finish
	if d, ok := e.m.Bound(id); !ok || d != b {
		t.Fatal("old teardown unregistered the new connection")
	}
	if len(e.m.Connections(id)) != 1 || e.m.BoundCount() != 1 {
		t.Fatalf("connections=%d bound=%d", len(e.m.Connections(id)), e.m.BoundCount())
	}
	if _, err := b.SendCommand(ctxT(t, 2*time.Second), commands.GetCurrentTemperature{}); err != nil {
		t.Fatal(err)
	}
}

func TestConnectingNeverWritesTheKey(t *testing.T) {
	e := newEnv(t, envCfg{})
	good := e.dial(t, wifitest.Cooker{Key: wifitest.Key0})
	e.waitBound(t, 2*time.Second)
	bad := e.dial(t, wifitest.Cooker{Key: wifitest.Key1})
	eventually(t, 2*time.Second, "pending", func() bool { return len(e.m.Connections(id)) == 2 })
	time.Sleep(300 * time.Millisecond) // a few poll passes
	for name, f := range map[string]*wifitest.Conn{"bound": good, "pending": bad} {
		got := f.Received()
		if len(got) < 3 || got[0] != "get id card" || got[1] != "version" || got[2] != "get number" {
			t.Fatalf("%s: handshake = %v", name, got[:min(3, len(got))])
		}
		for _, c := range got {
			if strings.HasPrefix(c, "set ") || strings.HasPrefix(c, "start") || strings.HasPrefix(c, "stop") || strings.HasPrefix(c, "clear") {
				t.Fatalf("%s: connecting wrote %q", name, c)
			}
		}
	}
}

func TestPendingExpiresAfterTTL(t *testing.T) {
	var mu sync.Mutex
	now := time.Unix(1_700_000_000, 0)
	clock := func() time.Time { mu.Lock(); defer mu.Unlock(); return now }
	advance := func(d time.Duration) { mu.Lock(); now = now.Add(d); mu.Unlock() }

	e := newEnv(t, envCfg{opts: wifi.Options{Now: clock}}) // default TTL 120s
	f := e.dial(t, wifitest.Cooker{Key: wifitest.Key1})
	eventually(t, 2*time.Second, "pending", func() bool { return len(e.m.Connections(id)) == 1 })
	dev := e.m.Connections(id)[0]

	advance(119 * time.Second)
	e.m.Sweep()
	time.Sleep(50 * time.Millisecond)
	if len(e.m.Connections(id)) != 1 {
		t.Fatal("pending expired before TTL")
	}
	advance(2 * time.Second)
	e.m.Sweep()
	waitDone(t, dev, time.Second)
	if !f.WaitClosed(time.Second) {
		t.Fatal("expired pending cooker still connected")
	}
}

func TestBoundDoesNotExpire(t *testing.T) {
	var mu sync.Mutex
	now := time.Unix(1_700_000_000, 0)
	e := newEnv(t, envCfg{opts: wifi.Options{Now: func() time.Time { mu.Lock(); defer mu.Unlock(); return now }}})
	e.dial(t, wifitest.Cooker{})
	dev := e.waitBound(t, 2*time.Second)
	mu.Lock()
	now = now.Add(time.Hour)
	mu.Unlock()
	e.m.Sweep()
	time.Sleep(50 * time.Millisecond)
	select {
	case <-dev.Done():
		t.Fatal("bound device expired")
	default:
	}
}

func TestMaxPendingDropsOldest(t *testing.T) {
	e := newEnv(t, envCfg{opts: wifi.Options{MaxPending: 3}})
	var fakes []*wifitest.Conn
	for i := 0; i < 4; i++ {
		fakes = append(fakes, e.dial(t, wifitest.Cooker{Key: wifitest.Key1}))
		n := min(i+1, 3)
		eventually(t, 2*time.Second, "pending registered", func() bool { return len(e.m.Connections(id)) == n && e.v.Calls() == i+1 })
	}
	if !fakes[0].WaitClosed(time.Second) {
		t.Fatal("oldest pending not dropped")
	}
	for _, f := range fakes[1:] {
		select {
		case <-f.Done():
			t.Fatal("newer pending dropped")
		default:
		}
	}
}

func TestBindPromotesAndClosesOthers(t *testing.T) {
	e := newEnv(t, envCfg{})
	e.v.Set(id, "") // nothing paired yet
	f1 := e.dial(t, wifitest.Cooker{Key: wifitest.Key0})
	eventually(t, 2*time.Second, "1 pending", func() bool { return len(e.m.Connections(id)) == 1 })
	e.dial(t, wifitest.Cooker{Key: wifitest.Key1})
	eventually(t, 2*time.Second, "2 pending", func() bool { return len(e.m.Connections(id)) == 2 })

	conns := e.m.Connections(id)
	var target wifi.AnovaDevice
	for _, c := range conns { // pairing flow: fresh `get number` on each
		if k, err := c.ReadKey(ctxT(t, 2*time.Second)); err == nil && k == wifitest.Key1 {
			target = c
		}
	}
	if target == nil || target != conns[0] {
		t.Fatal("expected the newest connection to report Key1")
	}
	if err := e.m.Bind(target); err != nil {
		t.Fatal(err)
	}
	if d, ok := e.m.Bound(id); !ok || d != target {
		t.Fatal("Bind did not bind")
	}
	if !f1.WaitClosed(time.Second) {
		t.Fatal("other connection not closed")
	}
	eventually(t, time.Second, "OnBound", func() bool { b, _, _, _ := e.rec.snapshot(); return len(b) == 1 && b[0] == target })
	if err := e.m.Bind(conns[1]); !errors.Is(err, wifi.ErrOffline) {
		t.Fatalf("Bind closed conn: %v; want ErrOffline", err)
	}

	e.m.Drop(id)
	waitDone(t, target, time.Second)
	if _, ok := e.m.Bound(id); ok || e.m.BoundCount() != 0 {
		t.Fatal("Drop left a bound device")
	}
	eventually(t, time.Second, "OnGone", func() bool { _, g, _, _ := e.rec.snapshot(); return len(g) == 1 })
}

func TestManagerCloseReturns(t *testing.T) {
	e := newEnv(t, envCfg{})
	e.dial(t, wifitest.Cooker{})
	e.dial(t, wifitest.Cooker{Silent: true}) // stuck in handshake
	dev := e.waitBound(t, 2*time.Second)
	done := make(chan struct{})
	go func() { _ = e.m.Close(); close(done) }()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("Close hung")
	}
	waitDone(t, dev, time.Second)
}

// One source can't crowd out a real cooker: beyond MaxUnboundPerIP, its
// not-yet-bound connections are refused, and binding frees the slot.
func TestUnboundConnectionsPerIPAreCapped(t *testing.T) {
	e := newEnv(t, envCfg{opts: wifi.Options{MaxUnboundPerIP: 2}})
	e.dial(t, wifitest.Cooker{Key: wifitest.Key0})
	e.waitBound(t, 2500*time.Millisecond) // one check (1 s) plus slack, not the flood's queue // bound: doesn't count
	p1 := e.dial(t, wifitest.Cooker{Key: wifitest.Key1})
	e.dial(t, wifitest.Cooker{Key: wifitest.Key1})
	eventually(t, 2*time.Second, "2 pending", func() bool { return len(e.m.Connections(id)) == 3 })

	if over := e.dial(t, wifitest.Cooker{Key: wifitest.Key1}); !over.WaitClosed(time.Second) {
		t.Fatal("third unbound connection from one IP was not refused")
	}
	if len(e.m.Connections(id)) != 3 {
		t.Fatal("refusing changed the registry")
	}

	_ = p1.Close()
	eventually(t, 2*time.Second, "slot freed", func() bool { return len(e.m.Connections(id)) == 2 })
	e.dial(t, wifitest.Cooker{Key: wifitest.Key1})
	eventually(t, 2*time.Second, "accepted again", func() bool { return len(e.m.Connections(id)) == 3 })
}

// Key checks hit the database and bcrypt; a flood of handshakes must not take
// every pool connection or the CPU.
func TestKeyChecksAreBounded(t *testing.T) {
	v := &slowVerifier{delay: 100 * time.Millisecond}
	e := newEnv(t, envCfg{opts: wifi.Options{Verifier: v}, remoteIP: eachConnOwnAddress})
	for i := 0; i < 6; i++ {
		e.dial(t, wifitest.Cooker{Key: wifitest.Key1})
	}
	eventually(t, 3*time.Second, "all verified", func() bool { return v.calls.Load() == 6 })
	if got := v.peak.Load(); got > 2 {
		t.Fatalf("%d key checks ran at once; want at most 2", got)
	}
}

// One address flooding wrong keys must not take every key-check slot: a cooker
// from another address still gets checked and bound while the flood runs.
func TestOneAddressCannotStarveKeyChecks(t *testing.T) {
	v := &slowVerifier{delay: time.Second}
	var seen atomic.Int32
	var realNext atomic.Bool
	addr := func(net.Conn) string {
		seen.Add(1)
		if realNext.Load() {
			return "203.0.113.2"
		}
		return "203.0.113.1"
	}
	e := newEnv(t, envCfg{opts: wifi.Options{Verifier: v, MaxUnboundPerIP: 20}, remoteIP: addr})
	for i := 0; i < 8; i++ {
		e.dial(t, wifitest.Cooker{Key: wifitest.Key1})
	}
	eventually(t, 2*time.Second, "flood accepted", func() bool { return seen.Load() == 8 })
	eventually(t, 2*time.Second, "flood checking", func() bool { return v.now.Load() == 1 })
	realNext.Store(true)
	v.match.Store(true)
	e.dial(t, wifitest.Cooker{Key: wifitest.Key0})
	e.waitBound(t, 2*time.Second)
	if got := v.peak.Load(); got > 2 {
		t.Fatalf("%d key checks ran at once; want at most 2", got)
	}
}

func eachConnOwnAddress(nc net.Conn) string { return nc.RemoteAddr().String() }

type slowVerifier struct {
	delay            time.Duration
	now, peak, calls atomic.Int32
	match            atomic.Bool // answer for keys other than Key1
}

func (v *slowVerifier) VerifyKey(ctx context.Context, _, key string) (bool, error) {
	n := v.now.Add(1)
	for p := v.peak.Load(); n > p && !v.peak.CompareAndSwap(p, n); p = v.peak.Load() {
	}
	time.Sleep(v.delay)
	v.now.Add(-1)
	v.calls.Add(1)
	return key != wifitest.Key1 && v.match.Load(), nil
}
