//go:build !no_wifi

package wifi_test

import (
	"bytes"
	"errors"
	"fmt"
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

// --- Check 1: commands don't cross ---

func TestLateReplyAfterTimeoutDoesNotReachNextCommand(t *testing.T) {
	tt := noPoll()
	e := newEnv(t, envCfg{tt: tt})
	f := e.dial(t, wifitest.Cooker{Respond: func(cmd string, n int) (wifitest.Reply, bool) {
		switch {
		case cmd == "read set temp" && n == 2:
			// Same shape as the next command's reply: only the drain window can tell them apart.
			return wifitest.Reply{Text: "99.0", Delay: tt.Command + 50*time.Millisecond}, true
		case strings.HasPrefix(cmd, "set temp") && n == 1:
			// Arrives after the drain window, while `read timer` is in flight.
			return wifitest.Reply{Text: "ok", Delay: tt.Command + tt.Drain + 80*time.Millisecond}, true
		case cmd == "read timer" && n == 2:
			return wifitest.Reply{Delay: 200 * time.Millisecond}, true
		}
		return wifitest.Reply{}, false
	}})
	dev := e.waitBound(t, 2*time.Second)

	v, err := dev.SendCommand(ctxT(t, 3*time.Second), commands.GetTargetTemperature{})
	if err != nil || v != 60.0 {
		t.Fatalf("read set temp = %v, %v; want 60 (retry after timeout)", v, err)
	}
	v, err = dev.SendCommand(ctxT(t, 3*time.Second), commands.GetCurrentTemperature{})
	if err != nil || v != 25.0 {
		t.Fatalf("read temp = %v, %v; want 25 (late 99.0 must not cross)", v, err)
	}

	_, err = dev.SendCommand(ctxT(t, 3*time.Second), commands.SetTargetTemperature{Temperature: 57, Unit: commands.Celsius})
	if !errors.Is(err, wifi.ErrTimeout) {
		t.Fatalf("set temp err = %v; want ErrTimeout", err)
	}
	v, err = dev.SendCommand(ctxT(t, 3*time.Second), commands.GetTimerStatus{})
	if err != nil || v != (commands.TimerStatus{Minutes: 0, Running: false}) {
		t.Fatalf("read timer = %v, %v; want {0 false} (late ok must be discarded)", v, err)
	}
	_ = f
}

func TestMergedAndSplitFramesParse(t *testing.T) {
	e := newEnv(t, envCfg{tt: noPoll()})
	f := e.dial(t, wifitest.Cooker{Respond: func(cmd string, n int) (wifitest.Reply, bool) {
		switch {
		case cmd == "read temp" && n == 2:
			return wifitest.Reply{Text: "41.5", Then: []string{"event wifi change temp", "event wifi temp has reached"}}, true
		case cmd == "read unit" && n == 2:
			return wifitest.Reply{Text: "f", Split: true}, true
		}
		return wifitest.Reply{}, false
	}})
	dev := e.waitBound(t, 2*time.Second)

	if v, err := dev.SendCommand(ctxT(t, 2*time.Second), commands.GetCurrentTemperature{}); err != nil || v != 41.5 {
		t.Fatalf("merged: read temp = %v, %v", v, err)
	}
	if v, err := dev.SendCommand(ctxT(t, 2*time.Second), commands.GetTemperatureUnit{}); err != nil || v != commands.Fahrenheit {
		t.Fatalf("split: read unit = %v, %v", v, err)
	}
	// 21 characters + "\r" gives a length byte of 0x16: framing must not split on it.
	if err := f.Send("event wifi time start"); err != nil {
		t.Fatal(err)
	}
	if err := f.SendSplit("event wifi time finish", 1); err != nil {
		t.Fatal(err)
	}
	eventually(t, 2*time.Second, "4 events", func() bool { _, _, _, ev := e.rec.snapshot(); return len(ev) >= 4 })
	_, _, _, evs := e.rec.snapshot()
	want := []wifi.EventType{wifi.EventTypeChangeTemp, wifi.EventTypeTempReached, wifi.EventTypeTimeStart, wifi.EventTypeTimeFinish}
	for i, w := range want {
		if evs[i].Type != w {
			t.Fatalf("event %d = %v; want %v (all: %v)", i, evs[i].Type, w, evs)
		}
	}
}

func TestConcurrentCommandsWhileCookerDisconnects(t *testing.T) {
	e := newEnv(t, envCfg{})
	f := e.dial(t, wifitest.Cooker{Respond: func(cmd string, n int) (wifitest.Reply, bool) {
		return wifitest.Reply{Delay: time.Millisecond}, true
	}})
	dev := e.waitBound(t, 2*time.Second)

	var wg sync.WaitGroup
	errs := make(chan error, 50)
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			var cmd commands.Command = commands.GetCurrentTemperature{}
			if i%3 == 0 {
				cmd = &commands.SetTargetTemperature{Temperature: float64(40 + i%20), Unit: commands.Celsius}
			}
			_, err := dev.SendCommand(ctxT(t, 5*time.Second), cmd)
			errs <- err
		}(i)
	}
	time.Sleep(15 * time.Millisecond)
	_ = f.Close()
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil && !errors.Is(err, wifi.ErrOffline) && !errors.Is(err, wifi.ErrTimeout) {
			t.Errorf("unexpected error: %v", err)
		}
	}
	waitDone(t, dev, 2*time.Second)
	if _, ok := e.m.Bound(id); ok {
		t.Fatal("device still bound after disconnect")
	}
}

