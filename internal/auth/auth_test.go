package auth_test

import (
	"errors"
	"testing"
	"time"

	"anova4all/internal/auth"
	"anova4all/internal/auth/authtest"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func TestVerify(t *testing.T) {
	s := authtest.NewSigner(t)
	other := authtest.NewSigner(t)
	v := auth.New(s.Keyfunc(), authtest.Issuer)
	user := uuid.New()

	hs := func() string {
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, authtest.Claims(user, "authenticated"))
		tok.Header["kid"] = "test"
		raw, _ := tok.SignedString([]byte("not-a-real-secret-0000000000000000"))
		return raw
	}
	with := func(aud string, f func(jwt.MapClaims)) string {
		c := authtest.Claims(user, aud)
		f(c)
		return s.Sign(t, c)
	}

	cases := []struct {
		name string
		raw  string
		kind auth.Kind
		ok   bool
	}{
		{"browser token on browser surface", s.Browser(t, user), auth.Browser, true},
		{"app token on app surface", s.App(t, user), auth.App, true},
		{"app token refused on browser surface", s.App(t, user), auth.Browser, false},
		{"browser token refused on app surface", s.Browser(t, user), auth.App, false},
		{"client_id with aud=authenticated refused on browser", with("authenticated", func(c jwt.MapClaims) { c["client_id"] = "x" }), auth.Browser, false},
		{"client_id with aud=authenticated refused on app", with("authenticated", func(c jwt.MapClaims) { c["client_id"] = "x" }), auth.App, false},
		{"wrong key", other.Sign(t, authtest.Claims(user, "authenticated")), auth.Browser, false},
		{"HS256", hs(), auth.Browser, false},
		{"expired", with("authenticated", func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Hour).Unix() }), auth.Browser, false},
		{"no exp", with("authenticated", func(c jwt.MapClaims) { delete(c, "exp") }), auth.Browser, false},
		{"wrong aud", with("other", func(jwt.MapClaims) {}), auth.Browser, false},
		{"wrong issuer", with("authenticated", func(c jwt.MapClaims) { c["iss"] = "http://evil.test/auth/v1" }), auth.Browser, false},
		{"anonymous", with("authenticated", func(c jwt.MapClaims) { c["is_anonymous"] = true }), auth.Browser, false},
		{"anon role", with("authenticated", func(c jwt.MapClaims) { c["role"] = "anon" }), auth.Browser, false},
		{"aud as one-element array accepted", with("authenticated", func(c jwt.MapClaims) { c["aud"] = []string{"authenticated"} }), auth.Browser, true},
		{"several audiences refused", with("authenticated", func(c jwt.MapClaims) { c["aud"] = []string{"authenticated", "anova4all-mcp"} }), auth.Browser, false},
		{"several audiences refused on app", with("anova4all-mcp", func(c jwt.MapClaims) { c["aud"] = []string{"authenticated", "anova4all-mcp"}; c["client_id"] = "x" }), auth.App, false},
		{"bad sub", with("authenticated", func(c jwt.MapClaims) { c["sub"] = "nope" }), auth.Browser, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, err := v.Verify(tc.raw, tc.kind)
			if tc.ok {
				if err != nil || c.UserID != user {
					t.Fatalf("want ok, got %v", err)
				}
				return
			}
			if !errors.Is(err, auth.ErrUnauthorized) {
				t.Fatalf("want ErrUnauthorized, got %v", err)
			}
		})
	}
}

func TestBearerToken(t *testing.T) {
	if tok, ok := auth.BearerToken("Bearer abc"); !ok || tok != "abc" {
		t.Fatal("bearer")
	}
	for _, h := range []string{"", "Bearer ", "Basic abc", "abc"} {
		if _, ok := auth.BearerToken(h); ok {
			t.Fatalf("%q accepted", h)
		}
	}
}
