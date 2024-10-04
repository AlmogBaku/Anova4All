//go:build !no_wifi

package wifi

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"go.uber.org/zap"
	"io"
	"net"
	"strings"
	"sync"
	"time"
)

type EventCallback func(ctx context.Context, event AnovaEvent) error

type AnovaConnection interface {
	SendCommand(ctx context.Context, message string) (string, error)
	SetEventCallback(callback EventCallback)
	Close() error
}
type connection struct {
	conn          net.Conn
	reader        *bufio.Reader
	writer        *bufio.Writer
	eventCallback EventCallback
	responseQueue chan *AnovaMessage
	cmdLock       sync.Mutex
	listenCtx     context.Context
	listenCancel  context.CancelFunc
	logger        *zap.SugaredLogger
}

func NewAnovaConnection(ctx context.Context, conn net.Conn, logger *zap.Logger) AnovaConnection {
	if logger == nil {
		logger = zap.NewNop()
	}
	logger = logger.Named("wifi_connection")

	ctx, cancel := context.WithCancel(ctx)
	c := &connection{
		conn:          conn,
		reader:        bufio.NewReader(conn),
		writer:        bufio.NewWriter(conn),
		responseQueue: make(chan *AnovaMessage, 1),
		listenCtx:     ctx,
		listenCancel:  cancel,
		logger:        logger.Sugar(),
	}
	go func() {
		c.listen()
	}()
	go func() {
		select {
		case <-ctx.Done():
			close(c.responseQueue)
		}
	}()
	return c
}

func (ac *connection) SendCommand(ctx context.Context, message string) (string, error) {
	select {
	case <-ac.listenCtx.Done():
		return "", errors.New("connection closed")
	default:
	}

	ac.cmdLock.Lock()
	defer ac.cmdLock.Unlock()

	anovaMsg := AnovaMessage(message)
	encoded, err := (&anovaMsg).MarshalBinary()
	if err != nil {
		return "", fmt.Errorf("encoding error: %w", err)
	}

	_, err = ac.writer.Write(encoded)
	if err != nil {
		return "", fmt.Errorf("write error: %w", err)
	}

	_, err = ac.writer.Write([]byte{0x16})
	if err != nil {
		return "", fmt.Errorf("write error: %w", err)
	}

	err = ac.writer.Flush()
	if err != nil {
		if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) {
			ac.logger.Error("Connection closed by remote host")
			ac.listenCancel()
		}
		return "", fmt.Errorf("flush error: %w", err)
	}

	ac.logger.Debugf("--> Sent message: %s", message)

	select {
	case resp := <-ac.responseQueue:
		ac.logger.Debugf("<-- Received response: %s", *resp)
		return string(*resp), nil
	case <-ctx.Done():
		return "", ctx.Err()
	case <-time.After(10 * time.Second):
		return "", errors.New("timeout waiting for response")
	}
}

func (ac *connection) listen() {
	for {
		select {
		case <-ac.listenCtx.Done():
			ac.logger.Debug("Listening task cancelled")
			return
		default:
			msg, err := ac.receive()
			if err != nil {
				if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) || errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, io.ErrClosedPipe) {
					ac.logger.Debug("Connection closed by remote host")
					ac.listenCancel()
				} else {
					ac.logger.With("error", err).Error("Error in listening task")
				}
				return
			}

			if msg == nil {
				continue
			}

			if IsEvent(msg) {
				event, err := ParseEvent(msg)
				if err != nil {
					ac.logger.With("error", err).Error("Error parsing event")
					continue
				}

				if ac.eventCallback != nil {
					if err := ac.eventCallback(ac.listenCtx, event); err != nil {
						ac.logger.With("error", err).Error("Error in event callback")
					}
				} else {
					ac.logger.With("event", event).Debug("Received event message but no event callback set")
				}
			} else if ac.cmdLock.TryLock() {
				ac.cmdLock.Unlock()
				ac.logger.Debugf("Received unexpected message while locked, discarding: %s", *msg)
			} else {
				select {
				case ac.responseQueue <- msg:
				default:
					ac.logger.Debugf("Response queue full, discarding message: %s", *msg)
				}
			}
		}
	}
}

func (ac *connection) receive() (*AnovaMessage, error) {
	buff := make([]byte, 1024)
	n, err := ac.reader.Read(buff)
	if err != nil {
		return nil, err
	}
	buff = buff[:n]

	// Remove the SYN character if it's present at the end
	if len(buff) > 0 && buff[len(buff)-1] == 0x16 {
		buff = buff[:len(buff)-1]
	}

	var msg AnovaMessage
	if err := (&msg).UnmarshalBinary(buff); err != nil {
		return nil, fmt.Errorf("decoding error: %w", err)
	}

	if strings.Contains(strings.ToLower(string(msg)), "invalid command") {
		ac.logger.Debugf("Received invalid command, skipping: %s", msg)
		return nil, nil
	}

	return &msg, nil
}

func (ac *connection) SetEventCallback(callback EventCallback) {
	ac.eventCallback = callback
}

func (ac *connection) Close() error {
	ac.listenCancel()
	<-ac.listenCtx.Done()
	return ac.conn.Close()
}
