// Package cook watches cooker state and events and acts on them: it calls
// control.StartWaitingTimer when the water reaches the set point (a cook's timer waits
// for it, as in the Anova app), control.AutoStop when an auto-stop cook's timer finishes,
// and control.CloseIfIdle when heating stops from the cooker's buttons.
//
// It writes no rows and sends no cooker commands itself; internal/control does both.
// No deadline is stored: every decision comes from the cooker's latest timer reading
// (or its timer-finish event), so extending the timer simply moves the end, and after a
// restart nothing happens until a fresh read confirms the timer ended.
package cook

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"anova4all/internal/control"
	"anova4all/internal/store"
	"anova4all/pkg/commands"
	"anova4all/pkg/wifi"
)

// Control is the part of internal/control this package calls (implemented by *control.Service).
type Control interface {
	AutoStop(ctx context.Context, idCard string, cookID uuid.UUID) error
	StartWaitingTimer(ctx context.Context, idCard string) error
	CloseIfIdle(ctx context.Context, idCard string) error
}

// Store is the read-only part of the store this package needs (implemented by *store.Store).
type Store interface {
	DeviceByIDCard(ctx context.Context, idCard string) (store.Device, error)
	OpenCook(ctx context.Context, deviceID uuid.UUID) (store.Cook, error)
}

// Retries is how often a failed auto-stop is retried, and Backoff the first wait (doubled each time).
const (
	Retries = 3
	Backoff = 500 * time.Millisecond
)

type job int

const (
	jobAutoStop   job = iota + 1 // the timer finished: stop an open auto-stop cook
	jobClose                     // heating stopped: close the open cook if the cooker is idle
	jobStartTimer                // the water reached the set point: start a waiting timer
)

// timerReady: heating at the set point with a set timer that isn't running, so a waiting
// timer may start. control.StartWaitingTimer checks the cook really has one waiting.
func timerReady(st wifi.DeviceState) bool {
	return st.Status == commands.Running && !st.TimerRunning && st.TimerValue > 0 && control.Reached(st)
}

// cooker is the per-id_card state. Fields are guarded by Service.mu.
type cooker struct {
	last    wifi.DeviceState // last reading seen
	hasLast bool
	pending []job
	running bool      // a worker goroutine is draining pending
	stopped uuid.UUID // the last cook auto-stopped, so each cook is stopped at most once
}

// Service turns cooker callbacks into control calls. Callbacks return immediately;
// the work runs on one goroutine per cooker, in order.
type Service struct {
	ctl Control
	st  Store
	log *zap.Logger

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	mu      sync.Mutex
	closed  bool
	cookers map[string]*cooker
}

func New(ctl Control, st Store, log *zap.Logger) *Service {
	ctx, cancel := context.WithCancel(context.Background())
	return &Service{ctl: ctl, st: st, log: log, ctx: ctx, cancel: cancel, cookers: map[string]*cooker{}}
}

// Close cancels in-flight work and waits for the workers to return. Later callbacks are ignored.
func (s *Service) Close() {
	s.mu.Lock()
	s.closed = true
	s.mu.Unlock()
	s.cancel()
	s.wg.Wait()
}

// OnBound handles a newly bound connection. dev.State() is a fresh full poll, so it is
// the first reading trusted after a (re)connect or a server restart.
func (s *Service) OnBound(dev wifi.AnovaDevice) {
	st := dev.State()
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.cookerLocked(dev.IDCard())
	if c == nil {
		return
	}
	c.last, c.hasLast = st, true
	switch {
	case st.Status != commands.Running:
		s.enqueueLocked(dev.IDCard(), c, jobClose) // heating may have stopped while we were away
	case st.TimerValue == 0:
		s.enqueueLocked(dev.IDCard(), c, jobAutoStop) // heating with the timer at 0: it ended
	case timerReady(st):
		s.enqueueLocked(dev.IDCard(), c, jobStartTimer) // reached the set point while we were away
	}
}

