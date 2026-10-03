//go:build !no_wifi

// Package wifitest provides a fake Anova cooker that dials a wifi.Manager and
// speaks the real wire encoding, plus a fake KeyVerifier. Synthetic data only.
package wifitest

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"anova4all/pkg/wifi"
)

// Synthetic test identities.
const (
	// IDCard is what the fake cooker answers to `get id card`.
	IDCard = "anova f00000000000000000000000"
	// DeviceID is IDCard as reported by AnovaDevice.IDCard() and passed to KeyVerifier.
	DeviceID = "f00000000000000000000000"
	Key0     = "testkey000"
	Key1     = "testkey111"
	Version  = "VER 0.0.0 TEST"
)

// State is the fake cooker's state, used for default replies.
type State struct {
	Status       string // "stopped", "running", "low water", ...
	Temp         float64
	SetTemp      float64
	Unit         string // "c" or "f"
	TimerMinutes int
	TimerRunning bool
	Speaker      bool
}

// Reply overrides how one command is answered.
type Reply struct {
	Text  string        // reply text; "" means the default reply
	Drop  bool          // send nothing
	Delay time.Duration // send after this delay (later commands are still answered meanwhile)
	Split bool          // write the frame in two writes
	Then  []string      // extra frames written in the same write, after the reply (merged frames)
}

// Responder decides how to answer cmd; n counts how often cmd was received (1-based).
// Return ok=false for the default behavior.
type Responder func(cmd string, n int) (r Reply, ok bool)

// Cooker configures a fake cooker. Zero fields get IDCard, Version, Key0 and a stopped state at 25.0/60.0 °C.
type Cooker struct {
	IDCard  string
	Version string
	Key     string
	State   *State
	Respond Responder
	Silent  bool // answer nothing from the start (never finishes the handshake)
}

// Conn is a connected fake cooker.
type Conn struct {
	logf func(format string, args ...any)
	nc   net.Conn

	wmu sync.Mutex // serializes writes

	mu       sync.Mutex
	cfg      Cooker
	st       State
	respond  Responder
	silent   bool
	received []string
	counts   map[string]int

	done chan struct{}
	once sync.Once
}

// Dial connects a fake cooker to addr. It is closed at test cleanup.
func Dial(t testing.TB, addr string, c Cooker) *Conn {
	t.Helper()
	f, err := Connect(context.Background(), addr, c, t.Logf)
	if err != nil {
		t.Fatalf("wifitest: %v", err)
	}
	t.Cleanup(func() { _ = f.Close() })
	return f
}

// Connect connects a fake cooker to addr outside a test; the caller closes it.
// logf receives write errors (nil discards them).
func Connect(ctx context.Context, addr string, c Cooker, logf func(format string, args ...any)) (*Conn, error) {
	d := net.Dialer{Timeout: 2 * time.Second}
	nc, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", addr, err)
	}
	if logf == nil {
		logf = func(string, ...any) {}
	}
	if c.IDCard == "" {
		c.IDCard = IDCard
	}
	if c.Version == "" {
		c.Version = Version
	}
	if c.Key == "" {
		c.Key = Key0
	}
	st := State{Status: "stopped", Temp: 25.0, SetTemp: 60.0, Unit: "c"}
	if c.State != nil {
		st = *c.State
	}
	f := &Conn{logf: logf, nc: nc, cfg: c, st: st, respond: c.Respond, silent: c.Silent, counts: map[string]int{}, done: make(chan struct{})}
	go f.readLoop()
	return f, nil
}

// Frame encodes msg as one wire frame (including the trailing 0x16).
func Frame(msg string) []byte {
	m := wifi.AnovaMessage(msg)
	b, _ := m.MarshalBinary()
	return append(b, 0x16)
}