// --- Check 2: offline ---

func TestSilentCookerOfflineWithin6s(t *testing.T) {
	t.Parallel()
	e := newEnv(t, envCfg{defaults: true}) // production timings
	f := e.dial(t, wifitest.Cooker{})
	dev := e.waitBound(t, 5*time.Second)
	f.Silence(true)
	if took := waitDone(t, dev, 7*time.Second); took > 6200*time.Millisecond {
		t.Fatalf("offline after %v; want <= 6s", took)
	}
	eventually(t, time.Second, "OnGone", func() bool { _, g, _, _ := e.rec.snapshot(); return len(g) == 1 })
}

// failWriter makes writes fail once armed.
type failWriter struct {
	net.Conn
	armed *atomic.Bool
}

func (c failWriter) Write(b []byte) (int, error) {
	if c.armed.Load() {
		return 0, errors.New("synthetic write failure")
	}
	return c.Conn.Write(b)
}

type wrapListener struct {
	net.Listener
	wrap      func(net.Conn) net.Conn
	failFirst atomic.Int32
}

func (l *wrapListener) Accept() (net.Conn, error) {
	if l.failFirst.Add(-1) >= 0 {
		return nil, errors.New("synthetic accept failure")
	}
	c, err := l.Listener.Accept()
	if err != nil || l.wrap == nil {
		return c, err
	}
	return l.wrap(c), nil
}

func TestWriteErrorGoesOffline(t *testing.T) {
	var armed atomic.Bool
	tt := fast()
	tt.Liveness = 6 * time.Second
	e := newEnv(t, envCfg{tt: tt, listener: func(ln net.Listener) net.Listener {
		return &wrapListener{Listener: ln, wrap: func(c net.Conn) net.Conn { return failWriter{c, &armed} }}
	}})
	e.dial(t, wifitest.Cooker{})
	dev := e.waitBound(t, 2*time.Second)
	armed.Store(true)
	if took := waitDone(t, dev, 2*time.Second); took > time.Second {
		t.Fatalf("offline after %v; want at the next write", took)
	}
}

func TestCommandToOfflineDeviceFailsAtOnce(t *testing.T) {
	e := newEnv(t, envCfg{})
	f := e.dial(t, wifitest.Cooker{})
	dev := e.waitBound(t, 2*time.Second)
	_ = f.Close()
	waitDone(t, dev, 2*time.Second)

	start := time.Now()
	_, err := dev.SendCommand(ctxT(t, 5*time.Second), commands.GetCurrentTemperature{})
	if !errors.Is(err, wifi.ErrOffline) {
		t.Fatalf("err = %v; want ErrOffline", err)
	}
	if _, err := dev.ReadKey(ctxT(t, 5*time.Second)); !errors.Is(err, wifi.ErrOffline) {
		t.Fatalf("ReadKey err = %v; want ErrOffline", err)
	}
	if took := time.Since(start); took > 50*time.Millisecond {
		t.Fatalf("took %v; want immediate", took)
	}
}

