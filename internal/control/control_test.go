package control_test

import (
	"context"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"anova4all/internal/control"
	"anova4all/internal/store"
	"anova4all/internal/store/storetest"
	"anova4all/pkg/commands"
	"anova4all/pkg/wifi"
	"anova4all/pkg/wifi/wifitest"
)

type env struct {
	st  *store.Store
	mgr *wifi.Manager
	ctl *control.Service

	mu      sync.Mutex
	changed []string // "<idCard> <endReason>"
}

func newEnv(t *testing.T) *env {
	t.Helper()
	e := &env{st: storetest.Open(t)}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	mgr, err := wifi.NewManager(ctx, "127.0.0.1:0", wifi.Options{Verifier: e.st}, zap.NewNop())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mgr.Close() })
	e.mgr = mgr
	e.ctl = control.New(e.st, mgr, control.Options{
		OnCookChanged: func(idCard, reason string) {
			e.mu.Lock()
			e.changed = append(e.changed, idCard+" "+reason)
			e.mu.Unlock()
		},
	}, zap.NewNop())
	return e
}

// card returns a synthetic id card unique to this test run.
func card() string {
	return "f0" + strings.ReplaceAll(uuid.NewString(), "-", "")[:22]
}

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

// dial connects a fake cooker and waits until the manager has registered it.
func (e *env) dial(t *testing.T, idCard, key string, st *wifitest.State) *wifitest.Conn {
	t.Helper()
	before := len(e.mgr.Connections(idCard))
	c := wifitest.Dial(t, e.mgr.Addr().String(), wifitest.Cooker{IDCard: "anova " + idCard, Key: key, State: st})
	waitFor(t, "connection registered", func() bool { return len(e.mgr.Connections(idCard)) > before })
	return c
}

// paired returns a device owned by owner with a bound fake cooker.
func (e *env) paired(t *testing.T, owner uuid.UUID, st *wifitest.State) (uuid.UUID, string, *wifitest.Conn) {
	t.Helper()
	id := card()
	c := e.dial(t, id, wifitest.Key0, st)
	d, err := e.ctl.Pair(context.Background(), owner, "anova "+id, wifitest.Key0)
	if err != nil {
		t.Fatalf("pair: %v", err)
	}
	t.Cleanup(func() { storetest.DeleteDevice(t, d.ID) })
	if _, ok := e.mgr.Bound(id); !ok {
		t.Fatal("not bound after pair")
	}
	return d.ID, id, c
}

func (e *env) reasons() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]string(nil), e.changed...)
}

func code(t *testing.T, err error, want control.Code) {
	t.Helper()
	if got := control.CodeOf(err); got != want {
		t.Fatalf("got %q (%v), want %q", got, err, want)
	}
}

func ptr[T any](v T) *T { return &v }

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

func openCooks(t *testing.T, dev uuid.UUID) int {
	return storetest.Count(t, `select count(*) from public.cooks where device_id = $1 and ended_at is null`, dev)
}

func TestStartRunsEveryStepAndRecordsAutoStop(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, c := e.paired(t, alice, nil)

	ds, err := e.ctl.Start(context.Background(), alice, dev, control.StartCook{Temperature: 57, Unit: commands.Celsius, Minutes: ptr(60), AutoStop: true})
	if err != nil {
		t.Fatal(err)
	}
	// The fake is already in °C: a repeated "set unit" flips some real cookers, so none is sent.
	want := []string{"set temp 57.0", "set timer 60", "start", "start time"}
	if got := cookCmds(c); strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("commands %v, want %v", got, want)
	}
	if ds.Cook == nil || !ds.Cook.AutoStop || ds.Cook.EndedAt != nil {
		t.Fatalf("cook %+v", ds.Cook)
	}
	if n := openCooks(t, dev); n != 1 {
		t.Fatalf("%d open cooks", n)
	}
}