// ReadFrame reads the next frame from r and decodes it, skipping noise before the 'h'
// and frames that fail to decode.
func ReadFrame(r *bufio.Reader) (string, error) {
	for {
		b, err := r.ReadByte()
		if err != nil {
			return "", err
		}
		if b != 'h' {
			continue
		}
		n, err := r.ReadByte()
		if err != nil {
			return "", err
		}
		buf := make([]byte, int(n)+4)
		buf[0], buf[1] = 'h', n
		if _, err := io.ReadFull(r, buf[2:len(buf)-1]); err != nil {
			return "", err
		}
		buf[len(buf)-1] = 0x16
		var m wifi.AnovaMessage
		if err := m.UnmarshalBinary(buf); err != nil {
			continue
		}
		return string(m), nil
	}
}

// SetState changes the state used for default replies.
func (f *Conn) SetState(fn func(*State)) {
	f.mu.Lock()
	defer f.mu.Unlock()
	fn(&f.st)
}

// State returns the current fake state.
func (f *Conn) State() State {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.st
}

// SetKey changes what `get number` returns.
func (f *Conn) SetKey(key string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.cfg.Key = key
}

// Key returns what `get number` returns now (the server may have changed it with `set number`).
func (f *Conn) Key() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.cfg.Key
}

// SetResponder replaces the responder (nil restores defaults).
func (f *Conn) SetResponder(r Responder) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.respond = r
}

// Silence stops (true) or resumes (false) answering commands. The link stays open.
func (f *Conn) Silence(on bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.silent = on
}

// Emit sends one event frame, e.g. "event wifi time finish" or "user changed temp".
func (f *Conn) Emit(event string) error { return f.Send(event) }

// Send writes the given messages as frames in a single write (merged when more than one).
func (f *Conn) Send(msgs ...string) error {
	var b []byte
	for _, m := range msgs {
		b = append(b, Frame(m)...)
	}
	return f.WriteRaw(b)
}

// SendSplit writes one frame in two writes, split at byte at, with a short pause.
func (f *Conn) SendSplit(msg string, at int) error {
	b := Frame(msg)
	at = max(1, min(at, len(b)-1))
	f.wmu.Lock() // held across both halves so no other frame interleaves
	defer f.wmu.Unlock()
	if err := f.write(b[:at]); err != nil {
		return err
	}
	time.Sleep(20 * time.Millisecond)
	return f.write(b[at:])
}

// WriteRaw writes raw bytes (e.g. an oversized or corrupt frame).
func (f *Conn) WriteRaw(b []byte) error {
	f.wmu.Lock()
	defer f.wmu.Unlock()
	return f.write(b)
}

func (f *Conn) write(b []byte) error {
	_ = f.nc.SetWriteDeadline(time.Now().Add(2 * time.Second))
	_, err := f.nc.Write(b)
	return err
}

// Received returns every command received, in order.
func (f *Conn) Received() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.received...)
}

// Count returns how often cmd was received.
func (f *Conn) Count(cmd string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.counts[cmd]
}

