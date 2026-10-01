//go:build !no_wifi

package wifi

import (
	"context"
	"errors"
	"fmt"
	"net"
	"sort"
	"sync"
	"time"

	"go.uber.org/zap"
)

// KeyVerifier checks a cooker's key against the stored one.
type KeyVerifier interface {
	VerifyKey(ctx context.Context, idCard, key string) (bool, error)
}

// Options configure a Manager. Callbacks run on a per-device goroutine,
// in order per device, outside any lock; they may call back into the
// device or the Manager (but should not block for long).
type Options struct {
	Verifier KeyVerifier
	// OnBound: a device became bound (controllable).
	OnBound func(dev AnovaDevice)
	// OnGone: a bound device disconnected or was replaced/dropped. Compare dev
	// with the current Bound() device: a replacement's OnBound may arrive first.
	OnGone func(idCard string, dev AnovaDevice)
	// OnState: state changed (bound devices only); only when it differs from the previous one.
	OnState func(idCard string, st DeviceState)
	// OnEvent: cooker events (bound devices only).
	OnEvent func(idCard string, ev AnovaEvent)

	PendingTTL time.Duration // default 120s
	MaxPending int           // default 64, oldest dropped
	// MaxUnboundPerIP caps one source's connections that aren't bound yet
	// (handshaking or pending); beyond it new ones are refused. Default 8.
	MaxUnboundPerIP int
	Now             func() time.Time // optional, for tests

	timings  *timings              // tests only (export_test.go)
	remoteIP func(net.Conn) string // tests only (export_test.go)
}

type entry struct {
	bound    bool // controllable now
	wasBound bool // OnBound was posted; OnGone is owed
}

// Manager accepts cooker connections and keeps the bound/pending registry.
type Manager struct {
	opts Options
	t    timings
	log  *zap.Logger
	ln   net.Listener

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
	once   sync.Once

	mu      sync.Mutex
	seq     uint64
	closed  bool
	entries map[*device]*entry
	unbound map[string]int // remote IP → connections not bound yet

	verifySem chan struct{}            // bounds concurrent key checks (database + bcrypt)
	verifying map[string]chan struct{} // remote IP → its key check in flight; closed when done
}

const (
	verifyTimeout       = 5 * time.Second
	maxConcurrentVerify = 2 // the store pool has 4 connections
)

// NewManager listens on listenAddr and serves cooker connections until ctx is done or Close is called.
func NewManager(ctx context.Context, listenAddr string, opts Options, logger *zap.Logger) (*Manager, error) {
	if opts.Verifier == nil {
		return nil, errors.New("wifi: Options.Verifier is required")
	}
	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		return nil, fmt.Errorf("wifi: listen %s: %w", listenAddr, err)
	}
	return newManager(ctx, ln, opts, logger)
}

func newManager(ctx context.Context, ln net.Listener, opts Options, logger *zap.Logger) (*Manager, error) {
	if opts.Verifier == nil {
		_ = ln.Close()
		return nil, errors.New("wifi: Options.Verifier is required")
	}
	if logger == nil {
		logger = zap.NewNop()
	}
	if opts.PendingTTL <= 0 {
		opts.PendingTTL = 120 * time.Second
	}
	if opts.MaxPending <= 0 {
		opts.MaxPending = 64
	}
	if opts.MaxUnboundPerIP <= 0 {
		opts.MaxUnboundPerIP = 8
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	t := defaultTimings()
	if opts.timings != nil {
		t = *opts.timings
	}
	m := &Manager{
		opts:      opts,
		t:         t,
		log:       logger.Named("wifi"),
		ln:        ln,
		entries:   make(map[*device]*entry),
		unbound:   make(map[string]int),
		verifySem: make(chan struct{}, maxConcurrentVerify),
		verifying: make(map[string]chan struct{}),
	}
	if m.opts.remoteIP == nil {
		m.opts.remoteIP = remoteIP
	}
	m.ctx, m.cancel = context.WithCancel(ctx)
	m.log.Info("listening for cookers", zap.Stringer("addr", ln.Addr()))

	m.wg.Add(2)
	go m.serve()
	go m.janitor()
	go func() {
		<-m.ctx.Done()
		_ = m.Close()
	}()
	return m, nil
}

// Addr is the listening address.
func (m *Manager) Addr() net.Addr { return m.ln.Addr() }

// Bound returns the controllable device for idCard, if any.
func (m *Manager) Bound(idCard string) (AnovaDevice, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for d, e := range m.entries {
		if e.bound && d.IDCard() == idCard && !d.c.closed() {
			return d, true
		}
	}
	return nil, false
}

// Connections returns every live connection for idCard (bound and pending), newest first.
func (m *Manager) Connections(idCard string) []AnovaDevice {
	m.mu.Lock()
	var ds []*device
	for d := range m.entries {
		if d.IDCard() == idCard && !d.c.closed() {
			ds = append(ds, d)
		}
	}
	m.mu.Unlock()
	sort.Slice(ds, func(i, j int) bool { return ds[i].seq > ds[j].seq })
	out := make([]AnovaDevice, len(ds))
	for i, d := range ds {
		out[i] = d
	}
	return out
}

// BoundIDCards returns the id cards of the currently bound devices, in any order.
func (m *Manager) BoundIDCards() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	var ids []string
	for d, e := range m.entries {
		if e.bound && !d.c.closed() {
			ids = append(ids, d.IDCard())
		}
	}
	return ids
}

