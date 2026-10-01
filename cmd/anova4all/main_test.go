package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/spf13/viper"
	"go.uber.org/zap"

	"anova4all/internal/store/storetest"
)

func testConfig(t *testing.T, dbURL string) *viper.Viper {
	t.Helper()
	jwks := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"keys":[]}`))
	}))
	t.Cleanup(jwks.Close)
	v := viper.New()
	v.Set("supabase_url", jwks.URL)
	v.Set("database_url", dbURL)
	v.Set("anova_server_port", 0)
	v.Set("rest_server_port", 0)
	v.Set("rest_server_tls_port", -1)
	return v
}

func TestRunRefusesBadDatabaseURL(t *testing.T) {
	for _, u := range []string{
		"",
		"postgresql://u:testkey000@db.example.test:5432/postgres?sslmode=require",
		"postgresql://u:testkey000@db.example.test:5432/postgres",
		"::not a url",
	} {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		err := run(ctx, testConfig(t, u), zap.NewNop())
		cancel()
		if err == nil {
			t.Errorf("accepted %q", u)
		} else if strings.Contains(err.Error(), "testkey000") {
			t.Errorf("error leaks the password: %v", err)
		}
	}
}

func TestRunRequiresSupabaseURL(t *testing.T) {
	v := testConfig(t, "postgresql://u:p@127.0.0.1:1/postgres")
	v.Set("supabase_url", "")
	if err := run(context.Background(), v, zap.NewNop()); err == nil {
		t.Fatal("started without SUPABASE_URL")
	}
}

func TestRunShutsDownOnCancel(t *testing.T) {
	cfg := testConfig(t, storetest.ServerURL(t))
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- run(ctx, cfg, zap.NewNop()) }()
	time.Sleep(500 * time.Millisecond)
	select {
	case err := <-done:
		t.Fatalf("exited early: %v", err)
	default:
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("shutdown: %v", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("shutdown hung")
	}
}
