//go:build !no_wifi

package wifi

import (
	"context"
	"net"
	"time"

	"go.uber.org/zap"
)

// TestTimings shortens the link timeouts for tests. Zero fields keep the default.
type TestTimings struct {
	Command, Drain, Write, Liveness, Poll, Handshake time.Duration
	MaxMisses                                        int
}

func WithTimings(o Options, tt TestTimings) Options {
	t := defaultTimings()
	set := func(dst *time.Duration, v time.Duration) {
		if v > 0 {
			*dst = v
		}
	}
	set(&t.command, tt.Command)
	set(&t.drain, tt.Drain)
	set(&t.write, tt.Write)
	set(&t.liveness, tt.Liveness)
	set(&t.poll, tt.Poll)
	set(&t.handshake, tt.Handshake)
	if tt.MaxMisses != 0 {
		t.maxMisses = tt.MaxMisses
	}
	o.timings = &t
	return o
}

func NewManagerWithListener(ctx context.Context, ln net.Listener, opts Options, logger *zap.Logger) (*Manager, error) {
	return newManager(ctx, ln, opts, logger)
}

func (m *Manager) Sweep() { m.sweep() }