func TestDroppedReadTempRetriedOnce(t *testing.T) {
	e := newEnv(t, envCfg{tt: noPoll()})
	f := e.dial(t, wifitest.Cooker{Respond: func(cmd string, n int) (wifitest.Reply, bool) {
		if (cmd == "read temp" && n == 2) || (strings.HasPrefix(cmd, "set temp") && n == 1) {
			return wifitest.Reply{Drop: true}, true
		}
		return wifitest.Reply{}, false
	}})
	dev := e.waitBound(t, 2*time.Second)

	v, err := dev.SendCommand(ctxT(t, 3*time.Second), commands.GetCurrentTemperature{})
	if err != nil || v != 25.0 {
		t.Fatalf("read temp = %v, %v; want 25 after one retry", v, err)
	}
	if n := f.Count("read temp"); n != 3 { // 1 initial poll + dropped + retry
		t.Fatalf("read temp sent %d times; want 3", n)
	}
	// A non-repeatable command is not retried.
	_, err = dev.SendCommand(ctxT(t, 3*time.Second), commands.SetTargetTemperature{Temperature: 57, Unit: commands.Celsius})
	if !errors.Is(err, wifi.ErrTimeout) || f.Count("set temp 57.0") != 1 {
		t.Fatalf("set temp: err=%v count=%d; want timeout, sent once", err, f.Count("set temp 57.0"))
	}
}

func TestStartRereadsStatus(t *testing.T) {
	e := newEnv(t, envCfg{tt: noPoll()})
	f := e.dial(t, wifitest.Cooker{})
	dev := e.waitBound(t, 2*time.Second)
	before := f.Count("status")
	if v, err := dev.SendCommand(ctxT(t, 2*time.Second), commands.StartDevice{}); err != nil || v != true {
		t.Fatalf("start = %v, %v", v, err)
	}
	if f.Count("status") != before+1 || dev.State().Status != commands.Running {
		t.Fatalf("status not re-read after start (count %d -> %d, state %q)", before, f.Count("status"), dev.State().Status)
	}
}

// --- Check 4: robustness ---

func TestUserCommandAnsweredWithinOnePollSlot(t *testing.T) {
	const slot = 60 * time.Millisecond
	tt := fast()
	tt.Poll = 5 * time.Millisecond // polling all the time
	e := newEnv(t, envCfg{tt: tt})
	e.dial(t, wifitest.Cooker{Respond: func(cmd string, n int) (wifitest.Reply, bool) {
		if strings.HasPrefix(cmd, "set temp") {
			return wifitest.Reply{}, false
		}
		return wifitest.Reply{Delay: slot}, true
	}})
	dev := e.waitBound(t, 3*time.Second)
	time.Sleep(3 * slot) // in the middle of a poll pass (6 commands = 360ms)

	for i := 0; i < 3; i++ {
		start := time.Now()
		if _, err := dev.SendCommand(ctxT(t, 2*time.Second), commands.SetTargetTemperature{Temperature: 50 + float64(i), Unit: commands.Celsius}); err != nil {
			t.Fatal(err)
		}
		// at most the in-flight poll command plus our own (instant) reply
		if took := time.Since(start); took > slot+80*time.Millisecond {
			t.Fatalf("user command took %v; want within one poll slot (%v)", took, slot)
		}
		time.Sleep(slot / 2)
	}
}