// BoundCount is the number of bound devices.
func (m *Manager) BoundCount() int {
	return len(m.BoundIDCards())
}

// Bind promotes dev to bound for its id card and closes every other connection for that id card.
func (m *Manager) Bind(dev AnovaDevice) error {
	d, ok := dev.(*device)
	if !ok || d == nil {
		return fmt.Errorf("wifi: Bind: not a device from this manager (%T)", dev)
	}
	m.mu.Lock()
	e, ok := m.entries[d]
	if !ok || d.c.closed() {
		m.mu.Unlock()
		return ErrOffline
	}
	newly, others := m.bindLocked(d, e)
	m.mu.Unlock()
	m.afterBind(d, newly, others)
	return nil
}

// Drop closes every connection for idCard (e.g. after unpair).
func (m *Manager) Drop(idCard string) {
	m.mu.Lock()
	var ds []*device
	for d, e := range m.entries {
		if d.IDCard() == idCard {
			e.bound = false
			ds = append(ds, d)
		}
	}
	m.mu.Unlock()
	for _, d := range ds {
		_ = d.Close()
	}
}

// Close stops accepting, closes every connection and waits for the handlers to return.
func (m *Manager) Close() error {
	m.once.Do(func() {
		m.cancel()
		_ = m.ln.Close()
		m.mu.Lock()
		m.closed = true
		ds := make([]*device, 0, len(m.entries))
		for d := range m.entries {
			ds = append(ds, d)
		}
		m.mu.Unlock()
		for _, d := range ds {
			_ = d.Close()
		}
	})
	m.wg.Wait()
	return nil
}

// bindLocked marks d bound and every other connection for the same id card unbound.
func (m *Manager) bindLocked(d *device, e *entry) (newly bool, others []*device) {
	newly = !e.bound
	e.bound, e.wasBound = true, true
	m.releaseLocked(d)
	id := d.IDCard()
	for o, oe := range m.entries {
		if o != d && o.IDCard() == id {
			oe.bound = false
			others = append(others, o)
		}
	}
	return newly, others
}

func (m *Manager) afterBind(d *device, newly bool, others []*device) {
	if newly {
		m.log.Info("cooker bound", zap.String("id_card", d.IDCard()))
		d.disp.post(func() {
			d.announced = true
			if m.opts.OnBound != nil {
				m.opts.OnBound(d)
			}
		})
	}
	for _, o := range others {
		_ = o.Close()
	}
}

// handleConn runs one cooker connection to the end.
func (m *Manager) handleConn(nc net.Conn) {
	ip := m.opts.remoteIP(nc)
	m.mu.Lock()
	if m.unbound[ip] >= m.opts.MaxUnboundPerIP {
		m.mu.Unlock()
		m.log.Warn("too many unbound cooker connections from one address; refused", zap.String("ip", ip))
		_ = nc.Close()
		return
	}
	m.unbound[ip]++
	m.seq++
	seq := m.seq
	m.mu.Unlock()

	d := newDevice(nc, seq, m.opts.Now(), m.t, m.log, sink{state: m.deliverState, event: m.deliverEvent})
	d.ip, d.counted = ip, true // before d is shared; guarded by m.mu from here on
	m.log.Debug("cooker connected", zap.Stringer("remote", nc.RemoteAddr()))

	if verified, ok := m.admit(d); ok {
		m.register(d, verified)
		go d.pollLoop()
	} else {
		_ = d.Close()
	}
	<-d.Done()
	m.unregister(d)
}

// admit does the handshake (with its deadline), one best-effort poll pass, and the key check.
func (m *Manager) admit(d *device) (verified, ok bool) {
	hctx, cancel := context.WithTimeout(m.ctx, m.t.handshake)
	defer cancel()
	key, err := d.handshake(hctx)
	if err != nil {
		d.log.Info("cooker handshake failed", zap.Error(err))
		return false, false
	}
	d.pollOnce(hctx)

	match, err := m.verify(d, key)
	if err != nil {
		d.log.Warn("key verification failed; connection stays pending", zap.Error(err))
		match = false
	}
	return match, !d.c.closed()
}

