//go:build !no_wifi

package wifi

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
)

// Errors returned by device commands. Callers should test with errors.Is.
var (
	// ErrOffline means the link to the cooker is closed (or closed while the command was pending).
	ErrOffline = errors.New("wifi: device offline")
	// ErrTimeout means the cooker sent no reply to the command in time.
	ErrTimeout = errors.New("wifi: command timed out")
	// ErrUnexpectedReply means the cooker replied, but never with a reply that fits the command.
	ErrUnexpectedReply = errors.New("wifi: unexpected reply")
	// ErrRejected means the cooker answered "invalid command".
	ErrRejected = errors.New("wifi: command rejected by device")
	// ErrUnsupported means the command cannot be sent over Wi-Fi.
	ErrUnsupported = errors.New("wifi: command not supported over wifi")
	// ErrFrameTooLarge means the cooker sent more than maxFrame bytes without a valid frame.
	ErrFrameTooLarge = errors.New("wifi: frame too large")
)

const (
	// maxFrame caps the bytes accepted without a valid frame (a valid frame is at most 259 bytes).
	maxFrame  = 1024
	frameEnd  = 0x16
	frameHead = 'h'

	replyBuffer = 8
	eventBuffer = 32
	userQueue   = 16
	pollQueue   = 8
)

// timings holds every timeout of the link. Tests shorten them via export_test.go.
type timings struct {
	command   time.Duration // per command reply timeout
	drain     time.Duration // discard window after a timeout (late replies)
	write     time.Duration // per write deadline
	liveness  time.Duration // no frame for this long closes the link
	poll      time.Duration // poll pass interval
	handshake time.Duration // overall handshake deadline
	maxMisses int           // consecutive no-reply timeouts that close the link
	keepAlive time.Duration // TCP keepalive period
}

func defaultTimings() timings {
	return timings{
		command:   3 * time.Second,
		drain:     time.Second,
		write:     3 * time.Second,
		liveness:  6 * time.Second,
		poll:      2 * time.Second,
		handshake: 10 * time.Second,
		maxMisses: 3,
		keepAlive: 30 * time.Second,
	}
}

type priority int

const (
	prioUser priority = iota
	prioPoll
)

type result struct {
	val any
	err error
}

type request struct {
	line   string
	decode func(string) (any, error)
	done   chan result // buffered(1): the writer never blocks on it
	ctx    context.Context
}

func (r *request) reply(v any, err error) { r.done <- result{v, err} }

// conn is one TCP link to a cooker.
//
// Goroutines: readLoop (owns reads, routes frames, closes on any read error or
// liveness timeout) and writeLoop (owns writes, runs one command at a time,
// user queue ahead of poll queue). Nothing but close() closes channels, and it
// only closes done (guarded by sync.Once), so there are no close/send races.
type conn struct {
	nc  net.Conn
	t   timings
	log *zap.Logger

	user    chan *request
	poll    chan *request
	replies chan string
	events  chan AnovaEvent

	done      chan struct{}
	closeOnce sync.Once
	errMu     sync.Mutex
	err       error

	misses int // writeLoop only
}

func newConn(nc net.Conn, t timings, log *zap.Logger) *conn {
	c := &conn{
		nc:      nc,
		t:       t,
		log:     log,
		user:    make(chan *request, userQueue),
		poll:    make(chan *request, pollQueue),
		replies: make(chan string, replyBuffer),
		events:  make(chan AnovaEvent, eventBuffer),
		done:    make(chan struct{}),
	}
	go c.readLoop()
	go c.writeLoop()
	return c
}

// close tears the link down once. Safe from any goroutine.
func (c *conn) close(err error) {
	c.closeOnce.Do(func() {
		c.errMu.Lock()
		c.err = err
		c.errMu.Unlock()
		close(c.done)
		_ = c.nc.Close()
		c.log.Debug("link closed", zap.Error(err))
	})
}

func (c *conn) closed() bool {
	select {
	case <-c.done:
		return true
	default:
		return false
	}
}

// cause returns why the link closed (nil while open).
func (c *conn) cause() error {
	c.errMu.Lock()
	defer c.errMu.Unlock()
	return c.err
}