func TestUnitIsSetOnlyWhenItChanges(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, c := e.paired(t, alice, &wifitest.State{Status: "running", Temp: 56, SetTemp: 57, Unit: "c"})

	if _, err := e.ctl.Update(context.Background(), alice, dev, control.UpdateCook{Temperature: ptr(54.0), Unit: ptr(commands.Celsius)}); err != nil {
		t.Fatal(err)
	}
	if _, err := e.ctl.Update(context.Background(), alice, dev, control.UpdateCook{Temperature: ptr(130.0), Unit: ptr(commands.Fahrenheit)}); err != nil {
		t.Fatal(err)
	}
	want := []string{"set temp 54.0", "set unit f", "set temp 130.0"}
	if got := cookCmds(c); strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("commands %v, want %v", got, want)
	}
}

func TestStartWhileHeatingIsRefused(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, c := e.paired(t, alice, &wifitest.State{Status: "running", Temp: 56, SetTemp: 57, Unit: "c"})

	_, err := e.ctl.Start(context.Background(), alice, dev, control.StartCook{Temperature: 60, Unit: commands.Celsius})
	code(t, err, control.CodeCookInProgress)
	if got := cookCmds(c); len(got) != 0 {
		t.Fatalf("sent %v", got)
	}
}

func TestStartClosesLeftoverRowAsManual(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, _ := e.paired(t, alice, nil)
	old, err := e.st.InsertCook(context.Background(), dev, &alice, true)
	if err != nil {
		t.Fatal(err)
	}

	ds, err := e.ctl.Start(context.Background(), alice, dev, control.StartCook{Temperature: 57, Unit: commands.Celsius})
	if err != nil {
		t.Fatal(err)
	}
	if ds.Cook == nil || ds.Cook.ID == old.ID {
		t.Fatalf("no new cook: %+v", ds.Cook)
	}
	if n := storetest.Count(t, `select count(*) from public.cooks where id = $1 and end_reason = 'manual'`, old.ID); n != 1 {
		t.Fatal("leftover row not closed as manual")
	}
	if n := openCooks(t, dev); n != 1 {
		t.Fatalf("%d open cooks", n)
	}
}

// A step failing after the heater is on must not leave it heating with no cook row.
func TestStartTimerFailureStopsHeater(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, c := e.paired(t, alice, nil)
	c.SetResponder(func(cmd string, n int) (wifitest.Reply, bool) {
		if cmd == "start time" {
			return wifitest.Reply{Drop: true}, true
		}
		return wifitest.Reply{}, false
	})

	if _, err := e.ctl.Start(context.Background(), alice, dev, control.StartCook{Temperature: 57, Unit: commands.Celsius, Minutes: ptr(30), AutoStop: true}); err == nil {
		t.Fatal("start succeeded with a dead timer")
	}
	if n := openCooks(t, dev); n != 0 {
		t.Fatalf("%d open cooks after failed start", n)
	}
	got := c.Received()
	if !slices.Contains(got, "stop") {
		t.Fatalf("heater left on; cooker received %q", got)
	}
}

func TestStartOfflineMidwayLeavesNoRowAndRetryWorks(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, id, c := e.paired(t, alice, nil)
	c.SetResponder(func(cmd string, n int) (wifitest.Reply, bool) {
		if cmd == "start" {
			go func() { _ = c.Close() }()
			return wifitest.Reply{Drop: true}, true
		}
		return wifitest.Reply{}, false
	})

	_, err := e.ctl.Start(context.Background(), alice, dev, control.StartCook{Temperature: 57, Unit: commands.Celsius, Minutes: ptr(30), AutoStop: true})
	code(t, err, control.CodeDeviceOffline)
	if n := openCooks(t, dev); n != 0 {
		t.Fatalf("%d open cooks after failed start", n)
	}

	// The cooker re-dials and binds through its stored key.
	c2 := wifitest.Dial(t, e.mgr.Addr().String(), wifitest.Cooker{IDCard: "anova " + id, Key: wifitest.Key0})
	waitFor(t, "re-bound", func() bool {
		d, ok := e.mgr.Bound(id)
		return ok && d.ConnectedAt().After(time.Now().Add(-5*time.Second)) && len(c2.Received()) > 0
	})
	if _, err := e.ctl.Start(context.Background(), alice, dev, control.StartCook{Temperature: 57, Unit: commands.Celsius, Minutes: ptr(30), AutoStop: true}); err != nil {
		t.Fatalf("retry: %v", err)
	}
	if n := openCooks(t, dev); n != 1 {
		t.Fatalf("%d open cooks after retry", n)
	}
}

