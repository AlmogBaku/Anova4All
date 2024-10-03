//go:build !no_wifi

package wifi

import (
	"context"
	"fmt"
	"log"
	"net"
	"sync"
)

type ConnectionCallback func(anovaConnection AnovaConnection) error

type AnovaServer interface {
	Close() error
	OnConnection(callback ConnectionCallback)
	HostPort() (string, int)
}

type server struct {
	host               string
	port               int
	listener           net.Listener
	connectionCallback ConnectionCallback
	wg                 sync.WaitGroup
	ctx                context.Context
	cancel             context.CancelFunc
}

func NewAnovaServer(host string, port int) (AnovaServer, error) {
	ctx, cancel := context.WithCancel(context.Background())
	srv := &server{
		host:   host,
		port:   port,
		ctx:    ctx,
		cancel: cancel,
	}
	err := srv.start()
	if err != nil {
		return nil, err
	}
	return srv, nil
}

func (s *server) HostPort() (string, int) {
	return s.host, s.port
}

func (s *server) start() error {
	addr := fmt.Sprintf("%s:%d", s.host, s.port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to start server: %w", err)
	}

	s.listener = listener
	log.Printf("Serving on %s", addr)
	if s.host == "" {
		s.host = listener.Addr().String()
	}

	s.wg.Add(1)
	go s.acceptConnections()

	return nil
}

func (s *server) acceptConnections() {
	defer s.wg.Done()

	for {
		select {
		case <-s.ctx.Done():
			return
		default:
			conn, err := s.listener.Accept()
			if err != nil {
				if ne, ok := err.(net.Error); ok && ne.Timeout() {
					log.Printf("Timeout error accepting connection: %v", err)
					continue
				}
				log.Printf("Error accepting connection: %v", err)
				return
			}

			s.wg.Add(1)
			go s.handleConnection(conn)
		}
	}
}

func (s *server) handleConnection(conn net.Conn) {
	defer s.wg.Done()
	defer conn.Close()

	log.Printf("New connection from %s", conn.RemoteAddr())

	anovaConn := NewAnovaConnection(conn)

	if s.connectionCallback != nil {
		if err := s.connectionCallback(anovaConn); err != nil {
			log.Printf("Error in connection callback: %v", err)
		}
	}

	<-s.ctx.Done()
}

func (s *server) Close() error {
	s.cancel()
	if s.listener != nil {
		if err := s.listener.Close(); err != nil {
			return fmt.Errorf("error closing listener: %w", err)
		}
	}
	s.wg.Wait()
	log.Println("Server stopped")
	return nil
}

func (s *server) OnConnection(callback ConnectionCallback) {
	s.connectionCallback = callback
}
