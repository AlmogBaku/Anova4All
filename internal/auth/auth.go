// Package auth verifies Supabase access tokens.
//
// Two kinds of token are accepted, each on its own surface:
//   - Browser tokens (aud=authenticated, no client_id, not anonymous) on /api.
//   - App tokens issued by the Supabase OAuth server (aud=anova4all-mcp, client_id set) on /mcp.
//
// A token is never accepted on the other surface.
package auth

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Kind selects which token rule applies.
type Kind int

const (
	Browser Kind = iota
	App
)

const (
	BrowserAudience = "authenticated"
	AppAudience     = "anova4all-mcp"
)

// ErrUnauthorized is returned for every rejected token; the reason is wrapped for logs.
var ErrUnauthorized = errors.New("unauthorized")

// Claims are the Supabase claims we use.
type Claims struct {
	jwt.RegisteredClaims
	Email       string `json:"email,omitempty"`
	Role        string `json:"role,omitempty"`
	ClientID    string `json:"client_id,omitempty"`
	IsAnonymous bool   `json:"is_anonymous,omitempty"`

	UserID uuid.UUID `json:"-"`
}

// Verifier checks ES256 tokens against a JWKS keyfunc.
type Verifier struct {
	keyfunc jwt.Keyfunc
	issuer  string
	now     func() time.Time
}

// New returns a Verifier. issuer is "<SUPABASE_URL>/auth/v1".
func New(keyfunc jwt.Keyfunc, issuer string) *Verifier {
	return &Verifier{keyfunc: keyfunc, issuer: strings.TrimRight(issuer, "/"), now: time.Now}
}

// Verify parses and validates a raw bearer token for the given surface.
func (v *Verifier) Verify(raw string, kind Kind) (*Claims, error) {
	aud := BrowserAudience
	if kind == App {
		aud = AppAudience
	}
	claims := &Claims{}
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodES256.Alg()}),
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience(aud),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(30*time.Second),
		jwt.WithTimeFunc(v.now),
	)
	if _, err := parser.ParseWithClaims(raw, claims, v.keyfunc); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnauthorized, err)
	}
	// Supabase sends aud as a string or a one-element array; several audiences are refused.
	if len(claims.Audience) != 1 {
		return nil, fmt.Errorf("%w: %d audiences", ErrUnauthorized, len(claims.Audience))
	}
	if claims.IsAnonymous {
		return nil, fmt.Errorf("%w: anonymous token", ErrUnauthorized)
	}
	switch kind {
	case Browser:
		if claims.ClientID != "" {
			return nil, fmt.Errorf("%w: app token on browser surface", ErrUnauthorized)
		}
		if claims.Role != "authenticated" {
			return nil, fmt.Errorf("%w: role %q", ErrUnauthorized, claims.Role)
		}
	case App:
		if claims.ClientID == "" {
			return nil, fmt.Errorf("%w: missing client_id", ErrUnauthorized)
		}
	}
	id, err := uuid.Parse(claims.Subject)
	if err != nil {
		return nil, fmt.Errorf("%w: bad sub", ErrUnauthorized)
	}
	claims.UserID = id
	return claims, nil
}

// BearerToken extracts the token from an Authorization header value.
func BearerToken(header string) (string, bool) {
	const p = "Bearer "
	if len(header) <= len(p) || !strings.EqualFold(header[:len(p)], p) {
		return "", false
	}
	return strings.TrimSpace(header[len(p):]), true
}
