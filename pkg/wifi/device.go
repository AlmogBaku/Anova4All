//go:build !no_wifi

package wifi

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"time"

	"anova4all/pkg/commands"

	"go.uber.org/zap"
)

// DeviceState represents the current state of the Anova device.
type DeviceState struct {
	Status             commands.DeviceStatus    `json:"status"`
	CurrentTemperature float64                  `json:"current_temperature"`
	TargetTemperature  float64                  `json:"target_temperature"`
	TimerRunning       bool                     `json:"timer_running"`
	TimerValue         int                      `json:"timer_value"`
	Unit               commands.TemperatureUnit `json:"unit"`
	SpeakerStatus      bool                     `json:"speaker_status"`
}

// AnovaDevice is one live Wi-Fi connection from a cooker.
type AnovaDevice interface {
	// IDCard is the cooker's id card without the "anova " prefix.
	IDCard() string
	Version() string
	// State is the last known state.
	State() DeviceState
	ConnectedAt() time.Time
	// SendCommand sends a command at user priority (ahead of polling).
	SendCommand(ctx context.Context, cmd commands.Command) (any, error)
	// ReadKey reads the cooker's key with a fresh `get number`.
	ReadKey(ctx context.Context) (string, error)
	// Done is closed when the connection ends.
	Done() <-chan struct{}
	Close() error
}

// pollSet is one poll pass.
var pollSet = []commands.Command{
	commands.GetDeviceStatus{},
	commands.GetTargetTemperature{},
	commands.GetCurrentTemperature{},
	commands.GetTemperatureUnit{},
	commands.GetTimerStatus{},
	commands.GetSpeakerStatus{},
}

// sink receives device notifications on the device's dispatch goroutine.
type sink struct {
	state func(d *device, st DeviceState)
	event func(d *device, ev AnovaEvent)
}

type device struct {
	c           *conn
	log         *zap.Logger
	seq         uint64
	connectedAt time.Time
	sink        sink
	disp        *dispatcher
	repoll      chan struct{}
	announced   bool // OnBound delivered; dispatch goroutine only
	ip          string
	counted     bool // holds an unbound slot for ip; guarded by Manager.mu

	mu          sync.Mutex
	idCard      string
	version     string
	state       DeviceState
	notified    DeviceState
	hasNotified bool
}

var _ AnovaDevice = (*device)(nil)

func newDevice(nc net.Conn, seq uint64, connectedAt time.Time, t timings, log *zap.Logger, s sink) *device {
	log = log.With(zap.Stringer("remote", nc.RemoteAddr()))
	d := &device{
		c:           newConn(nc, t, log),
		log:         log,
		seq:         seq,
		connectedAt: connectedAt,
		sink:        s,
		disp:        newDispatcher(log),
		repoll:      make(chan struct{}, 1),
	}
	go d.disp.run()
	go d.eventLoop()
	return d
}

func (d *device) IDCard() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.idCard
}

func (d *device) Version() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.version
}

func (d *device) State() DeviceState {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.state
}

func (d *device) ConnectedAt() time.Time { return d.connectedAt }
func (d *device) Done() <-chan struct{}  { return d.c.done }

func (d *device) Close() error {
	d.c.close(errors.New("closed by server"))
	return nil
}

func (d *device) String() string {
	return fmt.Sprintf("<device id_card=%s version=%s>", d.IDCard(), d.Version())
}

func (d *device) SendCommand(ctx context.Context, cmd commands.Command) (any, error) {
	return d.send(ctx, prioUser, cmd)
}

func (d *device) ReadKey(ctx context.Context) (string, error) {
	v, err := d.send(ctx, prioUser, commands.GetSecretKey{})
	if err != nil {
		return "", err
	}
	key, ok := v.(string)
	if !ok {
		return "", fmt.Errorf("%w: get number returned %T", ErrUnexpectedReply, v)
	}
	return key, nil
}

// handshake reads id card, version and key. It never writes anything to the cooker.
// The key is returned to the caller and not kept on the device.
func (d *device) handshake(ctx context.Context) (string, error) {
	v, err := d.send(ctx, prioUser, commands.GetIDCard{})
	if err != nil {
		return "", fmt.Errorf("get id card: %w", err)
	}
	id, ok := v.(string)
	if !ok || id == "" {
		return "", fmt.Errorf("get id card: %w", ErrUnexpectedReply)
	}
	v, err = d.send(ctx, prioUser, commands.GetVersion{})
	if err != nil {
		return "", fmt.Errorf("version: %w", err)
	}
	version, _ := v.(string)

	d.mu.Lock()
	d.idCard, d.version = id, version
	d.mu.Unlock()
	d.log = d.log.With(zap.String("id_card", id))

	key, err := d.ReadKey(ctx)
	if err != nil {
		return "", fmt.Errorf("get number: %w", err)
	}
	return key, nil
}

