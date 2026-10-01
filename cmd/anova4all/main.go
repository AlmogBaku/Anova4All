package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/spf13/viper"
	"go.uber.org/zap"

	"anova4all/internal/auth"
	"anova4all/internal/control"
	"anova4all/internal/cook"
	"anova4all/internal/mcp"
	"anova4all/internal/rest"
	"anova4all/internal/store"
	"anova4all/pkg/wifi"
)

func main() {
	cfg := loadConfig()
	logger := newLogger(cfg.GetString("env"))
	defer func() { _ = logger.Sync() }()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, cfg, logger); err != nil {
		logger.Error("fatal", zap.Error(err))
		_ = logger.Sync()
		os.Exit(1)
	}
}

// touchLastSeen records that the cooker idCard was connected until now (on connect and
// on disconnect). Unpaired cookers have no row and are skipped.
func touchLastSeen(ctx context.Context, st *store.Store, idCard string) {
	if d, err := st.DeviceByIDCard(ctx, idCard); err == nil {
		_ = st.TouchLastSeen(ctx, d.ID)
	}
}

func newLogger(env string) *zap.Logger {
	switch strings.ToUpper(env) {
	case "DEV", "DEVELOPMENT":
		return zap.Must(zap.NewDevelopment())
	}
	return zap.Must(zap.NewProduction())
}

