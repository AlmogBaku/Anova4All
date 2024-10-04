//go:build !no_wifi

package wifi

import (
	"context"
	"errors"
	"fmt"
	"go.uber.org/zap"
	"net"
	"sync"
)

type ConnectionCallback func(ctx context.Context, anovaConnection AnovaConnection) error

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
	logger             *zap.SugaredLogger
}

func NewAnovaServer(ctx context.Context, host string, port int, logger *zap.Logger) (AnovaServer, error) {
	if logger == nil {
		logger = zap.NewNop()
	}
	logger = logger.Named("wifi_server")

	srv := &server{
		host:   host,
		port:   port,
		ctx:    ctx,
		logger: logger.Sugar(),
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

// GetLocalIP returns the non loopback local IP of the host
func localIP() (string, error) {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "", err
	}
	for _, address := range addrs {
		// check the address type and if it is not a loopback the display it
		if ipnet, ok := address.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String(), nil
			}
		}
	}
	return "", fmt.Errorf("no local IP address found")
}

func (s *server) start() error {
	addr := fmt.Sprintf("%s:%d", s.host, s.port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to start server: %w", err)
	}

	s.listener = listener
	s.logger.With("address", addr).Info("Serving...")
	if s.host == "" {
		s.host, _ = localIP()
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
				var ne net.Error
				if errors.As(err, &ne) && ne.Timeout() {
					s.logger.With("error", err).Error("Timeout error accepting connection")
					continue
				}
				s.logger.With("error", err).Error("Error accepting connection")
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

	s.logger.With("remote_addr", conn.RemoteAddr()).Info("New connection")

	anovaConn := NewAnovaConnection(s.ctx, conn, s.logger.Desugar())

	if s.connectionCallback != nil {
		if err := s.connectionCallback(anovaConn.Context(), anovaConn); err != nil {
			s.logger.With("error", err).Error("Error in connection callback")
		}
	}

	<-s.ctx.Done()
}

func (s *server) Close() error {
	if s.listener != nil {
		if err := s.listener.Close(); err != nil {
			return fmt.Errorf("error closing listener: %w", err)
		}
	}
	s.wg.Wait()
	s.logger.Info("Server stopped")
	return nil
}

func (s *server) OnConnection(callback ConnectionCallback) {
	s.connectionCallback = callback
}
