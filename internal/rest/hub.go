package rest

import (
	"sync"

	"github.com/google/uuid"

	"anova4all/pkg/wifi"
)

const subBuffer = 16

type msgKind int

const (
	msgState msgKind = iota // cooker state changed, or went offline/online
	msgCook                 // a cook was started, updated or ended
)

type message struct {
	kind      msgKind
	state     *wifi.DeviceState // msgState: nil = offline
	endReason string            // msgCook: set when a cook ended
}

// sub is one SSE stream. Only the hub writes to ch; ch is never closed.
type sub struct {
	idCard   string
	deviceID uuid.UUID
	ch       chan message
	done     chan struct{}
	once     sync.Once
}

func (s *sub) kick() { s.once.Do(func() { close(s.done) }) }

// push never blocks: a slow subscriber drops its oldest message.
func (s *sub) push(m message) {
	for {
		select {
		case s.ch <- m:
			return
		default:
		}
		select {
		case <-s.ch:
		default:
		}
	}
}

// Hub fans cooker updates out to SSE streams, keyed by id_card.
type Hub struct {
	mu   sync.Mutex
	subs map[string]map[*sub]struct{}
}

func NewHub() *Hub { return &Hub{subs: map[string]map[*sub]struct{}{}} }

func (h *Hub) subscribe(idCard string, deviceID uuid.UUID) *sub {
	s := &sub{idCard: idCard, deviceID: deviceID, ch: make(chan message, subBuffer), done: make(chan struct{})}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.subs[idCard] == nil {
		h.subs[idCard] = map[*sub]struct{}{}
	}
	h.subs[idCard][s] = struct{}{}
	return s
}

func (h *Hub) unsubscribe(s *sub) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.subs[s.idCard], s)
	if len(h.subs[s.idCard]) == 0 {
		delete(h.subs, s.idCard)
	}
	s.kick()
}

func (h *Hub) broadcast(idCard string, m message) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for s := range h.subs[idCard] {
		s.push(m)
	}
}

// State publishes the cooker's state; nil means offline.
func (h *Hub) State(idCard string, st *wifi.DeviceState) {
	h.broadcast(idCard, message{kind: msgState, state: st})
}

// CookChanged tells streams to re-read the cook; endReason is set when one ended.
func (h *Hub) CookChanged(idCard, endReason string) {
	h.broadcast(idCard, message{kind: msgCook, endReason: endReason})
}

// Repaired closes every stream for idCard that belongs to an old device row.
func (h *Hub) Repaired(idCard string, current uuid.UUID) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for s := range h.subs[idCard] {
		if s.deviceID != current {
			s.kick()
		}
	}
}

// Close ends every stream (shutdown).
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, set := range h.subs {
		for s := range set {
			s.kick()
		}
	}
}