// run starts everything and blocks until ctx is cancelled, then shuts down in order:
// HTTP (SSE streams first), the cooker link, then the database.
func run(ctx context.Context, cfg *viper.Viper, logger *zap.Logger) error {
	supabaseURL := strings.TrimRight(cfg.GetString("supabase_url"), "/")
	if supabaseURL == "" {
		return errors.New("SUPABASE_URL is not set")
	}
	st, err := store.Open(ctx, cfg.GetString("database_url"))
	if err != nil {
		return err
	}
	defer st.Close()

	jwks, err := keyfunc.NewDefaultCtx(ctx, []string{supabaseURL + "/auth/v1/.well-known/jwks.json"})
	if err != nil {
		return fmt.Errorf("jwks: %w", err)
	}
	verifier := auth.New(jwks.Keyfunc, supabaseURL+"/auth/v1")

	hub := rest.NewHub()
	// Cooker callbacks wait until everything below is wired.
	ready := make(chan struct{})
	var readyOnce sync.Once
	closeReady := func() { readyOnce.Do(func() { close(ready) }) }
	var ctl *control.Service
	var mgr *wifi.Manager
	var cooks *cook.Service // nil only if run returns before wiring finished

	publish := func(idCard string) {
		if dev, ok := mgr.Bound(idCard); ok {
			s := dev.State()
			hub.State(idCard, &s)
		} else {
			hub.State(idCard, nil)
		}
	}
	mgr, err = wifi.NewManager(ctx, fmt.Sprintf(":%d", cfg.GetInt("anova_server_port")), wifi.Options{
		Verifier: st,
		OnBound: func(dev wifi.AnovaDevice) {
			<-ready
			touchLastSeen(ctx, st, dev.IDCard())
			publish(dev.IDCard())
			if cooks != nil {
				cooks.OnBound(dev)
			}
		},
		OnGone: func(idCard string, _ wifi.AnovaDevice) {
			<-ready
			touchLastSeen(ctx, st, idCard) // last seen = the last time it was connected
			publish(idCard)                // a replacement may already be bound
		},
		OnState: func(idCard string, s wifi.DeviceState) {
			<-ready
			hub.State(idCard, &s)
			if cooks != nil {
				cooks.OnState(idCard, s)
			}
		},
		OnEvent: func(idCard string, ev wifi.AnovaEvent) {
			<-ready
			if cooks != nil {
				cooks.OnEvent(idCard, ev)
			}
		},
	}, logger)
	if err != nil {
		return fmt.Errorf("cooker listener: %w", err)
	}
	defer func() { closeReady(); _ = mgr.Close() }()
	logger.Info("cooker listener started", zap.Stringer("addr", mgr.Addr()))

	ctl = control.New(st, mgr, control.Options{
		OnCookChanged: hub.CookChanged,
		OnPaired:      func(d store.Device) { hub.Repaired(d.IDCard, d.ID) },
	}, logger.Named("control"))
	cooks = cook.New(ctl, st, logger.Named("cook"))
	defer cooks.Close() // runs before mgr.Close: in-flight auto-stops are cancelled first

	api := rest.New(rest.Options{
		Control:     ctl,
		Verifier:    verifier,
		Hub:         hub,
		CORSOrigins: splitList(cfg.GetString("cors_origins")),
		PublicHost:  cfg.GetString("public_host"),
		PublicPort:  cfg.GetInt("public_anova_port"),
		Cookers:     mgr.BoundCount,
		Logger:      logger,
	})
	if pub := cfg.GetString("mcp_public_url"); pub != "" {
		routes, err := mcp.New(mcp.Options{
			Control:    ctl,
			Verifier:   verifier,
			PublicURL:  pub,
			AuthServer: supabaseURL + "/auth/v1",
			Logger:     logger,
		})
		if err != nil {
			return err
		}
		for _, r := range routes {
			api.Handle(r.Path, r.Handler)
		}
		logger.Info("mcp enabled", zap.String("url", pub))
	}
	closeReady()

	go sweepUnpaired(ctx, ctl, logger)

	var servers []*http.Server
	serve := func(addr string, tls bool) error {
		ln, err := net.Listen("tcp", addr)
		if err != nil {
			return err
		}
		srv := &http.Server{Handler: api, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 2 * time.Minute}
		servers = append(servers, srv)
		go func() {
			var err error
			if tls {
				err = srv.ServeTLS(ln, cfg.GetString("rest_server_tls_cert"), cfg.GetString("rest_server_tls_key"))
			} else {
				err = srv.Serve(ln)
			}
			if err != nil && !errors.Is(err, http.ErrServerClosed) {
				logger.Error("http server stopped", zap.String("addr", addr), zap.Error(err))
			}
		}()
		logger.Info("http server started", zap.String("addr", addr), zap.Bool("tls", tls))
		return nil
	}
	if err := serve(fmt.Sprintf("127.0.0.1:%d", cfg.GetInt("rest_server_port")), false); err != nil {
		return err
	}
	if p := cfg.GetInt("rest_server_tls_port"); p > 0 {
		if cfg.GetString("rest_server_tls_cert") == "" || cfg.GetString("rest_server_tls_key") == "" {
			return errors.New("REST_SERVER_TLS_CERT and REST_SERVER_TLS_KEY are required with REST_SERVER_TLS_PORT")
		}
		if err := serve(fmt.Sprintf(":%d", p), true); err != nil {
			return err
		}
	}

	<-ctx.Done()
	logger.Info("shutting down")
	hub.Close()
	sctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for _, srv := range servers {
		if err := srv.Shutdown(sctx); err != nil {
			logger.Warn("http shutdown", zap.Error(err))
		}
	}
	logger.Info("http stopped")
	// Deferred: mgr.Close(), then st.Close().
	return nil
}

func sweepUnpaired(ctx context.Context, ctl *control.Service, logger *zap.Logger) {
	t := time.NewTicker(10 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := ctl.SweepUnpaired(ctx); err != nil && ctx.Err() == nil {
				logger.Warn("unpair sweep", zap.Error(err))
			}
		}
	}
}

func splitList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func loadConfig() *viper.Viper {
	v := viper.New()
	v.AutomaticEnv()
	v.SetDefault("env", "prod")
	v.SetDefault("anova_server_port", 8080)
	v.SetDefault("rest_server_port", 8000)
	v.SetDefault("rest_server_tls_port", -1)
	v.SetDefault("rest_server_tls_cert", "")
	v.SetDefault("rest_server_tls_key", "")
	v.SetDefault("database_url", "")
	v.SetDefault("supabase_url", "")
	v.SetDefault("cors_origins", "")
	v.SetDefault("public_host", "")
	v.SetDefault("public_anova_port", 8080)
	v.SetDefault("mcp_public_url", "")

	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.SetConfigName("config")
	if err := v.ReadInConfig(); err != nil {
		var notFound viper.ConfigFileNotFoundError
		if !errors.As(err, &notFound) {
			panic(fmt.Errorf("failed to read config file: %w", err))
		}
	}
	return v
}