func TestEventsForwardedOffReadLoop(t *testing.T) {
	release := make(chan struct{})
	entered := make(chan wifi.AnovaEvent, 10)
	e := newEnv(t, envCfg{tt: noPoll(), opts: wifi.Options{OnEvent: func(_ string, ev wifi.AnovaEvent) {
		entered <- ev
		<-release
	}}})
	f := e.dial(t, wifitest.Cooker{})
	dev := e.waitBound(t, 2*time.Second)
	defer close(release)
	f.SetState(func(s *wifitest.State) { s.Status = "low water" }) // "user changed" triggers a re-poll

	for _, ev := range []string{"event wifi time finish", "user changed temp", "event wifi low water"} {
		if err := f.Emit(ev); err != nil {
			t.Fatal(err)
		}
	}
	select {
	case ev := <-entered:
		if ev.Type != wifi.EventTypeTimeFinish {
			t.Fatalf("first event %v; want time_finish", ev.Type)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("OnEvent not called")
	}
	// The callback is blocked; the link must keep working.
	if v, err := dev.SendCommand(ctxT(t, 2*time.Second), commands.GetCurrentTemperature{}); err != nil || v != 25.0 {
		t.Fatalf("command while callback blocked = %v, %v", v, err)
	}
	if st := dev.State(); st.Status != commands.LowWater || st.TimerRunning {
		t.Fatalf("state after events = %+v", st)
	}
}

func TestOversizedFrameClosesConnection(t *testing.T) {
	e := newEnv(t, envCfg{tt: noPoll()})
	f := e.dial(t, wifitest.Cooker{})
	dev := e.waitBound(t, 2*time.Second)
	junk := append(bytes.Repeat([]byte{'x'}, 1100), 0x16)
	if err := f.WriteRaw(junk); err != nil {
		t.Fatal(err)
	}
	waitDone(t, dev, time.Second)
	if !f.WaitClosed(time.Second) {
		t.Fatal("fake cooker still connected")
	}
}

func TestHandshakeOverDeadlineClosesConnection(t *testing.T) {
	tt := fast()
	tt.Handshake = 400 * time.Millisecond
	tt.Command = time.Second
	tt.Liveness = 10 * time.Second
	e := newEnv(t, envCfg{tt: tt})
	start := time.Now()
	f := e.dial(t, wifitest.Cooker{Silent: true})
	if !f.WaitClosed(2 * time.Second) {
		t.Fatal("silent handshake not closed")
	}
	if took := time.Since(start); took > time.Second {
		t.Fatalf("closed after %v; want about the handshake deadline", took)
	}
	if len(e.m.Connections(id)) != 0 || e.v.Calls() != 0 {
		t.Fatal("unfinished handshake must not register or verify")
	}
	// A cooker that answers only the id card also fails the deadline.
	f2 := e.dial(t, wifitest.Cooker{Respond: func(cmd string, n int) (wifitest.Reply, bool) {
		return wifitest.Reply{Drop: cmd != "get id card"}, true
	}})
	if !f2.WaitClosed(2 * time.Second) {
		t.Fatal("partial handshake not closed")
	}
}

func TestAcceptErrorDoesNotKillServer(t *testing.T) {
	e := newEnv(t, envCfg{listener: func(ln net.Listener) net.Listener {
		wl := &wrapListener{Listener: ln}
		wl.failFirst.Store(5)
		return wl
	}})
	e.dial(t, wifitest.Cooker{})
	e.waitBound(t, 3*time.Second)
}

func TestReentrantCallbacksDoNotDeadlock(t *testing.T) {
	var m *wifi.Manager
	done := make(chan string, 10)
	e := newEnv(t, envCfg{opts: wifi.Options{
		OnBound: func(d wifi.AnovaDevice) {
			_, _ = d.SendCommand(ctxT(t, 2*time.Second), commands.GetCurrentTemperature{})
			_, _ = m.Bound(d.IDCard())
			_ = m.Connections(d.IDCard())
			_ = m.BoundCount()
			_ = m.Bind(d)
			done <- "bound"
		},
		OnState: func(idCard string, _ wifi.DeviceState) {
			if d, ok := m.Bound(idCard); ok {
				_ = d.State()
				_, _ = d.SendCommand(ctxT(t, 2*time.Second), commands.SetTimer{Minutes: 5})
			}
			select {
			case done <- "state":
			default:
			}
		},
		OnEvent: func(idCard string, _ wifi.AnovaEvent) {
			if d, ok := m.Bound(idCard); ok {
				_, _ = d.SendCommand(ctxT(t, 2*time.Second), commands.GetDeviceStatus{})
				_ = d.Close()
			}
			done <- "event"
		},
		OnGone: func(idCard string, d wifi.AnovaDevice) {
			_, _ = d.SendCommand(ctxT(t, time.Second), commands.GetDeviceStatus{}) // offline: fails at once
			m.Drop(idCard)
			done <- "gone"
		},
	}})
	m = e.m
	f := e.dial(t, wifitest.Cooker{})
	want := map[string]bool{"bound": false, "state": false, "event": false, "gone": false}
	deadline := time.After(5 * time.Second)
	emitted := false
	for {
		all := true
		for _, ok := range want {
			all = all && ok
		}
		if all {
			return
		}
		select {
		case s := <-done:
			want[s] = true
			if s == "bound" && !emitted {
				emitted = true
				_ = f.Emit("event wifi start")
			}
		case <-deadline:
			t.Fatalf("callbacks deadlocked or missing: %v", want)
		}
	}
}

func TestMisroutedReplyIsErrorNotPanic(t *testing.T) {
	e := newEnv(t, envCfg{tt: noPoll()})
	e.dial(t, wifitest.Cooker{Respond: func(cmd string, n int) (wifitest.Reply, bool) {
		if n < 2 {
			return wifitest.Reply{}, false
		}
		switch cmd {
		case "read timer", "read unit":
			return wifitest.Reply{Text: "ok"}, true
		case "status":
			return wifitest.Reply{Text: "57.5"}, true
		case "read temp":
			return wifitest.Reply{Text: "c"}, true
		}
		return wifitest.Reply{}, false
	}})
	dev := e.waitBound(t, 2*time.Second)
	for _, cmd := range []commands.Command{commands.GetTimerStatus{}, commands.GetTemperatureUnit{}, commands.GetDeviceStatus{}, commands.GetCurrentTemperature{}} {
		_, err := dev.SendCommand(ctxT(t, 3*time.Second), cmd)
		if !errors.Is(err, wifi.ErrUnexpectedReply) {
			t.Fatalf("%s: err = %v; want ErrUnexpectedReply", cmd.Encode(), err)
		}
	}
	// Set commands decode to bool; state must use the command's value (old code panicked here).
	if _, err := dev.SendCommand(ctxT(t, 2*time.Second), &commands.SetTargetTemperature{Temperature: 57, Unit: commands.Celsius}); err != nil {
		t.Fatal(err)
	}
	if _, err := dev.SendCommand(ctxT(t, 2*time.Second), commands.SetTemperatureUnit{Unit: commands.Fahrenheit}); err != nil {
		t.Fatal(err)
	}
	if st := dev.State(); st.TargetTemperature != 57 || st.Unit != commands.Fahrenheit {
		t.Fatalf("state = %+v", st)
	}
	if _, err := dev.SendCommand(ctxT(t, time.Second), commands.SetSecretKey{Key: wifitest.Key1}); !errors.Is(err, wifi.ErrUnsupported) {
		t.Fatalf("set number over wifi: err = %v; want ErrUnsupported", err)
	}
	if _, err := dev.SendCommand(ctxT(t, time.Second), nil); !errors.Is(err, wifi.ErrUnsupported) {
		t.Fatalf("nil command: err = %v", err)
	}
}

func TestMultiWordStatusAccepted(t *testing.T) {
	e := newEnv(t, envCfg{tt: noPoll()})
	f := e.dial(t, wifitest.Cooker{})
	dev := e.waitBound(t, 2*time.Second)
	f.SetState(func(s *wifitest.State) { s.Status = "low water" })
	if v, err := dev.SendCommand(ctxT(t, 2*time.Second), commands.GetDeviceStatus{}); err != nil || v != commands.LowWater {
		t.Fatalf("status = %v, %v", v, err)
	}
}

func TestKeyNeverInStringOrLogs(t *testing.T) {
	e := newEnv(t, envCfg{})
	e.v.Set(id, wifitest.Key1) // pending first: key read during handshake
	f := e.dial(t, wifitest.Cooker{Key: wifitest.Key0})
	eventually(t, 2*time.Second, "pending", func() bool { return len(e.m.Connections(id)) == 1 })
	dev := e.m.Connections(id)[0]
	if _, err := dev.ReadKey(ctxT(t, 2*time.Second)); err != nil {
		t.Fatal(err)
	}
	_ = f.Close()
	waitDone(t, dev, 2*time.Second)
	for _, s := range []string{fmt.Sprint(dev), fmt.Sprintf("%v %+v", dev, dev)} {
		if strings.Contains(s, wifitest.Key0) {
			t.Fatalf("key in String(): %s", s)
		}
	}
	for _, le := range e.obs.All() {
		line := le.Message + fmt.Sprint(le.ContextMap())
		if strings.Contains(line, wifitest.Key0) || strings.Contains(line, wifitest.Key1) {
			t.Fatalf("key in log: %s", line)
		}
	}
	if e.obs.Len() == 0 {
		t.Fatal("expected some logs")
	}
}

func TestThreeMissedRepliesCloseLink(t *testing.T) {
	tt := fast()
	tt.Liveness = 10 * time.Second // events keep the read side alive; only the miss rule can close it
	e := newEnv(t, envCfg{tt: tt})
	f := e.dial(t, wifitest.Cooker{})
	dev := e.waitBound(t, 2*time.Second)
	f.Silence(true)
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		for {
			select {
			case <-stop:
				return
			case <-time.After(50 * time.Millisecond):
				_ = f.Emit("event wifi temp has reached")
			}
		}
	}()
	// 3 x (command timeout + drain), plus the retry of repeatable reads.
	if took := waitDone(t, dev, 4*time.Second); took > 3*time.Second {
		t.Fatalf("closed after %v", took)
	}
}

