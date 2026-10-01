// Package mcp serves the cooker tools to AI apps (Claude, ChatGPT) over the Model Context
// Protocol: stateless streamable HTTP with JSON responses, behind app tokens issued by the
// Supabase OAuth server.
//
// Every tool is a thin wrapper over internal/control; this package never talks to a cooker.
// It does not import internal/rest (or the reverse): main mounts the routes from New with
// rest.Server.Handle.
package mcp

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/modelcontextprotocol/go-sdk/oauthex"
	"go.uber.org/zap"

	"anova4all/internal/auth"
	"anova4all/internal/control"
)

// Options configure the MCP endpoint.
type Options struct {
	Control  *control.Service
	Verifier *auth.Verifier
	// PublicURL is the MCP endpoint as clients reach it (MCP_PUBLIC_URL), e.g.
	// https://home.example.test:9800/mcp. It is the OAuth resource identifier, and its
	// path is where the endpoint is mounted.
	PublicURL string
	// AuthServer is the authorization server issuer, "<SUPABASE_URL>/auth/v1".
	AuthServer string
	// Limits are the per-user rate limits; zero fields get the defaults.
	Limits Limits
	Logger *zap.Logger
}

// Limits are per-user token buckets. Reads are anova_status; writes are the cook tools.
type Limits struct {
	ReadEvery  time.Duration // default 500 ms (2/s)
	ReadBurst  int           // default 10
	WriteEvery time.Duration // default 6 s (10/min)
	WriteBurst int           // default 5
}

func (l Limits) withDefaults() Limits {
	if l.ReadEvery == 0 {
		l.ReadEvery = 500 * time.Millisecond
	}
	if l.ReadBurst == 0 {
		l.ReadBurst = 10
	}
	if l.WriteEvery == 0 {
		l.WriteEvery = 6 * time.Second
	}
	if l.WriteBurst == 0 {
		l.WriteBurst = 5
	}
	return l
}

// Route is one handler to mount on an exact path.
type Route struct {
	Path    string
	Handler http.Handler
}

// MetadataPath is the RFC 9728 well-known prefix for protected resource metadata.
const MetadataPath = "/.well-known/oauth-protected-resource"

// New returns the routes to mount: the MCP endpoint (at PublicURL's path) and the protected
// resource metadata, at both the path-suffixed well-known URL that WWW-Authenticate points
// to and the root well-known URL that some clients try first.
func New(opts Options) ([]Route, error) {
	if opts.Control == nil || opts.Verifier == nil {
		return nil, errors.New("mcp: Control and Verifier are required")
	}
	if opts.Logger == nil {
		opts.Logger = zap.NewNop()
	}
	pub, err := url.Parse(opts.PublicURL)
	if err != nil || (pub.Scheme != "https" && pub.Scheme != "http") || pub.Host == "" ||
		pub.RawQuery != "" || pub.Fragment != "" || strings.Trim(pub.Path, "/") == "" {
		return nil, fmt.Errorf("mcp: MCP_PUBLIC_URL must be an absolute http(s) URL with a path, like https://host:port/mcp")
	}
	as, err := url.Parse(opts.AuthServer)
	if err != nil || as.Scheme == "" || as.Host == "" {
		return nil, errors.New("mcp: AuthServer must be an absolute URL")
	}
	path := "/" + strings.Trim(pub.Path, "/")
	resource := pub.Scheme + "://" + pub.Host + path
	metaURL := pub.Scheme + "://" + pub.Host + MetadataPath + path

	srv := newServer(opts.Control, opts.Limits.withDefaults(), opts.Logger.Named("mcp"))
	h := sdk.NewStreamableHTTPHandler(func(*http.Request) *sdk.Server { return srv.sdk },
		&sdk.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
	protected := sdkauth.RequireBearerToken(appTokenVerifier(opts.Verifier, srv.log), &sdkauth.RequireBearerTokenOptions{
		ResourceMetadataURL: metaURL,
		ClockSkew:           30 * time.Second, // matches the verifier's leeway
	})(h)

	meta := sdkauth.ProtectedResourceMetadataHandler(&oauthex.ProtectedResourceMetadata{
		Resource:               resource,
		AuthorizationServers:   []string{strings.TrimRight(opts.AuthServer, "/")},
		BearerMethodsSupported: []string{"header"},
		ResourceName:           "Anova4All cookers",
	})
	return []Route{
		{Path: path, Handler: protected},
		{Path: MetadataPath + path, Handler: meta},
		{Path: MetadataPath, Handler: meta},
	}, nil
}

// appTokenVerifier accepts only app tokens (aud anova4all-mcp with client_id). The refusal
// reason is logged at debug level only; the client sees a generic 401.
func appTokenVerifier(v *auth.Verifier, log *zap.Logger) sdkauth.TokenVerifier {
	return func(_ context.Context, raw string, _ *http.Request) (*sdkauth.TokenInfo, error) {
		c, err := v.Verify(raw, auth.App)
		if err != nil {
			log.Debug("token refused", zap.Error(err))
			return nil, sdkauth.ErrInvalidToken
		}
		info := &sdkauth.TokenInfo{UserID: c.UserID.String(), Extra: map[string]any{clientIDKey: c.ClientID}}
		if c.ExpiresAt != nil {
			info.Expiration = c.ExpiresAt.Time
		}
		return info, nil
	}
}

const clientIDKey = "client_id"