func TestInvalidInputIsRefusedBeforeAnyCommand(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, c := e.paired(t, alice, &wifitest.State{Status: "running", Temp: 56, SetTemp: 57, Unit: "c"})
	ctx := context.Background()

	starts := []control.StartCook{
		{Temperature: 24, Unit: commands.Celsius},
		{Temperature: 101, Unit: commands.Celsius},
		{Temperature: 76, Unit: commands.Fahrenheit},
		{Temperature: 212, Unit: commands.Fahrenheit},
		{Temperature: 57, Unit: "k"},
		{Temperature: 57},
		{Temperature: 57, Unit: commands.Celsius, Minutes: ptr(6001)},
		{Temperature: 57, Unit: commands.Celsius, Minutes: ptr(-1)},
		{Temperature: 57, Unit: commands.Celsius, AutoStop: true},
		{Temperature: 57, Unit: commands.Celsius, Minutes: ptr(0), AutoStop: true},
	}
	for _, in := range starts {
		_, err := e.ctl.Start(ctx, alice, dev, in)
		code(t, err, control.CodeInvalidInput)
	}
	updates := []control.UpdateCook{
		{},
		{Temperature: ptr(57.0)},
		{Unit: ptr(commands.Celsius)},
		{Temperature: ptr(120.0), Unit: ptr(commands.Celsius)},
		{Minutes: ptr(7000)},
		{Minutes: ptr(0), AutoStop: ptr(true)},
	}
	for _, in := range updates {
		_, err := e.ctl.Update(ctx, alice, dev, in)
		code(t, err, control.CodeInvalidInput)
	}
	// Validation comes before the membership check, so a stranger learns nothing either way.
	_, err := e.ctl.Start(ctx, uuid.New(), uuid.New(), control.StartCook{Temperature: 5, Unit: commands.Celsius})
	code(t, err, control.CodeInvalidInput)

	if got := cookCmds(c); len(got) != 0 {
		t.Fatalf("sent %v", got)
	}
}

func TestUpdateWhileIdleSendsNothing(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, c := e.paired(t, alice, nil)

	_, err := e.ctl.Update(context.Background(), alice, dev, control.UpdateCook{Temperature: ptr(60.0), Unit: ptr(commands.Celsius)})
	code(t, err, control.CodeNoActiveCook)
	if got := cookCmds(c); len(got) != 0 {
		t.Fatalf("sent %v", got)
	}
}

func TestUpdateMinutesMovesDeadline(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, id, c := e.paired(t, alice, nil)
	ctx := context.Background()
	if _, err := e.ctl.Start(ctx, alice, dev, control.StartCook{Temperature: 57, Unit: commands.Celsius, Minutes: ptr(60), AutoStop: true}); err != nil {
		t.Fatal(err)
	}
	ds, err := e.ctl.Update(ctx, alice, dev, control.UpdateCook{Minutes: ptr(90)})
	if err != nil {
		t.Fatal(err)
	}
	got := cookCmds(c)
	if tail := strings.Join(got[len(got)-2:], ","); tail != "set timer 90,start time" {
		t.Fatalf("commands %v", got)
	}
	if ds.Cook == nil || !ds.Cook.AutoStop {
		t.Fatalf("auto-stop lost: %+v", ds.Cook)
	}
	// The next poll reports 90 minutes; the deadline follows it.
	waitFor(t, "poll", func() bool { d, _ := e.mgr.Bound(id); return d.State().TimerValue == 90 })
	ds, err = e.ctl.Status(ctx, alice, dev)
	if err != nil {
		t.Fatal(err)
	}
	if ds.Cook.StopsAt == nil || ds.Cook.StopsAt.Sub(time.Now()) < 88*time.Minute {
		t.Fatalf("stops_at %v", ds.Cook.StopsAt)
	}

	// minutes: 0 stops the timer and turns auto-stop off.
	ds, err = e.ctl.Update(ctx, alice, dev, control.UpdateCook{Minutes: ptr(0)})
	if err != nil {
		t.Fatal(err)
	}
	if ds.Cook.AutoStop {
		t.Fatal("auto-stop still on without a timer")
	}
}

