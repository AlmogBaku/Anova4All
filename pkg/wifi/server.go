//go:build !no_wifi

package wifi

import (
	"errors"
	"net"
	"time"

	"go.uber.org/zap"
)

const maxAcceptBackoff = time.Second

// serve accepts cooker connections. It backs off on accept errors and exits
// only when the listener is closed.
func (m *Manager) serve() {
	defer m.wg.Done()
	var backoff time.Duration
	for {
		nc, err := m.ln.Accept()
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return
			}
			backoff = min(max(2*backoff, 5*time.Millisecond), maxAcceptBackoff)
			m.log.Warn("accept failed; retrying", zap.Error(err), zap.Duration("backoff", backoff))
			select {
			case <-time.After(backoff):
				continue
			case <-m.ctx.Done():
				return
			}
		}
		backoff = 0
		if tc, ok := nc.(*net.TCPConn); ok {
			_ = tc.SetKeepAlive(true)
			_ = tc.SetKeepAlivePeriod(m.t.keepAlive)
		}
		m.wg.Add(1)
		go func() {
			defer m.wg.Done()
			m.handleConn(nc)
		}()
	}
}
