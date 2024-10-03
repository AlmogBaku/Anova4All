//go:build !no_wifi

package wifi

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync"
	"time"
)

type EventCallback func(AnovaEvent) error

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
	listenerDone  chan struct{}
}

func NewAnovaConnection(conn net.Conn) AnovaConnection {
	ctx, cancel := context.WithCancel(context.Background())
	c := &connection{
		conn:          conn,
		reader:        bufio.NewReader(conn),
		writer:        bufio.NewWriter(conn),
		responseQueue: make(chan *AnovaMessage, 1),
		listenCtx:     ctx,
		listenCancel:  cancel,
		listenerDone:  make(chan struct{}),
	}
	go func() {
		defer close(c.listenerDone)
		c.listen()
	}()
	return c
}

func (ac *connection) SendCommand(ctx context.Context, message string) (string, error) {
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
		return "", fmt.Errorf("flush error: %w", err)
	}

	log.Printf("--> Sent message: %s", message)

	select {
	case resp := <-ac.responseQueue:
		log.Printf("<-- Received response: %s", *resp)
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
			log.Println("Listening task cancelled")
			return
		default:
			msg, err := ac.receive()
			if err != nil {
				if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) {
					log.Println("Connection closed by remote host")
				} else {
					log.Printf("Error in listening task: %v", err)
				}
				return
			}

			if msg == nil {
				continue
			}

			if IsEvent(msg) {
				event, err := ParseEvent(msg)
				if err != nil {
					log.Printf("Error parsing event: %v", err)
					continue
				}

				if ac.eventCallback != nil {
					if err := ac.eventCallback(event); err != nil {
						log.Printf("Error in event callback: %v", err)
					}
				} else {
					log.Printf("Received event message but no event callback set: %s", *msg)
				}
			} else if ac.cmdLock.TryLock() {
				ac.cmdLock.Unlock()
				log.Printf("Received unexpected message while not locked: %s", *msg)
			} else {
				select {
				case ac.responseQueue <- msg:
				default:
					log.Printf("Response queue full, discarding message: %s", *msg)
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
		log.Printf("Received invalid command, skipping: %s", msg)
		return nil, nil
	}

	return &msg, nil
}

func (ac *connection) SetEventCallback(callback EventCallback) {
	ac.eventCallback = callback
}

func (ac *connection) Close() error {
	ac.listenCancel()
	<-ac.listenerDone
	return ac.conn.Close()
}