// The real cooker answers `set unit c` with the unit and `start time` with the
// command itself, not "ok"; a command must accept those echoes as well as "ok".
func TestSetCommandsAcceptEchoedValue(t *testing.T) {
	e := newEnv(t, envCfg{tt: noPoll()})
	e.dial(t, wifitest.Cooker{Respond: func(cmd string, _ int) (wifitest.Reply, bool) {
		switch cmd {
		case "set unit c":
			return wifitest.Reply{Text: "c"}, true
		case "set unit f":
			return wifitest.Reply{Text: "F"}, true
		case "set temp 57.0":
			return wifitest.Reply{Text: "57.0"}, true
		case "start time":
			return wifitest.Reply{Text: "start time"}, true
		case "set temp 60.0": // another number is a stale reply, never a confirmation
			return wifitest.Reply{Text: "56.5"}, true
		}
		return wifitest.Reply{}, false
	}})
	dev := e.waitBound(t, 2*time.Second)
	for _, cmd := range []commands.Command{
		commands.SetTemperatureUnit{Unit: commands.Celsius},
		commands.SetTemperatureUnit{Unit: commands.Fahrenheit},
		commands.SetTargetTemperature{Temperature: 57, Unit: commands.Celsius},
		commands.StartTimer{},
	} {
		if _, err := dev.SendCommand(ctxT(t, 3*time.Second), cmd); err != nil {
			t.Errorf("%s: %v", cmd.Encode(), err)
		}
	}
	if _, err := dev.SendCommand(ctxT(t, 5*time.Second), commands.SetTargetTemperature{Temperature: 60, Unit: commands.Celsius}); err == nil {
		t.Error("set temp 60.0 accepted 56.5 as its reply")
	}
}

// The cooker reports its timer as "<minutes> running" or "<minutes> stopped".
func TestTimerStatusReadsRunningWord(t *testing.T) {
	e := newEnv(t, envCfg{tt: noPoll()})
	var reply atomic.Value
	reply.Store("45 running")
	e.dial(t, wifitest.Cooker{Respond: func(cmd string, _ int) (wifitest.Reply, bool) {
		if cmd != "read timer" {
			return wifitest.Reply{}, false
		}
		return wifitest.Reply{Text: reply.Load().(string)}, true
	}})
	dev := e.waitBound(t, 2*time.Second)
	for text, want := range map[string]commands.TimerStatus{
		"45 running": {Minutes: 45, Running: true},
		"45 stopped": {Minutes: 45, Running: false},
	} {
		reply.Store(text)
		v, err := dev.SendCommand(ctxT(t, 3*time.Second), commands.GetTimerStatus{})
		if err != nil || v != want {
			t.Errorf("read timer %q = %v, %v; want %v", text, v, err, want)
		}
	}
}