func TestUpdateCookStartedFromButtonsCreatesRow(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, _ := e.paired(t, alice, &wifitest.State{Status: "running", Temp: 56, SetTemp: 57, Unit: "c"})

	ds, err := e.ctl.Update(context.Background(), alice, dev, control.UpdateCook{Temperature: ptr(58.0), Unit: ptr(commands.Celsius)})
	if err != nil {
		t.Fatal(err)
	}
	if ds.Cook == nil || ds.Cook.EndedAt != nil || ds.Cook.AutoStop {
		t.Fatalf("cook %+v", ds.Cook)
	}
}

func TestAutoStopLeavesAlarmAndStopSilencesIt(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, id, c := e.paired(t, alice, nil)
	ctx := context.Background()
	ds, err := e.ctl.Start(ctx, alice, dev, control.StartCook{Temperature: 57, Unit: commands.Celsius, Minutes: ptr(1), AutoStop: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := e.ctl.AutoStop(ctx, id, uuid.New()); err != nil { // another cook: no-op
		t.Fatal(err)
	}
	if c.Count("stop") != 0 {
		t.Fatal("auto-stop of a different cook sent stop")
	}
	// The timer still has minutes on it (e.g. extended since the caller saw it end): no-op.
	if err := e.ctl.AutoStop(ctx, id, ds.Cook.ID); err != nil || c.Count("stop") != 0 || openCooks(t, dev) != 1 {
		t.Fatalf("auto-stop with a running timer: err=%v stops=%d", err, c.Count("stop"))
	}
	c.SetState(func(s *wifitest.State) { s.TimerMinutes = 0 })
	if err := e.ctl.AutoStop(ctx, id, ds.Cook.ID); err != nil {
		t.Fatal(err)
	}
	if c.Count("stop") != 1 || c.Count("clear alarm") != 0 {
		t.Fatalf("commands %v", cookCmds(c))
	}
	if err := e.ctl.AutoStop(ctx, id, ds.Cook.ID); err != nil || c.Count("stop") != 1 {
		t.Fatalf("second auto-stop: err=%v stops=%d", err, c.Count("stop"))
	}
	st, _ := e.ctl.Status(ctx, alice, dev)
	if st.Cook == nil || st.Cook.EndReason == nil || *st.Cook.EndReason != store.EndAutoStop {
		t.Fatalf("cook %+v", st.Cook)
	}
	if !containsStr(e.reasons(), id+" auto_stop") {
		t.Fatalf("no cook_ended notification: %v", e.reasons())
	}

	// Silence: Stop with no open cook still clears the alarm.
	if _, err := e.ctl.Stop(ctx, alice, dev); err != nil {
		t.Fatal(err)
	}
	if c.Count("clear alarm") != 1 {
		t.Fatalf("alarm not cleared: %v", cookCmds(c))
	}
}

// The auto-stop alarm flag lives on the server, so a reload or another member sees Silence.
func TestSilenceIsSharedByEveryReader(t *testing.T) {
	e := newEnv(t)
	alice, bob := storetest.User(t, "alice"), storetest.User(t, "bob")
	dev, id, c := e.paired(t, alice, nil)
	storetest.AddMember(t, dev, bob)
	ctx := context.Background()
	ds, err := e.ctl.Start(ctx, alice, dev, control.StartCook{Temperature: 57, Unit: commands.Celsius, Minutes: ptr(1), AutoStop: true})
	if err != nil {
		t.Fatal(err)
	}
	if ds.Cook.Alarm {
		t.Fatal("alarm set on an open cook")
	}
	c.SetState(func(s *wifitest.State) { s.TimerMinutes = 0 })
	if err := e.ctl.AutoStop(ctx, id, ds.Cook.ID); err != nil {
		t.Fatal(err)
	}
	for _, u := range []uuid.UUID{alice, bob} {
		if st, err := e.ctl.Status(ctx, u, dev); err != nil || st.Cook == nil || !st.Cook.Alarm {
			t.Fatalf("after auto-stop: err=%v cook=%+v", err, st.Cook)
		}
	}
	before := len(e.reasons())
	if _, err := e.ctl.Stop(ctx, alice, dev); err != nil {
		t.Fatal(err)
	}
	for _, u := range []uuid.UUID{alice, bob} {
		if st, err := e.ctl.Status(ctx, u, dev); err != nil || st.Cook == nil || st.Cook.Alarm {
			t.Fatalf("after silence: err=%v cook=%+v", err, st.Cook)
		}
	}
	if got := e.reasons()[before:]; !containsStr(got, id+" ") {
		t.Fatalf("silence did not notify streams: %v", got)
	}
}

func TestStopKeepsLowWaterAlarm(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, c := e.paired(t, alice, &wifitest.State{Status: "low water", Temp: 56, SetTemp: 57, Unit: "c"})

	if _, err := e.ctl.Stop(context.Background(), alice, dev); err != nil {
		t.Fatal(err)
	}
	if c.Count("stop") != 1 || c.Count("clear alarm") != 0 {
		t.Fatalf("commands %v", cookCmds(c))
	}
}

func TestCloseIfIdle(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, id, c := e.paired(t, alice, nil)
	ctx := context.Background()
	if _, err := e.ctl.Start(ctx, alice, dev, control.StartCook{Temperature: 57, Unit: commands.Celsius}); err != nil {
		t.Fatal(err)
	}
	if err := e.ctl.CloseIfIdle(ctx, id); err != nil || openCooks(t, dev) != 1 {
		t.Fatalf("closed a running cook: %v", err)
	}
	c.SetState(func(s *wifitest.State) { s.Status = "stopped" }) // stopped on the cooker's buttons
	if err := e.ctl.CloseIfIdle(ctx, id); err != nil {
		t.Fatal(err)
	}
	if n := storetest.Count(t, `select count(*) from public.cooks where device_id = $1 and end_reason = 'manual'`, dev); n != 1 {
		t.Fatal("not closed as manual")
	}
}

func TestConcurrentStartsLeaveOneOpenCook(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, _, _ := e.paired(t, alice, nil)

	var wg sync.WaitGroup
	errs := make([]error, 5)
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = e.ctl.Start(context.Background(), alice, dev, control.StartCook{Temperature: 57, Unit: commands.Celsius})
		}()
	}
	wg.Wait()
	ok := 0
	for _, err := range errs {
		switch {
		case err == nil:
			ok++
		case control.CodeOf(err) != control.CodeCookInProgress:
			t.Fatalf("unexpected: %v", err)
		}
	}
	if ok != 1 || openCooks(t, dev) != 1 {
		t.Fatalf("%d starts succeeded, %d open cooks", ok, openCooks(t, dev))
	}
}

