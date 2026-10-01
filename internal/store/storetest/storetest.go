// Package storetest connects tests to the local Supabase database (`supabase start`)
// as the anova_server role, and creates synthetic users.
package storetest

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"anova4all/internal/store"
)

// AdminURL is the local Supabase superuser URL (override with ANOVA_TEST_ADMIN_URL;
// it must stay on loopback, see admin).
func AdminURL() string {
	if u := os.Getenv("ANOVA_TEST_ADMIN_URL"); u != "" {
		return u
	}
	return "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
}

// LocalURL reports whether a postgres URL's host is loopback.
func LocalURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	h := u.Hostname()
	if h == "localhost" {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && ip.IsLoopback()
}

// testPassword is set on anova_server in the local database only.
const testPassword = "local-test-only"

func admin(t testing.TB) *pgx.Conn {
	t.Helper()
	// The harness sets a committed password on anova_server and writes users:
	// never against anything but a local database.
	if !LocalURL(AdminURL()) {
		t.Fatal("ANOVA_TEST_ADMIN_URL must point at a loopback host (local Supabase)")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, err := pgx.Connect(ctx, AdminURL())
	if err != nil {
		if os.Getenv("ANOVA_REQUIRE_DB") != "" {
			t.Fatalf("local Supabase not reachable: %v", err)
		}
		t.Skipf("local Supabase not reachable (run `supabase start`): %v", err)
	}
	t.Cleanup(func() { _ = c.Close(context.Background()) })
	return c
}

// ServerURL returns a DATABASE_URL for anova_server on the local database.
func ServerURL(t testing.TB) string {
	t.Helper()
	a := admin(t)
	u := strings.Replace(AdminURL(), "postgres:postgres@", "anova_server:"+testPassword+"@", 1)
	passwordOnce.Do(func() {
		if c, err := pgx.Connect(context.Background(), u); err == nil {
			_ = c.Close(context.Background())
			return // already set (packages run in parallel and share the role)
		}
		for i := 0; i < 2; i++ { // "tuple concurrently updated" when another package sets it too
			if _, passwordErr = a.Exec(context.Background(), `alter role anova_server password '`+testPassword+`'`); passwordErr == nil {
				return
			}
			time.Sleep(200 * time.Millisecond)
		}
	})
	if passwordErr != nil {
		t.Fatalf("set anova_server password: %v", passwordErr)
	}
	return u
}

var (
	passwordOnce sync.Once
	passwordErr  error
)

// Open returns a store connected as anova_server.
func Open(t testing.TB) *store.Store {
	t.Helper()
	st, err := store.Open(context.Background(), ServerURL(t))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(st.Close)
	return st
}

// User creates a synthetic auth user (name@example.test, made unique) and deletes it,
// with everything it owns, after the test.
func User(t testing.TB, name string) uuid.UUID {
	t.Helper()
	a := admin(t)
	id := uuid.New()
	email := fmt.Sprintf("%s+%s@example.test", name, id.String()[:8])
	_, err := a.Exec(context.Background(), `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
		values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, '', now(), now(), now())`, id, email)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() {
		c, err := pgx.Connect(context.Background(), AdminURL())
		if err != nil {
			return
		}
		defer c.Close(context.Background())
		_, _ = c.Exec(context.Background(), `delete from auth.users where id = $1`, id)
	})
	return id
}

// AddMember adds user as a member of device.
func AddMember(t testing.TB, device, user uuid.UUID) {
	t.Helper()
	if _, err := admin(t).Exec(context.Background(), `insert into public.device_members (device_id, user_id) values ($1, $2)`, device, user); err != nil {
		t.Fatalf("add member: %v", err)
	}
}

// RemoveMember removes user from device.
func RemoveMember(t testing.TB, device, user uuid.UUID) {
	t.Helper()
	if _, err := admin(t).Exec(context.Background(), `delete from public.device_members where device_id = $1 and user_id = $2`, device, user); err != nil {
		t.Fatalf("remove member: %v", err)
	}
}

// AddInvite inserts an invite row for device and returns its id.
func AddInvite(t testing.TB, device, by uuid.UUID) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := admin(t).QueryRow(context.Background(), `insert into public.device_invites (device_id, token_hash, created_by)
		values ($1, decode(md5(random()::text), 'hex'), $2) returning id`, device, by).Scan(&id)
	if err != nil {
		t.Fatalf("add invite: %v", err)
	}
	return id
}

// Count runs a count(*) query as the superuser.
func Count(t testing.TB, query string, args ...any) int {
	t.Helper()
	var n int
	if err := admin(t).QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	return n
}

// DeleteDevice deletes a device row (simulates unpair in the browser).
func DeleteDevice(t testing.TB, device uuid.UUID) {
	t.Helper()
	if _, err := admin(t).Exec(context.Background(), `delete from public.devices where id = $1`, device); err != nil {
		t.Fatalf("delete device: %v", err)
	}
}