// do queues one command and waits for its validated reply.
func (c *conn) do(ctx context.Context, prio priority, line string, decode func(string) (any, error)) (any, error) {
	if c.closed() {
		return nil, ErrOffline
	}
	req := &request{line: line, decode: decode, done: make(chan result, 1), ctx: ctx}
	q := c.user
	if prio == prioPoll {
		q = c.poll
	}
	select {
	case q <- req:
	case <-c.done:
		return nil, ErrOffline
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	select {
	case r := <-req.done:
		return r.val, r.err
	case <-c.done:
		select { // prefer a result that raced with the close
		case r := <-req.done:
			return r.val, r.err
		default:
			return nil, ErrOffline
		}
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (c *conn) writeLoop() {
	for {
		var req *request
		select {
		case <-c.done:
			return
		case req = <-c.user:
		default:
			select {
			case <-c.done:
				return
			case req = <-c.user:
			case req = <-c.poll:
			}
		}
		if err := req.ctx.Err(); err != nil {
			req.reply(nil, err)
			continue
		}
		c.exec(req)
	}
}

// exec writes one command and waits for a reply that its decoder accepts.
// Replies the decoder rejects are stale (e.g. a late answer to an earlier
// command) and are discarded. After a timeout, replies arriving within the
// drain window are discarded too, so a late reply never reaches the next command.
func (c *conn) exec(req *request) {
	c.discard()

	msg := AnovaMessage(req.line)
	frame, err := msg.MarshalBinary()
	if err != nil {
		req.reply(nil, fmt.Errorf("encode %q: %w", req.line, err))
		return
	}
	frame = append(frame, frameEnd)
	if err := c.nc.SetWriteDeadline(time.Now().Add(c.t.write)); err != nil {
		c.close(fmt.Errorf("set write deadline: %w", err))
		req.reply(nil, ErrOffline)
		return
	}
	if _, err := c.nc.Write(frame); err != nil {
		c.close(fmt.Errorf("write: %w", err))
		req.reply(nil, ErrOffline)
		return
	}

	timer := time.NewTimer(c.t.command)
	defer timer.Stop()
	sawStale := false
	for {
		select {
		case <-c.done:
			req.reply(nil, ErrOffline)
			return
		case line := <-c.replies:
			if strings.Contains(strings.ToLower(line), "invalid command") {
				c.misses = 0
				req.reply(nil, fmt.Errorf("%w: %q", ErrRejected, req.line))
				return
			}
			v, err := req.decode(line)
			if err != nil {
				sawStale = true
				c.log.Debug("discarding reply that does not fit the command", zap.String("command", req.line))
				continue
			}
			c.misses = 0
			req.reply(v, nil)
			return
		case <-timer.C:
			if sawStale {
				req.reply(nil, fmt.Errorf("%w to %q", ErrUnexpectedReply, req.line))
			} else {
				c.misses++
				req.reply(nil, fmt.Errorf("%w: %q", ErrTimeout, req.line))
				if c.t.maxMisses > 0 && c.misses >= c.t.maxMisses {
					c.close(fmt.Errorf("%d consecutive commands without reply", c.misses))
					return
				}
			}
			c.drainFor(c.t.drain)
			return
		}
	}
}

// discard drops replies already buffered (nothing is in flight, so they are stale).
func (c *conn) discard() {
	for {
		select {
		case <-c.replies:
		default:
			return
		}
	}
}

func (c *conn) drainFor(d time.Duration) {
	if d <= 0 {
		return
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	for {
		select {
		case <-c.replies:
		case <-timer.C:
			return
		case <-c.done:
			return
		}
	}
}

// readLoop parses length-prefixed frames ('h', len, payload, checksum, optional 0x16).
// It parses by the length byte rather than splitting on 0x16, because 0x16 can
// appear inside a frame (as the length, an encoded byte or the checksum).
// Bytes between frames are skipped; more than maxFrame of them closes the link.
func (c *conn) readLoop() {
	r := bufio.NewReaderSize(c.nc, maxFrame)
	junk := 0
	for {
		if err := c.nc.SetReadDeadline(time.Now().Add(c.t.liveness)); err != nil {
			c.close(fmt.Errorf("set read deadline: %w", err))
			return
		}
		b, err := r.ReadByte()
		if err != nil {
			c.close(readErr(err))
			return
		}
		if b != frameHead {
			junk++
			if junk > maxFrame {
				c.close(ErrFrameTooLarge)
				return
			}
			continue
		}
		n, err := r.ReadByte()
		if err != nil {
			c.close(readErr(err))
			return
		}
		// 'h' + len + payload(n) + checksum, plus a trailing 0x16 so that
		// UnmarshalBinary strips ours and never a checksum that equals 0x16.
		buf := make([]byte, int(n)+4)
		buf[0], buf[1] = frameHead, n
		if _, err := io.ReadFull(r, buf[2:len(buf)-1]); err != nil {
			c.close(readErr(err))
			return
		}
		buf[len(buf)-1] = frameEnd
		var msg AnovaMessage
		if err := msg.UnmarshalBinary(buf); err != nil {
			junk += len(buf) - 1
			c.log.Debug("discarding undecodable frame", zap.Error(err))
			if junk > maxFrame {
				c.close(ErrFrameTooLarge)
				return
			}
			continue
		}
		junk = 0
		c.route(msg)
	}
}

func readErr(err error) error {
	var ne net.Error
	if errors.As(err, &ne) && ne.Timeout() {
		return fmt.Errorf("no frame received in time: %w", err)
	}
	return fmt.Errorf("read: %w", err)
}

// route hands a frame to the event channel or the reply channel. It never blocks.
func (c *conn) route(msg AnovaMessage) {
	if IsEvent(&msg) {
		ev, err := ParseEvent(&msg)
		if err != nil {
			c.log.Debug("ignoring unknown event", zap.Error(err))
			return
		}
		select {
		case c.events <- ev:
		default:
			c.log.Warn("event buffer full, dropping event", zap.String("type", string(ev.Type)))
		}
		return
	}
	select {
	case c.replies <- string(msg):
	default:
		c.log.Debug("reply buffer full, dropping reply")
	}
}
