//go:build !no_wifi

package main

import (
	"bufio"
	"context"
	"net"
	"testing"
	"time"

	"go.uber.org/zap"

	"anova4all/pkg/wifi/wifitest"
)

func TestFlagDefaults(t *testing.T) {
	cfg, err := parseFlags(nil)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Addr != "127.0.0.1:8080" || cfg.IDCard != wifitest.IDCard || cfg.Key != wifitest.Key0 {
		t.Fatalf("defaults = %q %q %q", cfg.Addr, cfg.IDCard, cfg.Key)
	}
	if _, err := parseFlags([]string{"-unit", "k"}); err == nil {
		t.Fatal("accepted unit k")
	}
}

func TestStepHeatsAndCools(t *testing.T) {
	s := wifitest.State{Status: "running", Temp: 20, SetTemp: 21, Unit: "c"}
	step(&s, 20, 0.5)
	if s.Temp != 20.5 {
		t.Fatalf("heating: temp = %v", s.Temp)
	}
	step(&s, 20, 0.5)
	step(&s, 20, 0.5)
	if s.Temp != 21 {
		t.Fatalf("overshot the set point: temp = %v", s.Temp)
	}
	s.Status = "stopped"
	step(&s, 20, 2)
	if s.Temp != 20 {
		t.Fatalf("cooling: temp = %v", s.Temp)
	}
}

// The fake redials when the server drops it and keeps its state (key, set point) across links.
func TestRunReconnectsAndKeepsState(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ln.Close() }()

	cfg, err := parseFlags([]string{"-addr", ln.Addr().String()})
	if err != nil {
		t.Fatal(err)
	}
	cfg.minBackoff = 10 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- run(ctx, cfg, zap.NewNop()) }()

	c1 := accept(t, ln)
	ask(t, c1, "set number "+wifitest.Key1)
	ask(t, c1, "set temp 70.5")
	_ = c1.Close()

	c2 := accept(t, ln)
	defer func() { _ = c2.Close() }()
	if got := ask(t, c2, "get number"); got != wifitest.Key1 {
		t.Fatalf("key after reconnect = %q", got)
	}
	if got := ask(t, c2, "read set temp"); got != "70.5" {
		t.Fatalf("set temp after reconnect = %q", got)
	}

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("run: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("run did not return after cancel")
	}
}

func TestRunRetriesClosedPortUntilCancelled(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	cfg, err := parseFlags([]string{"-addr", addr})
	if err != nil {
		t.Fatal(err)
	}
	cfg.minBackoff = 10 * time.Millisecond
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	start := time.Now()
	if err := run(ctx, cfg, zap.NewNop()); err != nil {
		t.Fatalf("run: %v", err)
	}
	if time.Since(start) > 2*time.Second {
		t.Fatal("run did not stop promptly")
	}
}

type link struct {
	net.Conn
	r *bufio.Reader
}

func accept(t *testing.T, ln net.Listener) link {
	t.Helper()
	_ = ln.(*net.TCPListener).SetDeadline(time.Now().Add(3 * time.Second))
	nc, err := ln.Accept()
	if err != nil {
		t.Fatalf("accept: %v", err)
	}
	return link{nc, bufio.NewReader(nc)}
}

func ask(t *testing.T, l link, cmd string) string {
	t.Helper()
	_ = l.SetDeadline(time.Now().Add(2 * time.Second))
	if _, err := l.Write(wifitest.Frame(cmd)); err != nil {
		t.Fatalf("write %q: %v", cmd, err)
	}
	m, err := wifitest.ReadFrame(l.r)
	if err != nil {
		t.Fatalf("read reply to %q: %v", cmd, err)
	}
	return m
}
