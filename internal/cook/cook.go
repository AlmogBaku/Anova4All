// Package cook watches cooker state and events and decides when a cook ends on its own:
// it calls control.AutoStop when an auto-stop cook's timer finishes, and
// control.CloseIfIdle when heating stops from the cooker's buttons.
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
	jobAutoStop job = iota + 1 // the timer finished: stop an open auto-stop cook
	jobClose                   // heating stopped: close the open cook if the cooker is idle
)

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
}

// OnEvent handles a cooker event. The timer-finish event is a live report from the cooker.
func (s *Service) OnEvent(idCard string, ev wifi.AnovaEvent) {
	if ev.Type != wifi.EventTypeTimeFinish {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if c := s.cookerLocked(idCard); c != nil {
		s.enqueueLocked(idCard, c, jobAutoStop)
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
		}
	}
}

// autoStop stops the open cook if it has auto-stop on, retrying on errors, once per cook.
func (s *Service) autoStop(idCard string, c *cooker) {
	wait := Backoff
	for attempt := 0; ; attempt++ {
		err := s.tryAutoStop(idCard, c)
		if err == nil || errors.Is(err, control.ErrDeviceOffline) || s.ctx.Err() != nil {
			// Offline: the next bind brings a fresh read that re-checks.
			return
		}
		if attempt == Retries {
			s.log.Error("auto-stop failed", zap.Int("attempts", attempt+1), zap.Error(err))
			return
		}
		s.log.Warn("auto-stop failed, retrying", zap.Error(err))
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
