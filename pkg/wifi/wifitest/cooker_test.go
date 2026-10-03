//go:build !no_wifi

package wifitest

import (
	"bufio"
	"context"
	"net"
	"testing"
	"time"
)

func TestConnectWithoutTB(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ln.Close() }()

	c, err := Connect(context.Background(), ln.Addr().String(), Cooker{}, nil)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer func() { _ = c.Close() }()
	srv, err := ln.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = srv.Close() }()

	// The server re-keys the cooker; Key reports it so a caller can keep it across links.
	r := bufio.NewReader(srv)
	_, _ = srv.Write(Frame("set number " + Key1))
	if got := readFrame(t, srv, r); got != "ok" {
		t.Fatalf("set number reply = %q", got)
	}
	if c.Key() != Key1 {
		t.Fatalf("Key() = %q, want %q", c.Key(), Key1)
	}
	_, _ = srv.Write(Frame("get id card"))
	if got := readFrame(t, srv, r); got != IDCard {
		t.Fatalf("id card = %q", got)
	}
}

func TestConnectClosedPort(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()
	if c, err := Connect(context.Background(), addr, Cooker{}, nil); err == nil {
		_ = c.Close()
		t.Fatal("connected to a closed port")
	}
}

func readFrame(t *testing.T, nc net.Conn, r *bufio.Reader) string {
	t.Helper()
	_ = nc.SetReadDeadline(time.Now().Add(2 * time.Second))
	m, err := ReadFrame(r)
	if err != nil {
		t.Fatalf("read frame: %v", err)
	}
	return m
}