// pollLoop runs one poll pass per interval. Passes never overlap.
func (d *device) pollLoop() {
	t := time.NewTicker(d.c.t.poll)
	defer t.Stop()
	for {
		select {
		case <-d.c.done:
			return
		case <-t.C:
		case <-d.repoll:
		}
		d.pollOnce(context.Background())
	}
}

func (d *device) pollOnce(ctx context.Context) {
	for _, cmd := range pollSet {
		if _, err := d.send(ctx, prioPoll, cmd); err != nil {
			if errors.Is(err, ErrOffline) || ctx.Err() != nil {
				return
			}
			d.log.Debug("poll failed", zap.Error(err))
		}
	}
}

func (d *device) requestPoll() {
	select {
	case d.repoll <- struct{}{}:
	default:
	}
}

// send runs one command with validation, a single retry for repeatable reads,
// and a status re-read after start/stop.
func (d *device) send(ctx context.Context, prio priority, cmd commands.Command) (any, error) {
	cmd = normalize(cmd)
	if cmd == nil || !cmd.SupportsWiFi() {
		return nil, fmt.Errorf("%w: %T", ErrUnsupported, cmd)
	}
	line := cmd.Encode()
	attempts := 1
	if repeatable(cmd) {
		attempts = 2
	}
	var v any
	var err error
	for i := 0; i < attempts; i++ {
		v, err = d.c.do(ctx, prio, line, decoderFor(cmd))
		if err == nil || ctx.Err() != nil || !(errors.Is(err, ErrTimeout) || errors.Is(err, ErrUnexpectedReply)) {
			break
		}
	}
	if err != nil {
		return nil, fmt.Errorf("%s: %w", line, err)
	}
	d.apply(cmd, v)

	switch cmd.(type) {
	case commands.StartDevice, commands.StopDevice:
		if _, serr := d.send(ctx, prio, commands.GetDeviceStatus{}); serr != nil {
			d.log.Debug("status re-read after start/stop failed", zap.Error(serr))
		}
	}
	return v, nil
}

// normalize turns *T into T so type switches see one form.
func normalize(cmd commands.Command) commands.Command {
	if cmd == nil {
		return nil
	}
	rv := reflect.ValueOf(cmd)
	if rv.Kind() != reflect.Pointer {
		return cmd
	}
	if rv.IsNil() {
		return nil
	}
	if c, ok := rv.Elem().Interface().(commands.Command); ok {
		return c
	}
	return cmd
}

func repeatable(cmd commands.Command) bool {
	switch cmd.(type) {
	case commands.GetDeviceStatus, commands.GetTargetTemperature, commands.GetCurrentTemperature,
		commands.GetTemperatureUnit, commands.GetTimerStatus, commands.GetSpeakerStatus,
		commands.GetIDCard, commands.GetVersion, commands.GetSecretKey:
		return true
	}
	return false
}

var errNoFit = errors.New("reply does not fit command")

// decoderFor wraps the command's decoder with a shape check, so a reply meant
// for another command is rejected (treated as stale) instead of accepted.
func decoderFor(cmd commands.Command) func(string) (any, error) {
	return func(line string) (any, error) {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			return nil, errNoFit
		}
		v, err := cmd.Decode(line)
		switch c := cmd.(type) {
		case commands.GetDeviceStatus:
			if err != nil {
				return statusFallback(trimmed)
			}
		case commands.GetTimerStatus:
			// The frozen decoder only knows "45 1"; the cooker says "45 running" / "45 stopped".
			if ts, ok := v.(commands.TimerStatus); err == nil && ok {
				switch strings.ToLower(strings.Fields(trimmed)[1]) {
				case "1", "running":
					ts.Running = true
				case "0", "stopped":
				default:
					return nil, errNoFit
				}
				return ts, nil
			}
		case commands.GetSecretKey:
			if err == nil && len(strings.Fields(trimmed)) != 1 {
				return nil, errNoFit
			}
		case commands.SetTemperatureUnit:
			// The cooker answers with the unit it now uses ("c"), not "ok".
			if strings.EqualFold(trimmed, string(c.Unit)) {
				return true, nil
			}
		case commands.SetTargetTemperature:
			// Some firmware echoes the new set point ("57.0") instead of "ok".
			if f, perr := strconv.ParseFloat(trimmed, 64); perr == nil && math.Abs(f-c.Temperature) < 0.05 {
				return true, nil
			}
		}
		if err != nil {
			return nil, err
		}
		// Commands whose decoder returns "was the reply ok": false means it isn't our reply,
		// unless the cooker echoed the command back, as it does for `start time`.
		if b, ok := v.(bool); ok && !b {
			if strings.EqualFold(trimmed, cmd.Encode()) {
				return true, nil
			}
			if _, isSpeaker := cmd.(commands.GetSpeakerStatus); !isSpeaker {
				return nil, errNoFit
			}
		}
		return v, nil
	}
}

