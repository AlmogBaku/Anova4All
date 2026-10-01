//go:build !no_wifi

// Command fakecooker is a fake Anova Wi-Fi cooker for local development. It dials the
// server's cooker port, answers like a real cooker (see wifitest), heats toward the set
// point while running, counts the timer down, and redials when the link drops.
//
//	go run ./cmd/fakecooker -addr 127.0.0.1:8080
//
// Synthetic identity by default. Logs go to stderr; the key is never logged.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	"anova4all/pkg/wifi/wifitest"
)

type config struct {
	Addr    string
	IDCard  string
	Key     string
	Version string
	Temp    float64 // water temperature at start; it cools back to this when stopped
	SetTemp float64
	Unit    string
	Rate    float64 // degrees per second, heating and cooling

	tick       time.Duration
	minBackoff time.Duration
	maxBackoff time.Duration
}

func parseFlags(args []string) (config, error) {
	cfg := config{tick: time.Second, minBackoff: 500 * time.Millisecond, maxBackoff: 10 * time.Second}
	fs := flag.NewFlagSet("fakecooker", flag.ContinueOnError)
	fs.StringVar(&cfg.Addr, "addr", "127.0.0.1:8080", "server cooker port to dial")
	fs.StringVar(&cfg.IDCard, "id-card", wifitest.IDCard, "reply to `get id card`")
	fs.StringVar(&cfg.Key, "key", wifitest.Key0, "reply to `get number` (the cooker's key)")
	fs.StringVar(&cfg.Version, "version", wifitest.Version, "reply to `version`")
	fs.Float64Var(&cfg.Temp, "temp", 24.0, "water temperature at start (also the ambient it cools to)")
	fs.Float64Var(&cfg.SetTemp, "set-temp", 60.0, "set point at start")
	fs.StringVar(&cfg.Unit, "unit", "c", "temperature unit at start: c or f")
	fs.Float64Var(&cfg.Rate, "rate", 0.5, "heating and cooling rate, degrees per second")
	if err := fs.Parse(args); err != nil {
		return cfg, err
	}
	if cfg.Unit != "c" && cfg.Unit != "f" {
		return cfg, fmt.Errorf("-unit must be c or f, got %q", cfg.Unit)
	}
	if cfg.Rate <= 0 {
		return cfg, fmt.Errorf("-rate must be positive")
	}
	return cfg, nil
}

func main() {
	cfg, err := parseFlags(os.Args[1:])
	if errors.Is(err, flag.ErrHelp) {
		return
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	logger := zap.Must(zap.NewDevelopment()) // stderr
	defer func() { _ = logger.Sync() }()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, cfg, logger); err != nil {
		logger.Error("fatal", zap.Error(err))
		_ = logger.Sync()
		os.Exit(1)
	}
}

// run dials until ctx is cancelled, redialing with backoff. State survives links,
// like a real cooker that lost Wi-Fi.
func run(ctx context.Context, cfg config, logger *zap.Logger) error {
	logger = logger.With(zap.String("addr", cfg.Addr), zap.String("id_card", cfg.IDCard))
	st := wifitest.State{Status: "stopped", Temp: cfg.Temp, SetTemp: cfg.SetTemp, Unit: cfg.Unit}
	key := cfg.Key
	backoff := cfg.minBackoff
	logf := func(format string, args ...any) { logger.Warn(fmt.Sprintf(format, args...)) }
	for {
		c, err := wifitest.Connect(ctx, cfg.Addr, wifitest.Cooker{IDCard: cfg.IDCard, Version: cfg.Version, Key: key, State: &st}, logf)
		if err == nil {
			logger.Info("connected")
			began := time.Now()
			st, key = serve(ctx, c, cfg, cfg.Temp)
			if ctx.Err() != nil {
				return nil
			}
			logger.Info("link closed", zap.Duration("after", time.Since(began).Round(time.Millisecond)))
			if time.Since(began) > cfg.maxBackoff {
				backoff = cfg.minBackoff // the link was up a while: not a crash loop
			}
		} else if ctx.Err() == nil {
			logger.Info("dial failed", zap.Error(err), zap.Duration("retry_in", backoff))
		}
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(backoff):
		}
		backoff = min(2*backoff, cfg.maxBackoff)
	}
}

// serve simulates the cooker until the link or ctx ends, and returns the last state and key.
func serve(ctx context.Context, c *wifitest.Conn, cfg config, ambient float64) (wifitest.State, string) {
	defer func() { _ = c.Close() }()
	tick := time.NewTicker(cfg.tick)
	defer tick.Stop()
	var secs float64
	for {
		select {
		case <-ctx.Done():
			return c.State(), c.Key()
		case <-c.Done():
			return c.State(), c.Key()
		case <-tick.C:
		}
		dt := cfg.tick.Seconds()
		finished := false
		c.SetState(func(s *wifitest.State) {
			step(s, ambient, cfg.Rate*dt)
			if s.Status != "running" || !s.TimerRunning || s.TimerMinutes <= 0 {
				secs = 0
				return
			}
			if secs += dt; secs >= 60 {
				secs -= 60
				s.TimerMinutes--
				if s.TimerMinutes == 0 {
					s.TimerRunning = false
					finished = true
				}
			}
		})
		if finished {
			_ = c.Emit("event wifi time finish")
		}
	}
}

// step moves the water temperature by at most delta toward the set point while running,
// or toward ambient otherwise.
func step(s *wifitest.State, ambient, delta float64) {
	target := ambient
	if s.Status == "running" {
		target = s.SetTemp
	}
	switch d := target - s.Temp; {
	case d > delta:
		s.Temp += delta
	case d < -delta:
		s.Temp -= delta
	default:
		s.Temp = target
	}
}
