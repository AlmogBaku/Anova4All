// Package control is the single path for every cooker operation. REST and MCP call it;
// internal/cook calls AutoStop and CloseIfIdle. Only this package writes cook rows, and
// every operation on one cooker runs under that cooker's mutex.
package control

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"anova4all/internal/store"
	"anova4all/pkg/commands"
	"anova4all/pkg/wifi"
)

// Ranges enforced on the server.
const (
	MinC, MaxC = 25.0, 100.0
	MinF, MaxF = 77.0, 211.0
	MaxMinutes = 6000
)

const opTimeout = 20 * time.Second

// Link is the part of the cooker registry control needs (implemented by *wifi.Manager).
type Link interface {
	Bound(idCard string) (wifi.AnovaDevice, bool)
	Connections(idCard string) []wifi.AnovaDevice
	Bind(dev wifi.AnovaDevice) error
	Drop(idCard string)
	BoundIDCards() []string
}

// Options are optional hooks, called after the cooker mutex is released.
type Options struct {
	// OnCookChanged is called after a cook was started, updated or ended on idCard.
	// endReason is set when a cook row was closed.
	OnCookChanged func(idCard, endReason string)
	// OnPaired is called after a successful pair, with the (possibly new) device row.
	OnPaired func(dev store.Device)
}

type Service struct {
	st   *store.Store
	link Link
	opts Options
	log  *zap.Logger

	mu    sync.Mutex
	locks map[string]*sync.Mutex // per id_card
}

func New(st *store.Store, link Link, opts Options, log *zap.Logger) *Service {
	return &Service{st: st, link: link, opts: opts, log: log, locks: map[string]*sync.Mutex{}}
}

func (s *Service) lock(idCard string) func() {
	s.mu.Lock()
	l, ok := s.locks[idCard]
	if !ok {
		l = &sync.Mutex{}
		s.locks[idCard] = l
	}
	s.mu.Unlock()
	l.Lock()
	return l.Unlock
}

// ---- status ----

// CookInfo is the open cook, or the last one when none is open.
type CookInfo struct {
	ID        uuid.UUID  `json:"id"`
	StartedAt time.Time  `json:"started_at"`
	AutoStop  bool       `json:"auto_stop"`
	StopsAt   *time.Time `json:"stops_at,omitempty"`
	EndedAt   *time.Time `json:"ended_at,omitempty"`
	EndReason *string    `json:"end_reason,omitempty"`
}

// DeviceStatus is what the cook screen and the MCP tools show for one cooker.
type DeviceStatus struct {
	ID         uuid.UUID         `json:"id"`
	Name       string            `json:"name"`
	IsOwner    bool              `json:"is_owner"`
	Online     bool              `json:"online"`
	LastSeenAt *time.Time        `json:"last_seen_at,omitempty"`
	State      *wifi.DeviceState `json:"state,omitempty"`
	Cook       *CookInfo         `json:"cook,omitempty"`
}

// Access checks membership; it is read fresh on every call.
func (s *Service) Access(ctx context.Context, user, deviceID uuid.UUID) (store.Access, error) {
	a, err := s.st.Access(ctx, deviceID, user)
	if errors.Is(err, store.ErrNotMember) {
		return store.Access{}, ErrNotMember
	}
	return a, err
}

// Status returns one cooker's cached state. It sends no cooker commands.
func (s *Service) Status(ctx context.Context, user, deviceID uuid.UUID) (DeviceStatus, error) {
	a, err := s.Access(ctx, user, deviceID)
	if err != nil {
		return DeviceStatus{}, err
	}
	return s.status(ctx, a)
}

// StatusAll returns every cooker the user can access. It sends no cooker commands.
func (s *Service) StatusAll(ctx context.Context, user uuid.UUID) ([]DeviceStatus, error) {
	all, err := s.st.DevicesForUser(ctx, user)
	if err != nil {
		return nil, err
	}
	out := make([]DeviceStatus, 0, len(all))
	for _, a := range all {
		ds, err := s.status(ctx, a)
		if err != nil {
			return nil, err
		}
		out = append(out, ds)
	}
	return out, nil
}