// WaitFor waits until cmd has been received at least n times.
func (f *Conn) WaitFor(cmd string, n int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if f.Count(cmd) >= n {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return f.Count(cmd) >= n
}

// Done is closed when the link ends (either side).
func (f *Conn) Done() <-chan struct{} { return f.done }

// WaitClosed reports whether the server closed the link within timeout.
func (f *Conn) WaitClosed(timeout time.Duration) bool {
	select {
	case <-f.done:
		return true
	case <-time.After(timeout):
		return false
	}
}

// Close disconnects the fake cooker.
func (f *Conn) Close() error {
	f.once.Do(func() { close(f.done) })
	return f.nc.Close()
}

func (f *Conn) readLoop() {
	defer func() { _ = f.Close() }()
	r := bufio.NewReader(f.nc)
	for {
		m, err := ReadFrame(r)
		if err != nil {
			return
		}
		f.handle(m)
	}
}

func (f *Conn) handle(cmd string) {
	f.mu.Lock()
	f.received = append(f.received, cmd)
	f.counts[cmd]++
	n := f.counts[cmd]
	silent, respond := f.silent, f.respond
	f.mu.Unlock()
	if silent {
		return
	}
	var r Reply
	if respond != nil {
		if rr, ok := respond(cmd, n); ok {
			r = rr
		}
	}
	if r.Drop {
		return
	}
	text := r.Text
	if text == "" {
		text = f.defaultReply(cmd)
	} else {
		f.defaultReply(cmd) // still apply the state change
	}
	send := func() {
		var err error
		switch {
		case r.Split:
			if err = f.SendSplit(text, 3); err == nil && len(r.Then) > 0 {
				err = f.Send(r.Then...)
			}
		default:
			err = f.Send(append([]string{text}, r.Then...)...)
		}
		if err != nil && !errors.Is(err, net.ErrClosed) {
			f.logf("wifitest: write reply: %v", err)
		}
	}
	if r.Delay > 0 {
		time.AfterFunc(r.Delay, send)
		return
	}
	send()
}

// defaultReply answers cmd from the state, applying set/start/stop commands.
func (f *Conn) defaultReply(cmd string) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	s := &f.st
	switch {
	case cmd == "get id card":
		return f.cfg.IDCard
	case cmd == "version":
		return f.cfg.Version
	case cmd == "get number":
		return f.cfg.Key
	case cmd == "status":
		return s.Status
	case cmd == "read temp":
		return fmt.Sprintf("%.1f", s.Temp)
	case cmd == "read set temp":
		return fmt.Sprintf("%.1f", s.SetTemp)
	case cmd == "read unit":
		return s.Unit
	case cmd == "read timer":
		return fmt.Sprintf("%d %d", s.TimerMinutes, b2i(s.TimerRunning))
	case cmd == "speaker status":
		if s.Speaker {
			return "speaker on"
		}
		return "speaker off"
	case cmd == "start":
		s.Status = "running"
		return "start"
	case cmd == "stop":
		s.Status = "stopped"
		return "stop"
	case cmd == "start time":
		s.TimerRunning = true
		return "ok"
	case cmd == "stop time":
		s.TimerRunning = false
		return "stop time"
	case cmd == "clear alarm":
		return "ok"
	case strings.HasPrefix(cmd, "set temp "):
		if v, err := strconv.ParseFloat(strings.TrimPrefix(cmd, "set temp "), 64); err == nil {
			s.SetTemp = v
			return "ok"
		}
	case strings.HasPrefix(cmd, "set unit "):
		s.Unit = strings.TrimPrefix(cmd, "set unit ")
		return "ok"
	case strings.HasPrefix(cmd, "set timer "):
		if v, err := strconv.Atoi(strings.TrimPrefix(cmd, "set timer ")); err == nil {
			s.TimerMinutes = v
			return strconv.Itoa(v)
		}
	case strings.HasPrefix(cmd, "set number "):
		f.cfg.Key = strings.TrimPrefix(cmd, "set number ")
		return "ok"
	}
	return "invalid command"
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

// Verifier is a fake wifi.KeyVerifier backed by a map of id card -> key.
type Verifier struct {
	mu    sync.Mutex
	keys  map[string]string
	err   error
	calls int
}

var _ wifi.KeyVerifier = (*Verifier)(nil)

// NewVerifier returns a verifier; pairs are idCard, key, idCard, key, ...
func NewVerifier(pairs ...string) *Verifier {
	v := &Verifier{keys: map[string]string{}}
	for i := 0; i+1 < len(pairs); i += 2 {
		v.keys[pairs[i]] = pairs[i+1]
	}
	return v
}

// Set stores the key for idCard ("" removes it).
func (v *Verifier) Set(idCard, key string) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if key == "" {
		delete(v.keys, idCard)
		return
	}
	v.keys[idCard] = key
}

// SetErr makes VerifyKey fail with err (nil restores normal behavior).
func (v *Verifier) SetErr(err error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.err = err
}

// Calls returns how often VerifyKey was called.
func (v *Verifier) Calls() int {
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.calls
}

func (v *Verifier) VerifyKey(_ context.Context, idCard, key string) (bool, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.calls++
	if v.err != nil {
		return false, v.err
	}
	want, ok := v.keys[idCard]
	return ok && want == key, nil
}
