//go:build !no_wifi

package wifi_test

import (
	"context"
	"net"
	"sync"
	"testing"
	"time"

	"anova4all/pkg/wifi"
	"anova4all/pkg/wifi/wifitest"

	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

const id = wifitest.DeviceID

// fast timings keep the package quick; tests that need a specific bound override fields.
func fast() wifi.TestTimings {
	return wifi.TestTimings{
		Command:   300 * time.Millisecond,
		Drain:     150 * time.Millisecond,
		Write:     time.Second,
		Liveness:  3 * time.Second,
		Poll:      100 * time.Millisecond,
		Handshake: 3 * time.Second,
	}
}

// noPoll disables background polling so tests control every command.
func noPoll() wifi.TestTimings {
	tt := fast()
	tt.Poll = time.Hour
	tt.Liveness = time.Hour
	return tt
}

// recorder captures manager callbacks.
type recorder struct {
	mu     sync.Mutex
	bound  []wifi.AnovaDevice
	gone   []wifi.AnovaDevice
	states []wifi.DeviceState
	events []wifi.AnovaEvent
}

func (r *recorder) opts(o wifi.Options) wifi.Options {
	o.OnBound = func(d wifi.AnovaDevice) { r.mu.Lock(); r.bound = append(r.bound, d); r.mu.Unlock() }
	o.OnGone = func(_ string, d wifi.AnovaDevice) { r.mu.Lock(); r.gone = append(r.gone, d); r.mu.Unlock() }
	o.OnState = func(_ string, st wifi.DeviceState) { r.mu.Lock(); r.states = append(r.states, st); r.mu.Unlock() }
	o.OnEvent = func(_ string, ev wifi.AnovaEvent) { r.mu.Lock(); r.events = append(r.events, ev); r.mu.Unlock() }
	return o
}

func (r *recorder) snapshot() (bound, gone []wifi.AnovaDevice, states []wifi.DeviceState, events []wifi.AnovaEvent) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]wifi.AnovaDevice(nil), r.bound...), append([]wifi.AnovaDevice(nil), r.gone...),
		append([]wifi.DeviceState(nil), r.states...), append([]wifi.AnovaEvent(nil), r.events...)
}

type env struct {
	m   *wifi.Manager
	v   *wifitest.Verifier
	rec *recorder
	obs *observer.ObservedLogs
}

type envCfg struct {
	tt       wifi.TestTimings
	opts     wifi.Options // callbacks here override the recorder's
	listener func(net.Listener) net.Listener
	defaults bool // use production timings
}

func newEnv(t *testing.T, c envCfg) *env {
	t.Helper()
	core, obs := observer.New(zap.DebugLevel)
	e := &env{v: wifitest.NewVerifier(id, wifitest.Key0), rec: &recorder{}, obs: obs}
	o := e.rec.opts(wifi.Options{})
	o.Verifier = e.v
	if c.opts.OnBound != nil {
		o.OnBound = c.opts.OnBound
	}
	if c.opts.OnGone != nil {
		o.OnGone = c.opts.OnGone
	}
	if c.opts.OnState != nil {
		o.OnState = c.opts.OnState
	}
	if c.opts.OnEvent != nil {
		o.OnEvent = c.opts.OnEvent
	}
	o.PendingTTL, o.MaxPending, o.Now = c.opts.PendingTTL, c.opts.MaxPending, c.opts.Now
	if !c.defaults {
		if c.tt == (wifi.TestTimings{}) {
			c.tt = fast()
		}
		o = wifi.WithTimings(o, c.tt)
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	if c.listener != nil {
		ln = c.listener(ln)
	}
	m, err := wifi.NewManagerWithListener(context.Background(), ln, o, zap.New(core))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = m.Close() })
	e.m = m
	return e
}

func (e *env) dial(t *testing.T, c wifitest.Cooker) *wifitest.Conn {
	t.Helper()
	return wifitest.Dial(t, e.m.Addr().String(), c)
}

// waitBound waits until a device is bound for id and returns it.
func (e *env) waitBound(t *testing.T, timeout time.Duration) wifi.AnovaDevice {
	t.Helper()
	var dev wifi.AnovaDevice
	eventually(t, timeout, "device bound", func() bool {
		d, ok := e.m.Bound(id)
		dev = d
		return ok
	})
	return dev
}

func eventually(t *testing.T, timeout time.Duration, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	if !cond() {
		t.Fatalf("timed out waiting for: %s", what)
	}
}

func waitDone(t *testing.T, d wifi.AnovaDevice, timeout time.Duration) time.Duration {
	t.Helper()
	start := time.Now()
	select {
	case <-d.Done():
		return time.Since(start)
	case <-time.After(timeout):
		t.Fatalf("device not closed within %v", timeout)
		return 0
	}
}

func ctxT(t *testing.T, d time.Duration) context.Context {
	ctx, cancel := context.WithTimeout(context.Background(), d)
	t.Cleanup(cancel)
	return ctx
}