func (s *Service) status(ctx context.Context, a store.Access) (DeviceStatus, error) {
	ds := DeviceStatus{ID: a.ID, Name: a.Name, IsOwner: a.IsOwner, LastSeenAt: a.LastSeenAt}
	if dev, ok := s.link.Bound(a.IDCard); ok {
		st := dev.State()
		ds.Online, ds.State = true, &st
	}
	c, err := s.st.OpenCook(ctx, a.ID)
	if errors.Is(err, store.ErrNotFound) {
		c, err = s.st.LastCook(ctx, a.ID)
	}
	switch {
	case errors.Is(err, store.ErrNotFound):
	case err != nil:
		return DeviceStatus{}, err
	default:
		ds.Cook = &CookInfo{ID: c.ID, StartedAt: c.StartedAt, AutoStop: c.AutoStop, EndedAt: c.EndedAt, EndReason: c.EndReason}
	}
	return ds.WithState(ds.State), nil
}

// WithState returns ds with a new cooker state (nil = offline) and a recomputed StopsAt.
func (ds DeviceStatus) WithState(st *wifi.DeviceState) DeviceStatus {
	ds.Online, ds.State = st != nil, st
	if ds.Cook != nil {
		ci := *ds.Cook
		ci.StopsAt = nil
		if ci.EndedAt == nil && ci.AutoStop && st != nil && st.TimerRunning {
			t := time.Now().Add(time.Duration(st.TimerValue) * time.Minute).Truncate(time.Minute)
			ci.StopsAt = &t
		}
		ds.Cook = &ci
	}
	return ds
}

// ---- cook operations ----

// StartCook is the input of Start. Minutes nil means no timer.
type StartCook struct {
	Temperature float64                  `json:"temperature"`
	Unit        commands.TemperatureUnit `json:"unit"`
	Minutes     *int                     `json:"minutes,omitempty"`
	AutoStop    bool                     `json:"auto_stop,omitempty"`
}

// UpdateCook is the input of Update. Every field is optional; Temperature needs Unit.
type UpdateCook struct {
	Temperature *float64                  `json:"temperature,omitempty"`
	Unit        *commands.TemperatureUnit `json:"unit,omitempty"`
	Minutes     *int                      `json:"minutes,omitempty"`
	AutoStop    *bool                     `json:"auto_stop,omitempty"`
}

func validTemp(t float64, u commands.TemperatureUnit) error {
	switch u {
	case commands.Celsius:
		if t < MinC || t > MaxC {
			return invalid("temperature must be between %.0f and %.0f °C", MinC, MaxC)
		}
	case commands.Fahrenheit:
		if t < MinF || t > MaxF {
			return invalid("temperature must be between %.0f and %.0f °F", MinF, MaxF)
		}
	default:
		return invalid(`unit must be "c" or "f"`)
	}
	return nil
}

func validMinutes(m *int) error {
	if m != nil && (*m < 0 || *m > MaxMinutes) {
		return invalid("minutes must be between 0 and %d", MaxMinutes)
	}
	return nil
}

func (in StartCook) validate() error {
	if err := validTemp(in.Temperature, in.Unit); err != nil {
		return err
	}
	if err := validMinutes(in.Minutes); err != nil {
		return err
	}
	if in.AutoStop && (in.Minutes == nil || *in.Minutes == 0) {
		return invalid("auto_stop needs minutes")
	}
	return nil
}

func (in UpdateCook) validate() error {
	if in.Temperature == nil && in.Unit == nil && in.Minutes == nil && in.AutoStop == nil {
		return invalid("nothing to update")
	}
	if in.Temperature != nil {
		if in.Unit == nil {
			return invalid("temperature needs unit")
		}
		if err := validTemp(*in.Temperature, *in.Unit); err != nil {
			return err
		}
	} else if in.Unit != nil {
		return invalid("unit needs temperature")
	}
	if err := validMinutes(in.Minutes); err != nil {
		return err
	}
	if in.AutoStop != nil && *in.AutoStop && in.Minutes != nil && *in.Minutes == 0 {
		return invalid("auto_stop needs a timer")
	}
	return nil
}

// cookOp resolves membership, locks the cooker and requires it to be online.
func (s *Service) cookOp(ctx context.Context, user, deviceID uuid.UUID) (store.Access, wifi.AnovaDevice, func(), error) {
	a, err := s.Access(ctx, user, deviceID)
	if err != nil {
		return store.Access{}, nil, nil, err
	}
	unlock := s.lock(a.IDCard)
	dev, ok := s.link.Bound(a.IDCard)
	if !ok {
		unlock()
		return store.Access{}, nil, nil, ErrDeviceOffline
	}
	return a, dev, unlock, nil
}

