// Package rest is the browser's live-control API: cooker status, cook operations,
// pairing and the SSE stream. Data the browser can read through RLS (names, members,
// invites, cook history) is not served here. See api.md.
package rest

import (
	"errors"
	"net/http"
	"runtime/debug"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"golang.org/x/time/rate"

	"anova4all/internal/auth"
	"anova4all/internal/control"
)

// Options configure the server.
type Options struct {
	Control  *control.Service
	Verifier *auth.Verifier
	Hub      *Hub
	// CORSOrigins is the browser-origin allow-list. Empty means no CORS headers at all.
	CORSOrigins []string
	// PublicHost and PublicPort are what setup writes to the cooker (`server para`).
	PublicHost string
	PublicPort int
	// Cookers returns the number of connected cookers, for /health.
	Cookers func() int
	// PingEvery is the SSE ping and access re-check interval (default 15 s).
	PingEvery time.Duration
	Logger    *zap.Logger
}

type Server struct {
	*gin.Engine
	opts    Options
	log     *zap.Logger
	pairLim limiter
}

func New(opts Options) *Server {
	if opts.Logger == nil {
		opts.Logger = zap.NewNop()
	}
	if opts.PingEvery == 0 {
		opts.PingEvery = 15 * time.Second
	}
	gin.SetMode(gin.ReleaseMode)
	s := &Server{
		Engine:  gin.New(),
		opts:    opts,
		log:     opts.Logger.Named("rest"),
		pairLim: limiter{every: time.Second, burst: 2, m: map[uuid.UUID]*rate.Limiter{}},
	}
	_ = s.SetTrustedProxies(nil)
	s.Use(s.recovery, s.accessLog)
	if len(opts.CORSOrigins) > 0 {
		s.Use(cors.New(cors.Config{
			AllowOrigins: opts.CORSOrigins,
			AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPatch},
			AllowHeaders: []string{"Authorization", "Content-Type"},
			MaxAge:       time.Hour,
		}))
	}

	s.GET("/health", func(c *gin.Context) {
		n := 0
		if opts.Cookers != nil {
			n = opts.Cookers()
		}
		c.JSON(http.StatusOK, gin.H{"cookers": n})
	})

	api := s.Group("/api", s.requireBrowser)
	api.GET("/server-info", s.serverInfo)
	api.GET("/devices", s.listDevices)
	api.POST("/devices/pair", s.pair)
	api.GET("/devices/:device_id", s.getDevice)
	api.GET("/devices/:device_id/events", s.events)
	api.POST("/devices/:device_id/cook", s.startCook)
	api.PATCH("/devices/:device_id/cook", s.updateCook)
	api.POST("/devices/:device_id/cook/stop", s.stopCook)

	s.NoRoute(func(c *gin.Context) {
		writeError(c, &control.Error{Code: "not_found", Message: "no such endpoint"})
	})
	return s
}

// Handle mounts an extra handler (e.g. /mcp) on an exact path, for every method.
func (s *Server) Handle(path string, h http.Handler) {
	s.Any(path, gin.WrapH(h))
}

// recovery never logs the request: headers carry bearer tokens.
func (s *Server) recovery(c *gin.Context) {
	defer func() {
		if r := recover(); r != nil {
			if err, ok := r.(error); ok && errors.Is(err, http.ErrAbortHandler) {
				panic(r)
			}
			s.log.Error("panic", zap.String("route", c.FullPath()), zap.ByteString("stack", debug.Stack()))
			if !c.Writer.Written() {
				writeError(c, errors.New("panic"))
			}
			c.Abort()
		}
	}()
	c.Next()
}

func (s *Server) accessLog(c *gin.Context) {
	start := time.Now()
	c.Next()
	fields := []zap.Field{
		zap.String("method", c.Request.Method),
		zap.String("route", c.FullPath()),
		zap.Int("status", c.Writer.Status()),
		zap.Duration("took", time.Since(start)),
	}
	if u, ok := c.Get(userKey); ok {
		fields = append(fields, zap.Stringer("user", u.(uuid.UUID)))
	}
	s.log.Info("request", fields...)
}

const userKey = "user"

func (s *Server) requireBrowser(c *gin.Context) {
	if c.Request.Method == http.MethodOptions {
		c.Next()
		return
	}
	raw, ok := auth.BearerToken(c.GetHeader("Authorization"))
	if !ok {
		writeUnauthorized(c)
		return
	}
	claims, err := s.opts.Verifier.Verify(raw, auth.Browser)
	if err != nil {
		s.log.Debug("token refused", zap.Error(err))
		writeUnauthorized(c)
		return
	}
	c.Set(userKey, claims.UserID)
	c.Next()
}

func user(c *gin.Context) uuid.UUID { return c.MustGet(userKey).(uuid.UUID) }

// limiter is a per-user token bucket.
type limiter struct {
	every time.Duration
	burst int
	mu    sync.Mutex
	m     map[uuid.UUID]*rate.Limiter
}

func (l *limiter) allow(u uuid.UUID) bool { return l.allowAt(u, time.Now()) }

func (l *limiter) allowAt(u uuid.UUID, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	lim, ok := l.m[u]
	if !ok {
		lim = rate.NewLimiter(rate.Every(l.every), l.burst)
		l.m[u] = lim
	}
	return lim.AllowN(now, 1)
}