// statusFallback accepts multi-word statuses ("low water", "heater error", ...)
// that the frozen GetDeviceStatus decoder rejects because it keeps only the first word.
func statusFallback(s string) (any, error) {
	s = strings.ToLower(s)
	for _, st := range []commands.DeviceStatus{commands.LowWater, commands.HeaterError, commands.PowerLoss, commands.UserChangeParameter} {
		if s == string(st) || strings.HasPrefix(s, string(st)+" ") {
			return st, nil
		}
	}
	return nil, errNoFit
}

// apply updates the state from a successful command. Assertions are checked.
func (d *device) apply(cmd commands.Command, v any) {
	d.mu.Lock()
	st := d.state
	switch c := cmd.(type) {
	case commands.GetDeviceStatus:
		if s, ok := v.(commands.DeviceStatus); ok {
			st.Status = s
		}
	case commands.GetCurrentTemperature:
		if f, ok := v.(float64); ok {
			st.CurrentTemperature = f
		}
	case commands.GetTargetTemperature:
		if f, ok := v.(float64); ok {
			st.TargetTemperature = f
		}
	case commands.SetTargetTemperature:
		st.TargetTemperature = c.Temperature
	case commands.GetTemperatureUnit:
		if u, ok := v.(commands.TemperatureUnit); ok {
			if st.Unit != "" && st.Unit != u {
				d.log.Info("cooker reports a new unit", zap.String("from", string(st.Unit)), zap.String("to", string(u)),
					zap.Float64("target", st.TargetTemperature))
			}
			st.Unit = u
		}
	case commands.SetTemperatureUnit:
		st.Unit = c.Unit
	case commands.GetTimerStatus:
		if ts, ok := v.(commands.TimerStatus); ok {
			st.TimerValue, st.TimerRunning = ts.Minutes, ts.Running
		}
	case commands.SetTimer:
		if m, ok := v.(int); ok {
			st.TimerValue = m
		}
	case commands.StartTimer:
		st.TimerRunning = true
	case commands.StopTimer:
		st.TimerRunning = false
	case commands.StartDevice:
		st.Status = commands.Running
	case commands.StopDevice:
		st.Status = commands.Stopped
	case commands.GetSpeakerStatus:
		if b, ok := v.(bool); ok {
			st.SpeakerStatus = b
		}
	}
	d.state = st
	d.postStateLocked()
	d.mu.Unlock()
}

// postStateLocked queues a state notification if the state differs from the last one queued.
func (d *device) postStateLocked() {
	if d.hasNotified && d.state == d.notified {
		return
	}
	d.notified, d.hasNotified = d.state, true
	st := d.state
	d.disp.post(func() { d.sink.state(d, st) })
}

func (d *device) eventLoop() {
	for {
		select {
		case <-d.c.done:
			return
		case ev := <-d.c.events:
			d.handleEvent(ev)
		}
	}
}

func (d *device) handleEvent(ev AnovaEvent) {
	d.mu.Lock()
	switch ev.Type {
	case EventTypeTempReached:
		d.state.CurrentTemperature = d.state.TargetTemperature
	case EventTypeLowWater:
		d.state.Status = commands.LowWater
	case EventTypeStop:
		d.state.Status = commands.Stopped
	case EventTypeStart:
		d.state.Status = commands.Running
	case EventTypeTimeStart:
		d.state.TimerRunning = true
	case EventTypeTimeStop, EventTypeTimeFinish:
		d.state.TimerRunning = false
	case EventTypeChangeTemp, EventTypeChangeParam:
		// The new values are not in the event; re-read them.
	}
	d.postStateLocked()
	d.disp.post(func() { d.sink.event(d, ev) })
	d.mu.Unlock()
	d.requestPoll()
}

// dispatcher runs callbacks for one device, in order, outside any lock.
// post never blocks, so code running inside a callback may post (and send
// commands) without deadlocking.
type dispatcher struct {
	log    *zap.Logger
	mu     sync.Mutex
	q      []func()
	closed bool
	wake   chan struct{}
}

const maxDispatchQueue = 256

func newDispatcher(log *zap.Logger) *dispatcher {
	return &dispatcher{log: log, wake: make(chan struct{}, 1)}
}

func (p *dispatcher) post(f func()) {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return
	}
	if len(p.q) >= maxDispatchQueue {
		p.q = p.q[1:]
		p.log.Warn("callback queue full, dropping oldest notification")
	}
	p.q = append(p.q, f)
	p.mu.Unlock()
	select {
	case p.wake <- struct{}{}:
	default:
	}
}

// close stops accepting posts; run exits after draining what was queued.
func (p *dispatcher) close() {
	p.mu.Lock()
	p.closed = true
	p.mu.Unlock()
	select {
	case p.wake <- struct{}{}:
	default:
	}
}

func (p *dispatcher) run() {
	for {
		p.mu.Lock()
		if len(p.q) == 0 {
			closed := p.closed
			p.mu.Unlock()
			if closed {
				return
			}
			<-p.wake
			continue
		}
		f := p.q[0]
		p.q[0] = nil
		p.q = p.q[1:]
		p.mu.Unlock()
		f()
	}
}