// Start begins a cook. Refused if the cooker is already heating.
func (s *Service) Start(ctx context.Context, user, deviceID uuid.UUID, in StartCook) (DeviceStatus, error) {
	if err := in.validate(); err != nil {
		return DeviceStatus{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, opTimeout)
	defer cancel()
	a, dev, unlock, err := s.cookOp(ctx, user, deviceID)
	if err != nil {
		return DeviceStatus{}, err
	}
	var ended []string
	err = func() error {
		defer unlock()
		status, err := s.readStatus(ctx, dev)
		if err != nil {
			return err
		}
		if status == commands.Running {
			return ErrCookInProgress
		}
		if closed, err := s.closeOpen(ctx, a.ID, store.EndManual); err != nil {
			return err
		} else if closed {
			ended = append(ended, store.EndManual)
		}
		steps := []commands.Command{
			commands.SetTemperatureUnit{Unit: in.Unit},
			commands.SetTargetTemperature{Temperature: in.Temperature, Unit: in.Unit},
		}
		if in.Minutes != nil {
			steps = append(steps, commands.SetTimer{Minutes: *in.Minutes})
		}
		steps = append(steps, commands.StartDevice{})
		if in.Minutes != nil && *in.Minutes > 0 {
			steps = append(steps, commands.StartTimer{})
		}
		if err := s.run(ctx, dev, steps...); err != nil {
			return err
		}
		_, err = s.st.InsertCook(ctx, a.ID, &user, in.AutoStop)
		return err
	}()
	s.notifyEnded(a, ended)
	if err != nil {
		return DeviceStatus{}, err
	}
	s.log.Info("cook started", zap.Stringer("device", a.ID), zap.Stringer("user", user), zap.Bool("auto_stop", in.AutoStop))
	s.notifyChanged(a.IDCard)
	return s.status(ctx, a)
}

// Update changes the current cook. Refused if the cooker isn't heating, so it never starts the heater.
func (s *Service) Update(ctx context.Context, user, deviceID uuid.UUID, in UpdateCook) (DeviceStatus, error) {
	if err := in.validate(); err != nil {
		return DeviceStatus{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, opTimeout)
	defer cancel()
	a, dev, unlock, err := s.cookOp(ctx, user, deviceID)
	if err != nil {
		return DeviceStatus{}, err
	}
	err = func() error {
		defer unlock()
		status, err := s.readStatus(ctx, dev)
		if err != nil {
			return err
		}
		if status != commands.Running {
			return ErrNoActiveCook
		}
		if in.AutoStop != nil && *in.AutoStop && in.Minutes == nil {
			st := dev.State()
			if !st.TimerRunning || st.TimerValue == 0 {
				return invalid("auto_stop needs a timer")
			}
		}
		var steps []commands.Command
		if in.Temperature != nil {
			steps = append(steps,
				commands.SetTemperatureUnit{Unit: *in.Unit},
				commands.SetTargetTemperature{Temperature: *in.Temperature, Unit: *in.Unit})
		}
		if in.Minutes != nil {
			if *in.Minutes > 0 {
				steps = append(steps, commands.SetTimer{Minutes: *in.Minutes}, commands.StartTimer{})
			} else {
				steps = append(steps, commands.StopTimer{}, commands.SetTimer{Minutes: 0})
			}
		}
		if err := s.run(ctx, dev, steps...); err != nil {
			return err
		}

		c, err := s.st.OpenCook(ctx, a.ID)
		if errors.Is(err, store.ErrNotFound) { // started from the cooker's buttons
			c, err = s.st.InsertCook(ctx, a.ID, nil, false)
		}
		if err != nil {
			return err
		}
		autoStop := c.AutoStop
		if in.AutoStop != nil {
			autoStop = *in.AutoStop
		}
		if in.Minutes != nil && *in.Minutes == 0 {
			autoStop = false // no timer left to stop on
		}
		if autoStop != c.AutoStop {
			return s.st.SetCookAutoStop(ctx, c.ID, autoStop)
		}
		return nil
	}()
	if err != nil {
		return DeviceStatus{}, err
	}
	s.notifyChanged(a.IDCard)
	return s.status(ctx, a)
}

// Stop stops heating and the timer and silences the alarm (except a low-water alarm),
// then closes the open cook. It works with no open cook, to silence an auto-stop alarm.
func (s *Service) Stop(ctx context.Context, user, deviceID uuid.UUID) (DeviceStatus, error) {
	ctx, cancel := context.WithTimeout(ctx, opTimeout)
	defer cancel()
	a, dev, unlock, err := s.cookOp(ctx, user, deviceID)
	if err != nil {
		return DeviceStatus{}, err
	}
	var ended []string
	err = func() error {
		defer unlock()
		status, err := s.readStatus(ctx, dev)
		if err != nil {
			return err
		}
		steps := []commands.Command{commands.StopDevice{}, commands.StopTimer{}}
		if status != commands.LowWater {
			steps = append(steps, commands.ClearAlarm{})
		}
		if err := s.run(ctx, dev, steps...); err != nil {
			return err
		}
		closed, err := s.closeOpen(ctx, a.ID, store.EndStopped)
		if closed {
			ended = append(ended, store.EndStopped)
		}
		return err
	}()
	s.notifyEnded(a, ended)
	if err != nil {
		return DeviceStatus{}, err
	}
	s.log.Info("cook stopped", zap.Stringer("device", a.ID), zap.Stringer("user", user))
	return s.status(ctx, a)
}

// AutoStop stops heating for cook cookID when its timer finished, leaving the alarm sounding.
// It is a no-op if that cook is no longer open or no longer has auto-stop on.
func (s *Service) AutoStop(ctx context.Context, idCard string, cookID uuid.UUID) error {
	ctx, cancel := context.WithTimeout(ctx, opTimeout)
	defer cancel()
	unlock := s.lock(idCard)
	var d store.Device
	closed, err := func() (bool, error) {
		defer unlock()
		var err error
		d, err = s.st.DeviceByIDCard(ctx, idCard)
		if err != nil {
			return false, err
		}
		c, err := s.st.OpenCook(ctx, d.ID)
		if errors.Is(err, store.ErrNotFound) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if c.ID != cookID || !c.AutoStop {
			return false, nil
		}
		dev, ok := s.link.Bound(idCard)
		if !ok {
			return false, ErrDeviceOffline
		}
		// The timer may have been extended since the caller saw it end.
		v, err := s.send(ctx, dev, commands.GetTimerStatus{})
		if err != nil {
			return false, err
		}
		if t, ok := v.(commands.TimerStatus); !ok || (t.Running && t.Minutes > 0) {
			return false, nil
		}
		if err := s.run(ctx, dev, commands.StopDevice{}); err != nil {
			return false, err
		}
		return s.st.CloseCook(ctx, c.ID, store.EndAutoStop)
	}()
	if closed {
		s.log.Info("cook auto-stopped", zap.Stringer("device", d.ID))
		s.notifyEnded(store.Access{Device: d}, []string{store.EndAutoStop})
	}
	return err
}

// CloseIfIdle closes the open cook as "manual" if a fresh read shows the cooker isn't heating
// (heating was stopped from the cooker's buttons). Offline cookers are left alone.
func (s *Service) CloseIfIdle(ctx context.Context, idCard string) error {
	ctx, cancel := context.WithTimeout(ctx, opTimeout)
	defer cancel()
	unlock := s.lock(idCard)
	var d store.Device
	closed, err := func() (bool, error) {
		defer unlock()
		var err error
		d, err = s.st.DeviceByIDCard(ctx, idCard)
		if errors.Is(err, store.ErrNotFound) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		dev, ok := s.link.Bound(idCard)
		if !ok {
			return false, nil
		}
		status, err := s.readStatus(ctx, dev)
		if err != nil || status == commands.Running {
			return false, err
		}
		return s.closeOpen(ctx, d.ID, store.EndManual)
	}()
	if closed {
		s.notifyEnded(store.Access{Device: d}, []string{store.EndManual})
	}
	return err
}

// ---- pairing ----

var (
	keyRe    = regexp.MustCompile(`^[a-z0-9]{10}$`)
	idCardRe = regexp.MustCompile(`^[a-z0-9]{1,64}$`)
)

// Pair makes user the owner of the cooker idCard, if a live connection for it reports key.
func (s *Service) Pair(ctx context.Context, user uuid.UUID, idCard, key string) (store.Device, error) {
	idCard = strings.TrimPrefix(idCard, "anova ")
	if !idCardRe.MatchString(idCard) {
		return store.Device{}, invalid("id_card is not valid")
	}
	if !keyRe.MatchString(key) {
		return store.Device{}, invalid("key must be 10 lowercase letters or digits")
	}
	ctx, cancel := context.WithTimeout(ctx, opTimeout)
	defer cancel()
	unlock := s.lock(idCard)
	d, err := func() (store.Device, error) {
		defer unlock()
		conns := s.link.Connections(idCard)
		if len(conns) == 0 {
			return store.Device{}, ErrDeviceOffline
		}
		// Ask every connection at once under one deadline, so connections that never
		// answer can't use up the budget before the real cooker is asked.
		rctx, rcancel := context.WithTimeout(ctx, 4*time.Second)
		ok := make([]bool, len(conns))
		var wg sync.WaitGroup
		for i, c := range conns {
			wg.Add(1)
			go func() {
				defer wg.Done()
				got, err := c.ReadKey(rctx)
				ok[i] = err == nil && got == key
			}()
		}
		wg.Wait()
		rcancel()
		var matching []wifi.AnovaDevice
		for i, c := range conns { // newest first
			if ok[i] {
				matching = append(matching, c)
			}
		}
		if len(matching) == 0 {
			return store.Device{}, ErrKeyMismatch
		}
		hash, err := store.HashKey(key)
		if err != nil {
			return store.Device{}, err
		}
		d, err := s.st.ClaimDevice(ctx, idCard, hash, user)
		if err != nil {
			return store.Device{}, err
		}
		// The row is the source of truth; if every matching connection died, the cooker
		// re-dials and binds through its stored key.
		for _, c := range matching {
			if err := s.link.Bind(c); err == nil {
				break
			}
		}
		return d, nil
	}()
	if err != nil {
		return store.Device{}, err
	}
	s.log.Info("cooker paired", zap.Stringer("device", d.ID), zap.Stringer("owner", user))
	if s.opts.OnPaired != nil {
		s.opts.OnPaired(d)
	}
	return d, nil
}

// SweepUnpaired drops bound connections whose device row was deleted (unpaired in the browser).
func (s *Service) SweepUnpaired(ctx context.Context) error {
	cards := s.link.BoundIDCards()
	if len(cards) == 0 {
		return nil
	}
	exist, err := s.st.ExistingIDCards(ctx, cards)
	if err != nil {
		return err
	}
	for _, c := range cards {
		if exist[c] {
			continue
		}
		unlock := s.lock(c)
		// Re-check under the lock: a pair may have just created the row.
		again, err := s.st.ExistingIDCards(ctx, []string{c})
		if err == nil && !again[c] {
			s.link.Drop(c)
			s.log.Info("dropped unpaired cooker")
		}
		unlock()
	}
	return nil
}

// ---- helpers ----

func (s *Service) closeOpen(ctx context.Context, deviceID uuid.UUID, reason string) (bool, error) {
	c, err := s.st.OpenCook(ctx, deviceID)
	if errors.Is(err, store.ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return s.st.CloseCook(ctx, c.ID, reason)
}

func (s *Service) notifyEnded(a store.Access, reasons []string) {
	if s.opts.OnCookChanged == nil {
		return
	}
	for _, r := range reasons {
		s.opts.OnCookChanged(a.IDCard, r)
	}
}

func (s *Service) notifyChanged(idCard string) {
	if s.opts.OnCookChanged != nil {
		s.opts.OnCookChanged(idCard, "")
	}
}

func (s *Service) readStatus(ctx context.Context, dev wifi.AnovaDevice) (commands.DeviceStatus, error) {
	v, err := s.send(ctx, dev, commands.GetDeviceStatus{})
	if err != nil {
		return "", err
	}
	st, ok := v.(commands.DeviceStatus)
	if !ok {
		return "", fmt.Errorf("status: unexpected reply type %T", v)
	}
	return st, nil
}

func (s *Service) run(ctx context.Context, dev wifi.AnovaDevice, steps ...commands.Command) error {
	for _, c := range steps {
		if _, err := s.send(ctx, dev, c); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) send(ctx context.Context, dev wifi.AnovaDevice, cmd commands.Command) (any, error) {
	v, err := dev.SendCommand(ctx, cmd)
	if err != nil {
		if errors.Is(err, wifi.ErrOffline) {
			return nil, ErrDeviceOffline
		}
		select {
		case <-dev.Done():
			return nil, ErrDeviceOffline
		default:
		}
		return nil, fmt.Errorf("cooker command %T: %w", cmd, err)
	}
	return v, nil
}