// verify runs the key check: one at a time per remote address, and at most
// maxConcurrentVerify overall, so one address can't starve everyone's checks
// (bcrypt keeps a Pi 1 core busy). The timeout starts once it's d's address's turn.
func (m *Manager) verify(d *device, key string) (bool, error) {
	done, err := m.verifyTurn(d)
	if err != nil {
		return false, err
	}
	defer done()
	ctx, cancel := context.WithTimeout(m.ctx, verifyTimeout)
	defer cancel()
	select {
	case m.verifySem <- struct{}{}:
	case <-ctx.Done():
		return false, ctx.Err()
	}
	defer func() { <-m.verifySem }()
	return m.opts.Verifier.VerifyKey(ctx, d.IDCard(), key)
}

// verifyTurn waits until no other key check from d's address is in flight.
func (m *Manager) verifyTurn(d *device) (done func(), err error) {
	for {
		m.mu.Lock()
		busy, ok := m.verifying[d.ip]
		if !ok {
			mine := make(chan struct{})
			m.verifying[d.ip] = mine
			m.mu.Unlock()
			return func() {
				m.mu.Lock()
				delete(m.verifying, d.ip)
				m.mu.Unlock()
				close(mine)
			}, nil
		}
		m.mu.Unlock()
		select {
		case <-busy:
		case <-d.Done():
			return nil, errors.New("connection closed while waiting to check its key")
		case <-m.ctx.Done():
			return nil, m.ctx.Err()
		}
	}
}

// releaseLocked frees d's unbound slot, once.
func (m *Manager) releaseLocked(d *device) {
	if !d.counted {
		return
	}
	d.counted = false
	if m.unbound[d.ip]--; m.unbound[d.ip] <= 0 {
		delete(m.unbound, d.ip)
	}
}

func remoteIP(nc net.Conn) string {
	host, _, err := net.SplitHostPort(nc.RemoteAddr().String())
	if err != nil {
		return nc.RemoteAddr().String()
	}
	return host
}

func (m *Manager) register(d *device, verified bool) {
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		_ = d.Close()
		return
	}
	e := &entry{}
	m.entries[d] = e
	if verified {
		newly, others := m.bindLocked(d, e)
		m.mu.Unlock()
		m.afterBind(d, newly, others)
		return
	}
	evict := m.evictLocked()
	m.mu.Unlock()
	d.log.Info("cooker pending (key does not match a paired device)")
	for _, o := range evict {
		_ = o.Close()
	}
}

// evictLocked returns the oldest pending connections beyond MaxPending.
func (m *Manager) evictLocked() []*device {
	var pending []*device
	for d, e := range m.entries {
		if !e.bound && !d.c.closed() {
			pending = append(pending, d)
		}
	}
	if len(pending) <= m.opts.MaxPending {
		return nil
	}
	sort.Slice(pending, func(i, j int) bool { return pending[i].seq < pending[j].seq })
	return pending[:len(pending)-m.opts.MaxPending]
}

// unregister removes exactly this connection (compare-and-delete), so an old
// connection's teardown never removes a newer one.
func (m *Manager) unregister(d *device) {
	m.mu.Lock()
	e, ok := m.entries[d]
	if ok {
		delete(m.entries, d)
	}
	m.releaseLocked(d)
	m.mu.Unlock()
	if ok && e.wasBound {
		m.log.Info("bound cooker gone", zap.String("id_card", d.IDCard()), zap.NamedError("cause", d.c.cause()))
		d.disp.post(func() {
			if m.opts.OnGone != nil {
				m.opts.OnGone(d.IDCard(), d)
			}
		})
	}
	d.disp.close()
}

func (m *Manager) isBound(d *device) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.entries[d]
	return ok && e.bound
}

// deliverState and deliverEvent run on d's dispatch goroutine, after OnBound if any.
func (m *Manager) deliverState(d *device, st DeviceState) {
	if m.opts.OnState != nil && d.announced && m.isBound(d) {
		m.opts.OnState(d.IDCard(), st)
	}
}

func (m *Manager) deliverEvent(d *device, ev AnovaEvent) {
	if m.opts.OnEvent != nil && d.announced && m.isBound(d) {
		m.opts.OnEvent(d.IDCard(), ev)
	}
}

// janitor closes pending connections older than PendingTTL.
func (m *Manager) janitor() {
	defer m.wg.Done()
	every := min(max(m.opts.PendingTTL/4, 10*time.Millisecond), 5*time.Second)
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-m.ctx.Done():
			return
		case <-t.C:
			m.sweep()
		}
	}
}

func (m *Manager) sweep() {
	now := m.opts.Now()
	m.mu.Lock()
	var expired []*device
	for d, e := range m.entries {
		if !e.bound && !d.c.closed() && now.Sub(d.connectedAt) >= m.opts.PendingTTL {
			expired = append(expired, d)
		}
	}
	m.mu.Unlock()
	for _, d := range expired {
		d.log.Info("pending cooker expired")
		_ = d.Close()
	}
}
