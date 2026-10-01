// Package authtest issues signed test tokens against an in-memory key, for handler tests.
package authtest

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const Issuer = "http://supabase.test/auth/v1"

// Issuer signs tokens with a fresh ES256 key.
type Signer struct {
	Key *ecdsa.PrivateKey
}

func NewSigner(t testing.TB) *Signer {
	t.Helper()
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return &Signer{Key: k}
}

// Keyfunc returns a jwt.Keyfunc that accepts only this signer's key (kid "test").
func (s *Signer) Keyfunc() jwt.Keyfunc {
	return func(t *jwt.Token) (any, error) {
		if kid, _ := t.Header["kid"].(string); kid != "test" {
			return nil, jwt.ErrTokenUnverifiable
		}
		return &s.Key.PublicKey, nil
	}
}

// Claims builds a claims map; override fields by mutating the result.
func Claims(user uuid.UUID, aud string) jwt.MapClaims {
	return jwt.MapClaims{
		"iss":  Issuer,
		"sub":  user.String(),
		"aud":  aud,
		"role": "authenticated",
		"exp":  time.Now().Add(time.Hour).Unix(),
		"iat":  time.Now().Unix(),
	}
}

// Sign signs claims with ES256.
func (s *Signer) Sign(t testing.TB, c jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodES256, c)
	tok.Header["kid"] = "test"
	raw, err := tok.SignedString(s.Key)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

// Browser returns a valid browser token for user.
func (s *Signer) Browser(t testing.TB, user uuid.UUID) string {
	return s.Sign(t, Claims(user, "authenticated"))
}

// App returns a valid app (MCP) token for user.
func (s *Signer) App(t testing.TB, user uuid.UUID) string {
	c := Claims(user, "anova4all-mcp")
	c["client_id"] = "11111111-2222-3333-4444-555555555555"
	return s.Sign(t, c)
}