// OnState handles a state change of a bound cooker.
func (s *Service) OnState(idCard string, st wifi.DeviceState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.cookerLocked(idCard)
	if c == nil {
		return
	}
	prev, hadPrev := c.last, c.hasLast
	c.last, c.hasLast = st, true
	if !hadPrev {
		return // only OnBound's fresh read starts tracking
	}
	if prev.Status == commands.Running && st.Status != commands.Running {
		s.enqueueLocked(idCard, c, jobClose)
		return
	}
	// The timer was counting down and now reads 0 while still heating. A manual timer
	// stop leaves minutes on it (and stops it first), so it never matches.
	if st.Status == commands.Running && st.TimerValue == 0 && prev.TimerRunning && prev.TimerValue > 0 {
		s.enqueueLocked(idCard, c, jobAutoStop)
	}
	// Only on becoming ready, so readings after a manual timer stop don't each re-check.
	if timerReady(st) && !timerReady(prev) {
		s.enqueueLocked(idCard, c, jobStartTimer)
	}
}

// OnEvent handles a cooker event. The timer-finish and temp-reached events are live reports from the cooker.
func (s *Service) OnEvent(idCard string, ev wifi.AnovaEvent) {
	var j job
	switch ev.Type {
	case wifi.EventTypeTimeFinish:
		j = jobAutoStop
	case wifi.EventTypeTempReached:
		j = jobStartTimer
	default:
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if c := s.cookerLocked(idCard); c != nil {
		s.enqueueLocked(idCard, c, j)
	}
}

func (s *Service) cookerLocked(idCard string) *cooker {
	if s.closed {
		return nil
	}
	c, ok := s.cookers[idCard]
	if !ok {
		c = &cooker{}
		s.cookers[idCard] = c
	}
	return c
}

// enqueueLocked adds j unless it is already pending (a pending job reads fresh data anyway).
func (s *Service) enqueueLocked(idCard string, c *cooker, j job) {
	for _, p := range c.pending {
		if p == j {
			return
		}
	}
	c.pending = append(c.pending, j)
	if !c.running {
		c.running = true
		s.wg.Add(1)
		go s.work(idCard, c)
	}
}

func (s *Service) work(idCard string, c *cooker) {
	defer s.wg.Done()
	for {
		s.mu.Lock()
		if len(c.pending) == 0 || s.ctx.Err() != nil {
			c.pending, c.running = nil, false
			s.mu.Unlock()
			return
		}
		j := c.pending[0]
		c.pending = c.pending[1:]
		s.mu.Unlock()

		switch j {
		case jobAutoStop:
			s.autoStop(idCard, c)
		case jobClose:
			if err := s.ctl.CloseIfIdle(s.ctx, idCard); err != nil && s.ctx.Err() == nil {
				s.log.Warn("close idle cook", zap.Error(err))
			}
		case jobStartTimer:
			s.retry("start waiting timer", func() error { return s.ctl.StartWaitingTimer(s.ctx, idCard) })
		}
	}
}

// autoStop stops the open cook if it has auto-stop on, retrying on errors, once per cook.
func (s *Service) autoStop(idCard string, c *cooker) {
	s.retry("auto-stop", func() error { return s.tryAutoStop(idCard, c) })
}

// retry runs op until it succeeds, Retries times more at most.
func (s *Service) retry(what string, op func() error) {
	wait := Backoff
	for attempt := 0; ; attempt++ {
		err := op()
		if err == nil || errors.Is(err, control.ErrDeviceOffline) || s.ctx.Err() != nil {
			// Offline: the next bind brings a fresh read that re-checks.
			return
		}
		if attempt == Retries {
			s.log.Error(what+" failed", zap.Int("attempts", attempt+1), zap.Error(err))
			return
		}
		s.log.Warn(what+" failed, retrying", zap.Error(err))
		select {
		case <-s.ctx.Done():
			return
		case <-time.After(wait):
		}
		wait *= 2
	}
}

func (s *Service) tryAutoStop(idCard string, c *cooker) error {
	d, err := s.st.DeviceByIDCard(s.ctx, idCard)
	if errors.Is(err, store.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	ck, err := s.st.OpenCook(s.ctx, d.ID)
	if errors.Is(err, store.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	s.mu.Lock()
	done := ck.ID == c.stopped
	s.mu.Unlock()
	if !ck.AutoStop || done {
		return nil
	}
	// control re-checks under the cooker mutex that this cook is still open with auto-stop on.
	if err := s.ctl.AutoStop(s.ctx, idCard, ck.ID); err != nil {
		return err
	}
	s.mu.Lock()
	c.stopped = ck.ID
	s.mu.Unlock()
	return nil
}