func TestMembershipIsReadPerCommand(t *testing.T) {
	e := newEnv(t)
	alice, bob, eve := storetest.User(t, "alice"), storetest.User(t, "bob"), storetest.User(t, "eve")
	dev, _, _ := e.paired(t, alice, nil)
	ctx := context.Background()

	_, err := e.ctl.Stop(ctx, eve, dev)
	code(t, err, control.CodeNotMember)
	_, err = e.ctl.Status(ctx, eve, dev)
	code(t, err, control.CodeNotMember)

	storetest.AddMember(t, dev, bob)
	if _, err := e.ctl.Stop(ctx, bob, dev); err != nil {
		t.Fatalf("member stop: %v", err)
	}
	storetest.RemoveMember(t, dev, bob)
	_, err = e.ctl.Stop(ctx, bob, dev)
	code(t, err, control.CodeNotMember)
}

func TestPairErrors(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	ctx := context.Background()
	id := card()

	_, err := e.ctl.Pair(ctx, alice, id, wifitest.Key0)
	code(t, err, control.CodeDeviceOffline)
	// Real id cards contain hyphens.
	_, err = e.ctl.Pair(ctx, alice, "anova f00-00000000000", wifitest.Key0)
	code(t, err, control.CodeDeviceOffline)

	e.dial(t, id, wifitest.Key1, nil)
	_, err = e.ctl.Pair(ctx, alice, id, wifitest.Key0)
	code(t, err, control.CodeKeyMismatch)
	if _, ok := e.mgr.Bound(id); ok {
		t.Fatal("bound on key mismatch")
	}
	for _, bad := range [][2]string{{"Bad card", wifitest.Key0}, {id, "short"}, {id, "TESTKEY000"}} {
		_, err = e.ctl.Pair(ctx, alice, bad[0], bad[1])
		code(t, err, control.CodeInvalidInput)
	}
	if n := storetest.Count(t, `select count(*) from public.devices where id_card = $1`, id); n != 0 {
		t.Fatal("row created without a match")
	}
}

