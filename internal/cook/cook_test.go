package cook_test

import (
	"context"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"anova4all/internal/control"
	"anova4all/internal/cook"
	"anova4all/internal/store"
	"anova4all/internal/store/storetest"
	"anova4all/pkg/commands"
	"anova4all/pkg/wifi"
	"anova4all/pkg/wifi/wifitest"
)

// env is one "server": a real manager, control and cook service on the local database.
type env struct {
	st    *store.Store
	mgr   *wifi.Manager
	ctl   *control.Service
	cooks *cook.Service
	once  sync.Once
}

func newEnv(t *testing.T, st *store.Store) *env {
	t.Helper()
	e := &env{st: st}
	var svc atomic.Pointer[cook.Service]
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	mgr, err := wifi.NewManager(ctx, "127.0.0.1:0", wifi.Options{
		Verifier: st,
		OnBound: func(dev wifi.AnovaDevice) {
			if s := svc.Load(); s != nil {
				s.OnBound(dev)
			}
		},
		OnState: func(idCard string, s wifi.DeviceState) {
			if c := svc.Load(); c != nil {
				c.OnState(idCard, s)
			}
		},
		OnEvent: func(idCard string, ev wifi.AnovaEvent) {
			if c := svc.Load(); c != nil {
				c.OnEvent(idCard, ev)
			}
		},
	}, zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	e.mgr = mgr
	e.ctl = control.New(st, mgr, control.Options{}, zap.NewNop())
	e.cooks = cook.New(e.ctl, st, zap.NewNop())
	svc.Store(e.cooks)
	t.Cleanup(e.close)
	return e
}

// close shuts the server down: the cook service first, then the cooker link.
func (e *env) close() {
	e.once.Do(func() {
		e.cooks.Close()
		_ = e.mgr.Close()
	})
}

func card() string {
	return "f0" + strings.ReplaceAll(uuid.NewString(), "-", "")[:22]
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func ptr[T any](v T) *T { return &v }

// dial connects a fake cooker whose device row already exists and waits until it is bound.
func (e *env) dial(t *testing.T, idCard string, st *wifitest.State) *wifitest.Conn {
	t.Helper()
	c := wifitest.Dial(t, e.mgr.Addr().String(), wifitest.Cooker{IDCard: "anova " + idCard, Key: wifitest.Key0, State: st})
	waitFor(t, "bound", func() bool {
		d, ok := e.mgr.Bound(idCard)
		return ok && len(c.Received()) > 0 && d.ConnectedAt().After(time.Now().Add(-10*time.Second))
	})
	return c
}

// paired returns a device owned by owner with a bound fake cooker.
func (e *env) paired(t *testing.T, owner uuid.UUID) (uuid.UUID, string, *wifitest.Conn) {
	t.Helper()
	id := card()
	c := wifitest.Dial(t, e.mgr.Addr().String(), wifitest.Cooker{IDCard: "anova " + id, Key: wifitest.Key0})
	waitFor(t, "connection registered", func() bool { return len(e.mgr.Connections(id)) > 0 })
	d, err := e.ctl.Pair(context.Background(), owner, "anova "+id, wifitest.Key0)
	if err != nil {
		t.Fatalf("pair: %v", err)
	}
	t.Cleanup(func() { storetest.DeleteDevice(t, d.ID) })
	waitFor(t, "bound", func() bool { _, ok := e.mgr.Bound(id); return ok })
	return d.ID, id, c
}

// seen waits until the server's cached state for idCard satisfies cond.
func (e *env) seen(t *testing.T, idCard, what string, cond func(wifi.DeviceState) bool) {
	t.Helper()
	waitFor(t, what, func() bool {
		d, ok := e.mgr.Bound(idCard)
		return ok && cond(d.State())
	})
}

// settle waits for two more poll passes and then for the cook service to go idle,
// so a negative check ("nothing was stopped") has given the service every chance to act.
func (e *env) settle(t *testing.T, c *wifitest.Conn) {
	t.Helper()
	n := c.Count("read timer") // only polls read the timer
	if !c.WaitFor("read timer", n+2, 8*time.Second) {
		t.Fatal("no poll passes")
	}
	waitFor(t, "cook service idle", e.cooks.Idle)
}

func openCooks(t *testing.T, dev uuid.UUID) int {
	return storetest.Count(t, `select count(*) from public.cooks where device_id = $1 and ended_at is null`, dev)
}

func endedAs(t *testing.T, cookID uuid.UUID, reason string) bool {
	return storetest.Count(t, `select count(*) from public.cooks where id = $1 and end_reason = $2`, cookID, reason) == 1
}

// startAuto starts an auto-stop cook of minutes, warms the water to the set point so the
// waiting timer starts, and returns the cook's id.
func (e *env) startAuto(t *testing.T, user, dev uuid.UUID, idCard string, c *wifitest.Conn, minutes int) uuid.UUID {
	t.Helper()
	ck := e.startWaiting(t, user, dev, c, minutes)
	c.SetState(func(s *wifitest.State) { s.Temp = 57 })
	e.seen(t, idCard, "timer running", func(s wifi.DeviceState) bool {
		return s.Status == commands.Running && s.TimerRunning && s.TimerValue == minutes
	})
	return ck
}

// startWaiting starts an auto-stop cook of minutes with cold water: its timer waits.
func (e *env) startWaiting(t *testing.T, user, dev uuid.UUID, c *wifitest.Conn, minutes int) uuid.UUID {
	t.Helper()
	c.SetState(func(s *wifitest.State) { s.Temp = 25 })
	before := c.Count("start time")
	ds, err := e.ctl.Start(context.Background(), user, dev, control.StartCook{Temperature: 57, Unit: commands.Celsius, Minutes: ptr(minutes), AutoStop: true})
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if ds.Cook == nil || !ds.Cook.AutoStop || !ds.Cook.TimerWaiting {
		t.Fatalf("cook %+v", ds.Cook)
	}
	if n := c.Count("start time"); n != before {
		t.Fatalf("timer started %d times with cold water", n-before)
	}
	return ds.Cook.ID
}

func waiting(t *testing.T, cookID uuid.UUID) bool {
	return storetest.Count(t, `select count(*) from public.cooks where id = $1 and timer_waiting`, cookID) == 1
}

// finish makes the fake cooker's timer reach 0 (it doesn't count down by itself).
func finish(c *wifitest.Conn) {
	c.SetState(func(s *wifitest.State) { s.TimerMinutes, s.TimerRunning = 0, false })
}

func TestWaitingTimerStartsAtSetPoint(t *testing.T) {
	st := storetest.Open(t)
	alice := storetest.User(t, "alice")

	t.Run("by polling", func(t *testing.T) {
		e := newEnv(t, st)
		dev, id, c := e.paired(t, alice)
		ck := e.startWaiting(t, alice, dev, c, 30)

		c.SetState(func(s *wifitest.State) { s.Temp = 50 }) // still heating up
		e.seen(t, id, "water at 50", func(s wifi.DeviceState) bool { return s.CurrentTemperature == 50 })
		e.settle(t, c)
		if n := c.Count("start time"); n != 0 || !waiting(t, ck) {
			t.Fatalf("timer started %d times below the set point", n)
		}

		c.SetState(func(s *wifitest.State) { s.Temp = 56.6 })
		if !c.WaitFor("start time", 1, 8*time.Second) {
			t.Fatal("timer not started at the set point")
		}
		waitFor(t, "no longer waiting", func() bool { return !waiting(t, ck) })
	})

	t.Run("by event", func(t *testing.T) {
		e := newEnv(t, st)
		dev, _, c := e.paired(t, alice)
		ck := e.startWaiting(t, alice, dev, c, 30)

		// The event arrives before any poll sees the water at the set point.
		c.SetState(func(s *wifitest.State) { s.Temp = 57 })
		if err := c.Emit("event wifi temp has reached"); err != nil {
			t.Fatal(err)
		}
		if !c.WaitFor("start time", 1, 8*time.Second) {
			t.Fatal("timer not started after the temp-reached event")
		}
		waitFor(t, "no longer waiting", func() bool { return !waiting(t, ck) })
	})

	t.Run("after a restart", func(t *testing.T) {
		e1 := newEnv(t, st)
		dev, id, c1 := e1.paired(t, alice)
		ck := e1.startWaiting(t, alice, dev, c1, 30)
		e1.close()
		c1.WaitClosed(5 * time.Second)

		// The water reached the set point while the server was down.
		e2 := newEnv(t, st)
		c2 := e2.dial(t, id, &wifitest.State{Status: "running", Temp: 57, SetTemp: 57, Unit: "c", TimerMinutes: 30})
		if !c2.WaitFor("start time", 1, 8*time.Second) {
			t.Fatal("timer not started after the bind-time read")
		}
		waitFor(t, "no longer waiting", func() bool { return !waiting(t, ck) })
	})
}

func TestStopsWhenTimerFinishes(t *testing.T) {
	st := storetest.Open(t)
	alice := storetest.User(t, "alice")

	t.Run("by event", func(t *testing.T) {
		e := newEnv(t, st)
		dev, id, c := e.paired(t, alice)
		ck := e.startAuto(t, alice, dev, id, c, 1)
		stopTimes := c.Count("stop time") // Start clears any old timer

		// The event arrives before any poll could see the timer at 0.
		c.SetState(func(s *wifitest.State) { s.TimerRunning = false })
		if err := c.Emit("event wifi time finish"); err != nil {
			t.Fatal(err)
		}
		if !c.WaitFor("stop", 1, 8*time.Second) {
			t.Fatal("no stop after the timer-finish event")
		}
		waitFor(t, "closed as auto_stop", func() bool { return endedAs(t, ck, store.EndAutoStop) })
		if n := c.Count("clear alarm"); n != 0 {
			t.Fatalf("alarm cleared %d times; auto-stop must leave it sounding", n)
		}
		if n := c.Count("stop time"); n != stopTimes {
			t.Fatal("auto-stop must only stop heating")
		}
	})

	t.Run("by polling", func(t *testing.T) {
		e := newEnv(t, st)
		dev, id, c := e.paired(t, alice)
		ck := e.startAuto(t, alice, dev, id, c, 1)

		finish(c) // no event: only the next poll sees it
		if !c.WaitFor("stop", 1, 8*time.Second) {
			t.Fatal("no stop after polling saw the timer at 0")
		}
		waitFor(t, "closed as auto_stop", func() bool { return endedAs(t, ck, store.EndAutoStop) })
	})
}

func TestManualTimerStopDoesNotStop(t *testing.T) {
	st := storetest.Open(t)
	alice := storetest.User(t, "alice")
	e := newEnv(t, st)
	dev, id, c := e.paired(t, alice)
	ck := e.startAuto(t, alice, dev, id, c, 30)

	// Timer stopped from the cooker with 12 minutes left.
	c.SetState(func(s *wifitest.State) { s.TimerMinutes, s.TimerRunning = 12, false })
	if err := c.Emit("event time stop"); err != nil {
		t.Fatal(err)
	}
	e.seen(t, id, "timer stopped", func(s wifi.DeviceState) bool { return !s.TimerRunning && s.TimerValue == 12 })
	e.settle(t, c)
	if n := c.Count("stop"); n != 0 {
		t.Fatalf("sent stop %d times after a manual timer stop", n)
	}
	if n := c.Count("start time"); n != 1 {
		t.Fatalf("sent start time %d times; a timer stopped from the cooker stays stopped", n)
	}
	if endedAs(t, ck, store.EndAutoStop) || openCooks(t, dev) != 1 {
		t.Fatal("cook ended after a manual timer stop")
	}
}

func TestExtendingTimerMovesDeadline(t *testing.T) {
	st := storetest.Open(t)
	alice := storetest.User(t, "alice")
	e := newEnv(t, st)
	dev, id, c := e.paired(t, alice)
	ck := e.startAuto(t, alice, dev, id, c, 1)

	if _, err := e.ctl.Update(context.Background(), alice, dev, control.UpdateCook{Minutes: ptr(90)}); err != nil {
		t.Fatal(err)
	}
	e.seen(t, id, "timer at 90", func(s wifi.DeviceState) bool { return s.TimerRunning && s.TimerValue == 90 })
	// Past the old 1-minute deadline as far as any reading is concerned: the cooker reports 89 left.
	c.SetState(func(s *wifitest.State) { s.TimerMinutes = 89 })
	e.seen(t, id, "timer at 89", func(s wifi.DeviceState) bool { return s.TimerValue == 89 })
	e.settle(t, c)
	if n := c.Count("stop"); n != 0 {
		t.Fatalf("stopped at the old deadline (%d stops)", n)
	}

	finish(c)
	if !c.WaitFor("stop", 1, 8*time.Second) {
		t.Fatal("no stop at the new deadline")
	}
	waitFor(t, "closed as auto_stop", func() bool { return endedAs(t, ck, store.EndAutoStop) })
}

func TestRestartPastDeadlineWaitsForFreshRead(t *testing.T) {
	st := storetest.Open(t)
	alice := storetest.User(t, "alice")

	t.Run("timer still running on bind", func(t *testing.T) {
		e1 := newEnv(t, st)
		dev, id, c1 := e1.paired(t, alice)
		ck := e1.startAuto(t, alice, dev, id, c1, 1)
		e1.close() // server restarts; the old cook service remembered a 1-minute timer
		if !c1.WaitClosed(5 * time.Second) {
			t.Fatal("old connection not closed")
		}

		// The new server knows nothing but the open auto-stop row. The cooker reports 5 minutes
		// left, so even though the old deadline has "passed", nothing may happen.
		e2 := newEnv(t, st)
		c2 := e2.dial(t, id, &wifitest.State{Status: "running", Temp: 57, SetTemp: 57, Unit: "c", TimerMinutes: 5, TimerRunning: true})
		e2.settle(t, c2)
		if n := c2.Count("stop"); n != 0 {
			t.Fatalf("stopped on remembered data (%d stops)", n)
		}
		if n := openCooks(t, dev); n != 1 {
			t.Fatalf("%d open cooks", n)
		}

		finish(c2) // a fresh poll confirms the end
		if !c2.WaitFor("stop", 1, 8*time.Second) {
			t.Fatal("no stop after a fresh read showed the timer ended")
		}
		waitFor(t, "closed as auto_stop", func() bool { return endedAs(t, ck, store.EndAutoStop) })
	})

	t.Run("timer at 0 on bind", func(t *testing.T) {
		e1 := newEnv(t, st)
		dev, id, c1 := e1.paired(t, alice)
		ck := e1.startAuto(t, alice, dev, id, c1, 1)
		e1.close()
		c1.WaitClosed(5 * time.Second)

		// The cooker reconnects heating with its timer at 0: the bind-time poll is the fresh read.
		e2 := newEnv(t, st)
		c2 := e2.dial(t, id, &wifitest.State{Status: "running", Temp: 57, SetTemp: 57, Unit: "c"})
		if !c2.WaitFor("stop", 1, 8*time.Second) {
			t.Fatal("no stop after the bind-time read showed the timer ended")
		}
		waitFor(t, "closed as auto_stop", func() bool { return endedAs(t, ck, store.EndAutoStop) })
	})
}

func TestStopsOncePerCook(t *testing.T) {
	st := storetest.Open(t)
	alice := storetest.User(t, "alice")
	e := newEnv(t, st)
	dev, id, c := e.paired(t, alice)
	ck := e.startAuto(t, alice, dev, id, c, 1)

	finish(c)
	for i := 0; i < 3; i++ {
		if err := c.Emit("event wifi time finish"); err != nil {
			t.Fatal(err)
		}
	}
	if !c.WaitFor("stop", 1, 8*time.Second) {
		t.Fatal("no stop")
	}
	waitFor(t, "closed as auto_stop", func() bool { return endedAs(t, ck, store.EndAutoStop) })

	// More finish reports, and a reading of "heating, timer at 0" (heating restarted from the
	// buttons), for the same cook: nothing more is sent.
	c.SetState(func(s *wifitest.State) { s.Status = "running" })
	for i := 0; i < 3; i++ {
		_ = c.Emit("event wifi time finish")
	}
	e.seen(t, id, "heating again", func(s wifi.DeviceState) bool { return s.Status == commands.Running })
	e.settle(t, c)
	if n := c.Count("stop"); n != 1 {
		t.Fatalf("sent stop %d times, want 1", n)
	}
}

func TestHeatingStoppedFromButtonsClosesAsManual(t *testing.T) {
	st := storetest.Open(t)
	alice := storetest.User(t, "alice")

	t.Run("while connected", func(t *testing.T) {
		e := newEnv(t, st)
		dev, id, c := e.paired(t, alice)
		ck := e.startAuto(t, alice, dev, id, c, 30)

		c.SetState(func(s *wifitest.State) { s.Status = "stopped" })
		if err := c.Emit("event stop"); err != nil {
			t.Fatal(err)
		}
		waitFor(t, "closed as manual", func() bool { return endedAs(t, ck, store.EndManual) })
		if n := c.Count("stop"); n != 0 {
			t.Fatalf("sent stop %d times", n)
		}
	})

	t.Run("while the server was down", func(t *testing.T) {
		e1 := newEnv(t, st)
		dev, id, c1 := e1.paired(t, alice)
		ck := e1.startAuto(t, alice, dev, id, c1, 30)
		e1.close()
		c1.WaitClosed(5 * time.Second)

		e2 := newEnv(t, st)
		c2 := e2.dial(t, id, &wifitest.State{Status: "stopped", Temp: 50, SetTemp: 57, Unit: "c", TimerMinutes: 20})
		waitFor(t, "closed as manual", func() bool { return endedAs(t, ck, store.EndManual) })
		if n := c2.Count("stop"); n != 0 {
			t.Fatalf("sent stop %d times", n)
		}
	})
}

func TestConcurrentStartStopWithAutoStop(t *testing.T) {
	st := storetest.Open(t)
	alice := storetest.User(t, "alice")
	e := newEnv(t, st)
	dev, id, c := e.paired(t, alice)
	ctx := context.Background()

	for round := 0; round < 3; round++ {
		if c.State().Status != "running" {
			e.startAuto(t, alice, dev, id, c, 1)
		}
		var wg sync.WaitGroup
		run := func(f func()) { wg.Add(1); go func() { defer wg.Done(); f() }() }
		run(func() { finish(c); _ = c.Emit("event wifi time finish") })
		run(func() { _, _ = e.ctl.Stop(ctx, alice, dev) }) // "REST"
		run(func() {                                       // "MCP"
			_, _ = e.ctl.Start(ctx, alice, dev, control.StartCook{Temperature: 60, Unit: commands.Celsius, Minutes: ptr(30), AutoStop: true})
		})
		run(func() {
			_, _ = e.ctl.Start(ctx, alice, dev, control.StartCook{Temperature: 61, Unit: commands.Celsius, Minutes: ptr(45)})
		})
		run(func() { _, _ = e.ctl.Stop(ctx, alice, dev) })
		wg.Wait()

		e.settle(t, c)
		open := openCooks(t, dev)
		heating := c.State().Status == "running"
		if open > 1 {
			t.Fatalf("round %d: %d open cooks", round, open)
		}
		if heating != (open == 1) {
			t.Fatalf("round %d: cooker heating=%v but %d open cooks", round, heating, open)
		}
	}
}