func TestPairSameOwnerKeepsDeviceID(t *testing.T) {
	e := newEnv(t)
	alice, bob := storetest.User(t, "alice"), storetest.User(t, "bob")
	dev, id, _ := e.paired(t, alice, nil)
	storetest.AddMember(t, dev, bob)

	e.dial(t, id, wifitest.Key1, nil) // re-setup with a new key
	d, err := e.ctl.Pair(context.Background(), alice, id, wifitest.Key1)
	if err != nil {
		t.Fatal(err)
	}
	if d.ID != dev {
		t.Fatal("same owner got a new device id")
	}
	if _, err := e.ctl.Status(context.Background(), bob, dev); err != nil {
		t.Fatalf("member lost: %v", err)
	}
}

func TestPairNewOwnerLocksOutOldConnection(t *testing.T) {
	e := newEnv(t)
	alice, bob, eve := storetest.User(t, "alice"), storetest.User(t, "bob"), storetest.User(t, "eve")
	ctx := context.Background()
	dev, id, real := e.paired(t, alice, nil)
	storetest.AddMember(t, dev, bob)
	invite := storetest.AddInvite(t, dev, alice)

	// eve dials a fake cooker with alice's id card and her own key, then pairs it.
	fake := e.dial(t, id, wifitest.Key1, nil)
	d, err := e.ctl.Pair(ctx, eve, id, wifitest.Key1)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { storetest.DeleteDevice(t, d.ID) })
	if d.ID == dev || d.OwnerID != eve {
		t.Fatalf("device %+v", d)
	}
	bound, ok := e.mgr.Bound(id)
	if !ok {
		t.Fatal("nothing bound")
	}
	if k, err := bound.ReadKey(ctx); err != nil || k != wifitest.Key1 {
		t.Fatalf("bound connection reports %q (%v)", k, err)
	}
	if !real.WaitClosed(5 * time.Second) {
		t.Fatal("alice's old connection was not closed")
	}
	_ = fake

	for _, u := range []uuid.UUID{alice, bob} {
		_, err := e.ctl.Status(ctx, u, dev)
		code(t, err, control.CodeNotMember)
	}
	if n := storetest.Count(t, `select count(*) from public.device_invites where id = $1`, invite); n != 0 {
		t.Fatal("old invite survived")
	}

	// alice's real cooker re-dials with its old key: it stays pending and uncontrollable.
	e.dial(t, id, wifitest.Key0, nil)
	time.Sleep(200 * time.Millisecond)
	bound, _ = e.mgr.Bound(id)
	if k, _ := bound.ReadKey(ctx); k != wifitest.Key1 {
		t.Fatal("old key replaced the bound connection")
	}
}

func TestConcurrentPairsAgree(t *testing.T) {
	e := newEnv(t)
	alice, eve := storetest.User(t, "alice"), storetest.User(t, "eve")
	ctx := context.Background()
	id := card()
	e.dial(t, id, wifitest.Key0, nil)
	e.dial(t, id, wifitest.Key1, nil)

	var wg sync.WaitGroup
	for _, p := range []struct {
		u   uuid.UUID
		key string
	}{{alice, wifitest.Key0}, {eve, wifitest.Key1}} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// The loser may find its connection already closed by the winner's bind.
			if _, err := e.ctl.Pair(ctx, p.u, id, p.key); err != nil && control.CodeOf(err) != control.CodeKeyMismatch && control.CodeOf(err) != control.CodeDeviceOffline {
				t.Errorf("pair: %v", err)
			}
		}()
	}
	wg.Wait()
	d, err := e.st.DeviceByIDCard(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { storetest.DeleteDevice(t, d.ID) })
	bound, ok := e.mgr.Bound(id)
	if !ok {
		t.Fatal("nothing bound")
	}
	k, err := bound.ReadKey(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if ok, _ := e.st.VerifyKey(ctx, id, k); !ok {
		t.Fatal("bound connection's key doesn't match the stored hash")
	}
	wantOwner := alice
	if k == wifitest.Key1 {
		wantOwner = eve
	}
	if d.OwnerID != wantOwner {
		t.Fatal("database owner and bound connection disagree")
	}
}

func TestSweepUnpairedDropsConnection(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, id, c := e.paired(t, alice, nil)
	storetest.DeleteDevice(t, dev) // unpaired in the browser
	if err := e.ctl.SweepUnpaired(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, ok := e.mgr.Bound(id); ok {
		t.Fatal("still bound after unpair")
	}
	if !c.WaitClosed(5 * time.Second) {
		t.Fatal("connection not closed")
	}
}

func TestOfflineCommandFailsFast(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	dev, id, c := e.paired(t, alice, nil)
	_ = c.Close()
	waitFor(t, "offline", func() bool { _, ok := e.mgr.Bound(id); return !ok })
	start := time.Now()
	_, err := e.ctl.Stop(context.Background(), alice, dev)
	code(t, err, control.CodeDeviceOffline)
	if time.Since(start) > time.Second {
		t.Fatal("offline command was slow")
	}
	ds, err := e.ctl.Status(context.Background(), alice, dev)
	if err != nil || ds.Online || ds.State != nil {
		t.Fatalf("status %+v %v", ds, err)
	}
}

func containsStr(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// Fake connections that never answer `get number` must not use up the pair
// budget before the real cooker is asked.
func TestPairNotStalledBySilentConnections(t *testing.T) {
	e := newEnv(t)
	alice := storetest.User(t, "alice")
	id := card()
	e.dial(t, id, wifitest.Key0, nil) // the real cooker, oldest
	mute := func(cmd string, n int) (wifitest.Reply, bool) {
		return wifitest.Reply{Drop: true}, cmd == "get number" && n > 1 // answers the handshake only
	}
	for i := 0; i < 5; i++ {
		before := len(e.mgr.Connections(id))
		wifitest.Dial(t, e.mgr.Addr().String(), wifitest.Cooker{IDCard: "anova " + id, Key: wifitest.Key1, Respond: mute})
		waitFor(t, "connection registered", func() bool { return len(e.mgr.Connections(id)) > before })
	}
	start := time.Now()
	if _, err := e.ctl.Pair(context.Background(), alice, "anova "+id, wifitest.Key0); err != nil {
		t.Fatalf("pair: %v", err)
	}
	if took := time.Since(start); took > 6*time.Second {
		t.Fatalf("pair took %v", took)
	}
}
