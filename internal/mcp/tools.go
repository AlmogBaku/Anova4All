package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/google/uuid"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"go.uber.org/zap"
	"golang.org/x/time/rate"

	"anova4all/internal/control"
	"anova4all/internal/store"
)

// Tool names.
const (
	ToolStatus = "anova_status"
	ToolStart  = "anova_start_cook"
	ToolUpdate = "anova_update_cook"
	ToolStop   = "anova_stop_cook"
)

// Error codes MCP adds to control's codes.
const (
	CodeDeviceRequired control.Code = "device_required" // several cookers and no device_id
	CodeNoCookers      control.Code = "no_cookers"      // the user has no cooker yet
	CodeInternal       control.Code = "internal"
)

// Result is every tool's structured content.
//
// On success Devices is set (possibly empty for anova_status). On a tool error Error is
// set, and Devices lists the choices when the error is device_required.
type Result struct {
	Devices []control.DeviceStatus `json:"devices,omitzero" jsonschema:"the cookers, as the cook screen shows them"`
	Error   *ErrorInfo             `json:"error,omitempty" jsonschema:"set when the call failed"`
}

// ErrorInfo is a tool error.
type ErrorInfo struct {
	Code              string `json:"code" jsonschema:"stable error code, e.g. device_offline, cook_in_progress, no_active_cook, invalid_input, not_member, rate_limited, device_required"`
	Message           string `json:"message" jsonschema:"what went wrong and what to do next"`
	RetryAfterSeconds int    `json:"retry_after_seconds,omitempty" jsonschema:"for rate_limited: seconds to wait before retrying"`
}

type server struct {
	sdk    *sdk.Server
	ctl    *control.Service
	log    *zap.Logger
	reads  *limiter
	writes *limiter
}

func newServer(ctl *control.Service, lim Limits, log *zap.Logger) *server {
	s := &server{
		ctl:    ctl,
		log:    log,
		reads:  newLimiter(lim.ReadEvery, lim.ReadBurst),
		writes: newLimiter(lim.WriteEvery, lim.WriteBurst),
	}
	s.sdk = sdk.NewServer(&sdk.Implementation{Name: "anova4all", Title: "Anova4All", Version: "1.0.0"}, &sdk.ServerOptions{
		Instructions: "Controls the user's Anova sous-vide cookers. Call anova_status first to see the cookers, " +
			"their ids and whether one is heating. Start a cook with anova_start_cook, change a running cook " +
			"with anova_update_cook, and end it with anova_stop_cook. device_id may be left out when the user " +
			"has exactly one cooker.",
	})
	s.addTools()
	addCard(s.sdk)
	return s
}

// ---- tool definitions ----

func boolPtr(b bool) *bool { return &b }

var outputSchema = func() *jsonschema.Schema {
	sc, err := jsonschema.For[Result](&jsonschema.ForOptions{TypeSchemas: map[reflect.Type]*jsonschema.Schema{
		reflect.TypeFor[uuid.UUID](): {Type: "string", Format: "uuid"},
	}})
	if err != nil {
		panic(err)
	}
	return sc
}()

func deviceIDProp() *jsonschema.Schema {
	return &jsonschema.Schema{Type: "string", Format: "uuid",
		Description: "The cooker's id from anova_status. Optional when the user has exactly one cooker."}
}

func temperatureProp() *jsonschema.Schema {
	return &jsonschema.Schema{Type: "number", Minimum: ptr(25.0), Maximum: ptr(211.0),
		Description: "Target water temperature: 25–100 in °C or 77–211 in °F (see unit)."}
}

func unitProp() *jsonschema.Schema {
	return &jsonschema.Schema{Type: "string", Enum: []any{"c", "f"},
		Description: `Temperature unit: "c" for Celsius or "f" for Fahrenheit. The cooker's display ` +
			`switches to this unit, so use the unit anova_status reports unless the user asks for the other one.`}
}

func ptr[T any](v T) *T { return &v }

func (s *server) addTools() {
	ui := sdk.Meta{
		"ui":             map[string]any{"resourceUri": CardURI},
		"ui/resourceUri": CardURI, // legacy key, still read by some hosts
	}
	s.add(&sdk.Tool{
		Name:  ToolStatus,
		Title: "Cooker status",
		Description: "Lists the user's cookers with their live state (online, heating, water and target " +
			"temperature, timer, auto-stop). Pass device_id for one cooker. Reads the last reported state; " +
			"it doesn't send anything to the cooker.",
		InputSchema: &jsonschema.Schema{Type: "object", AdditionalProperties: &jsonschema.Schema{Not: &jsonschema.Schema{}},
			Properties: map[string]*jsonschema.Schema{"device_id": deviceIDProp()}},
		Annotations: &sdk.ToolAnnotations{Title: "Cooker status", ReadOnlyHint: true, IdempotentHint: true, OpenWorldHint: boolPtr(false)},
		Meta:        ui,
	}, s.reads, s.status)

	s.add(&sdk.Tool{
		Name:  ToolStart,
		Title: "Start a cook",
		Description: "Starts heating to a temperature, optionally with a timer. The timer starts when the water " +
			"reaches the temperature, as in the Anova app. With auto_stop the cooker stops " +
			"heating when the timer ends (the alarm still sounds). Refused with cook_in_progress if the cooker " +
			"is already heating: use anova_update_cook instead.",
		InputSchema: &jsonschema.Schema{Type: "object", AdditionalProperties: &jsonschema.Schema{Not: &jsonschema.Schema{}},
			Required: []string{"temperature", "unit"},
			Properties: map[string]*jsonschema.Schema{
				"device_id":   deviceIDProp(),
				"temperature": temperatureProp(),
				"unit":        unitProp(),
				"minutes": {Type: "integer", Minimum: ptr(0.0), Maximum: ptr(6000.0),
					Description: "Timer length in minutes (0–6000). Leave out for no timer."},
				"auto_stop": {Type: "boolean", Default: json.RawMessage("false"),
					Description: "Stop heating when the timer ends. Needs minutes greater than 0."},
			}},
		Annotations: &sdk.ToolAnnotations{Title: "Start a cook", OpenWorldHint: boolPtr(false)},
		Meta:        ui,
	}, s.writes, s.start)

	s.add(&sdk.Tool{
		Name:  ToolUpdate,
		Title: "Change the cook",
		Description: "Changes the cook that is running: the temperature (with unit), the timer (minutes sets " +
			"it, starting it once the water is at temperature; 0 clears it) and auto_stop. Pass only what changes. Refused with no_active_cook if " +
			"the cooker isn't heating: it never starts the heater, use anova_start_cook for that.",
		InputSchema: &jsonschema.Schema{Type: "object", AdditionalProperties: &jsonschema.Schema{Not: &jsonschema.Schema{}},
			Properties: map[string]*jsonschema.Schema{
				"device_id":   deviceIDProp(),
				"temperature": temperatureProp(),
				"unit": {Type: "string", Enum: []any{"c", "f"}, Description: `Unit of temperature, "c" or "f". Required with temperature. ` +
					`The cooker's display switches to this unit, so use the unit anova_status reports unless the user asks for the other one.`},
				"minutes": {Type: "integer", Minimum: ptr(0.0), Maximum: ptr(6000.0),
					Description: "New timer length in minutes (0–6000); it restarts the timer (during preheat it waits for the temperature). 0 clears the timer and turns auto_stop off."},
				"auto_stop": {Type: "boolean", Description: "Turn stopping at the timer's end on or off. Needs a running or waiting timer."},
			}},
		Annotations: &sdk.ToolAnnotations{Title: "Change the cook", IdempotentHint: true, OpenWorldHint: boolPtr(false)},
		Meta:        ui,
	}, s.writes, s.update)

	s.add(&sdk.Tool{
		Name:  ToolStop,
		Title: "Stop the cook",
		Description: "Stops heating and the timer and silences the alarm (a low-water alarm keeps sounding " +
			"until water is added). Safe to call when nothing is cooking, e.g. to silence the alarm after an auto-stop.",
		InputSchema: &jsonschema.Schema{Type: "object", AdditionalProperties: &jsonschema.Schema{Not: &jsonschema.Schema{}},
			Properties: map[string]*jsonschema.Schema{"device_id": deviceIDProp()}},
		Annotations: &sdk.ToolAnnotations{Title: "Stop the cook", IdempotentHint: true, OpenWorldHint: boolPtr(false)},
		Meta:        ui,
	}, s.writes, s.stop)
}

// handler runs one tool for an authenticated user; it returns the text summary and result.
type handler func(ctx context.Context, user uuid.UUID, args json.RawMessage) (string, Result, error)

// add registers a tool with the low-level API, so arguments reach control's validation
// unchanged and every refusal carries a stable code (the typed API would answer schema
// violations itself, without a code).
func (s *server) add(t *sdk.Tool, lim *limiter, h handler) {
	t.OutputSchema = outputSchema
	s.sdk.AddTool(t, func(ctx context.Context, req *sdk.CallToolRequest) (*sdk.CallToolResult, error) {
		start := time.Now()
		var userID, clientID string
		if req.Extra != nil && req.Extra.TokenInfo != nil {
			userID = req.Extra.TokenInfo.UserID
			clientID, _ = req.Extra.TokenInfo.Extra[clientIDKey].(string)
		}
		text, res, err := s.call(ctx, userID, lim, h, req.Params.Arguments)
		outcome := "ok"
		if err != nil {
			text, res, outcome = s.toolError(t.Name, err)
		}
		s.log.Info("tool call",
			zap.String("tool", t.Name),
			zap.String("user", userID),
			zap.String("client", clientID),
			zap.String("outcome", outcome),
			zap.Duration("took", time.Since(start)))
		return &sdk.CallToolResult{
			Content:           []sdk.Content{&sdk.TextContent{Text: text}},
			StructuredContent: res,
			IsError:           err != nil,
		}, nil
	})
}

func (s *server) call(ctx context.Context, userID string, lim *limiter, h handler, args json.RawMessage) (string, Result, error) {
	user, err := uuid.Parse(userID)
	if err != nil { // RequireBearerToken always sets it; never reached with a valid token
		return "", Result{}, errors.New("no authenticated user")
	}
	if wait := lim.take(user); wait > 0 {
		return "", Result{}, &rateLimited{wait: wait}
	}
	return h(ctx, user, args)
}

type rateLimited struct{ wait time.Duration }

func (e *rateLimited) Error() string { return "rate limited" }

// selectionError is device_required or no_cookers; choices are listed in the result.
type selectionError struct {
	code    control.Code
	msg     string
	choices []control.DeviceStatus
}

func (e *selectionError) Error() string { return e.msg }

// toolError turns err into an actionable tool error.
func (s *server) toolError(tool string, err error) (string, Result, string) {
	info := &ErrorInfo{}
	var res Result
	var rl *rateLimited
	var sel *selectionError
	switch {
	case errors.As(err, &rl):
		secs := int(math.Ceil(rl.wait.Seconds()))
		info.Code, info.RetryAfterSeconds = string(control.CodeRateLimited), secs
		info.Message = fmt.Sprintf("Too many requests. Wait %d seconds before calling %s again.", secs, tool)
	case errors.As(err, &sel):
		info.Code, info.Message = string(sel.code), sel.msg
		res.Devices = sel.choices
	case control.CodeOf(err) != "":
		code := control.CodeOf(err)
		info.Code, info.Message = string(code), actionable(code, err)
	default:
		s.log.Error("tool failed", zap.String("tool", tool), zap.Error(err))
		info.Code, info.Message = string(CodeInternal), "Something went wrong on the server. Try again in a moment."
	}
	res.Error = info
	return info.Message, res, info.Code
}

func actionable(code control.Code, err error) string {
	switch code {
	case control.CodeDeviceOffline:
		return "The cooker is offline. Check it's powered and on Wi-Fi, then try again."
	case control.CodeNotMember:
		return "That cooker isn't shared with you. Call anova_status to list your cookers and their ids."
	case control.CodeCookInProgress:
		return "The cooker is already heating. Use anova_update_cook to change the cook or anova_stop_cook to stop it."
	case control.CodeNoActiveCook:
		return "The cooker isn't heating. Use anova_start_cook to start a cook."
	case control.CodeInvalidInput:
		var e *control.Error
		if errors.As(err, &e) {
			return "Invalid input: " + e.Message + "."
		}
	}
	var e *control.Error
	if errors.As(err, &e) {
		return e.Message
	}
	return string(code)
}

// ---- tool handlers ----

type statusArgs struct {
	DeviceID string `json:"device_id"`
}

type startArgs struct {
	DeviceID string `json:"device_id"`
	control.StartCook
	Temperature *float64 `json:"temperature"` // shadows StartCook's, to detect a missing value
}

type updateArgs struct {
	DeviceID string `json:"device_id"`
	control.UpdateCook
}

func decode(raw json.RawMessage, v any) error {
	if len(bytes.TrimSpace(raw)) == 0 || string(bytes.TrimSpace(raw)) == "null" {
		return nil
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		var te *json.UnmarshalTypeError
		if errors.As(err, &te) && te.Field != "" {
			return &control.Error{Code: control.CodeInvalidInput, Message: fmt.Sprintf("%s has the wrong type", te.Field)}
		}
		if strings.HasPrefix(err.Error(), "json: unknown field ") {
			return &control.Error{Code: control.CodeInvalidInput, Message: strings.TrimPrefix(err.Error(), "json: ")}
		}
		return &control.Error{Code: control.CodeInvalidInput, Message: "arguments are not valid JSON"}
	}
	return nil
}

func (s *server) status(ctx context.Context, user uuid.UUID, raw json.RawMessage) (string, Result, error) {
	var a statusArgs
	if err := decode(raw, &a); err != nil {
		return "", Result{}, err
	}
	if a.DeviceID != "" {
		id, err := parseDeviceID(a.DeviceID)
		if err != nil {
			return "", Result{}, err
		}
		ds, err := s.ctl.Status(ctx, user, id)
		if err != nil {
			return "", Result{}, err
		}
		return summary(ds), Result{Devices: []control.DeviceStatus{ds}}, nil
	}
	all, err := s.ctl.StatusAll(ctx, user)
	if err != nil {
		return "", Result{}, err
	}
	if len(all) == 0 {
		return "You have no cookers yet. Pair one in the Anova4All web app first.", Result{Devices: []control.DeviceStatus{}}, nil
	}
	lines := make([]string, len(all))
	for i, ds := range all {
		lines[i] = summary(ds)
	}
	return strings.Join(lines, "\n"), Result{Devices: all}, nil
}

func (s *server) start(ctx context.Context, user uuid.UUID, raw json.RawMessage) (string, Result, error) {
	var a startArgs
	if err := decode(raw, &a); err != nil {
		return "", Result{}, err
	}
	if a.Temperature == nil {
		return "", Result{}, &control.Error{Code: control.CodeInvalidInput, Message: "temperature is required"}
	}
	a.StartCook.Temperature = *a.Temperature
	id, err := s.device(ctx, user, a.DeviceID)
	if err != nil {
		return "", Result{}, err
	}
	ds, err := s.ctl.Start(ctx, user, id, a.StartCook)
	if err != nil {
		return "", Result{}, err
	}
	return "Cook started.\n" + summary(ds), Result{Devices: []control.DeviceStatus{ds}}, nil
}

func (s *server) update(ctx context.Context, user uuid.UUID, raw json.RawMessage) (string, Result, error) {
	var a updateArgs
	if err := decode(raw, &a); err != nil {
		return "", Result{}, err
	}
	id, err := s.device(ctx, user, a.DeviceID)
	if err != nil {
		return "", Result{}, err
	}
	ds, err := s.ctl.Update(ctx, user, id, a.UpdateCook)
	if err != nil {
		return "", Result{}, err
	}
	return "Cook updated.\n" + summary(ds), Result{Devices: []control.DeviceStatus{ds}}, nil
}

func (s *server) stop(ctx context.Context, user uuid.UUID, raw json.RawMessage) (string, Result, error) {
	var a statusArgs
	if err := decode(raw, &a); err != nil {
		return "", Result{}, err
	}
	id, err := s.device(ctx, user, a.DeviceID)
	if err != nil {
		return "", Result{}, err
	}
	ds, err := s.ctl.Stop(ctx, user, id)
	if err != nil {
		return "", Result{}, err
	}
	return "Cook stopped.\n" + summary(ds), Result{Devices: []control.DeviceStatus{ds}}, nil
}

func parseDeviceID(s string) (uuid.UUID, error) {
	id, err := uuid.Parse(s)
	if err != nil {
		return uuid.Nil, control.ErrNotMember // same answer as an unknown device
	}
	return id, nil
}

// device resolves the target cooker: the given id, or the user's only cooker.
func (s *server) device(ctx context.Context, user uuid.UUID, deviceID string) (uuid.UUID, error) {
	if deviceID != "" {
		return parseDeviceID(deviceID)
	}
	all, err := s.ctl.StatusAll(ctx, user)
	if err != nil {
		return uuid.Nil, err
	}
	switch len(all) {
	case 0:
		return uuid.Nil, &selectionError{code: CodeNoCookers, msg: "You have no cookers yet. Pair one in the Anova4All web app first."}
	case 1:
		return all[0].ID, nil
	}
	names := make([]string, len(all))
	for i, ds := range all {
		names[i] = fmt.Sprintf("%q (device_id %s)", ds.Name, ds.ID)
	}
	return uuid.Nil, &selectionError{code: CodeDeviceRequired, choices: all,
		msg: fmt.Sprintf("You have %d cookers; pass device_id for one of: %s.", len(all), strings.Join(names, ", "))}
}

// summary is one readable line for a cooker.
func summary(ds control.DeviceStatus) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%q (device_id %s): ", ds.Name, ds.ID)
	if !ds.Online || ds.State == nil {
		b.WriteString("offline")
		if ds.LastSeenAt != nil {
			fmt.Fprintf(&b, ", last seen %s", ds.LastSeenAt.UTC().Format(time.RFC3339))
		}
		b.WriteString(".")
		return b.String()
	}
	st := ds.State
	unit := strings.ToUpper(string(st.Unit))
	switch st.Status {
	case "running":
		fmt.Fprintf(&b, "heating to %.1f °%s, water at %.1f °%s", st.TargetTemperature, unit, st.CurrentTemperature, unit)
	case "stopped":
		fmt.Fprintf(&b, "not heating (set to %.1f °%s), water at %.1f °%s", st.TargetTemperature, unit, st.CurrentTemperature, unit)
	default:
		fmt.Fprintf(&b, "status %q (set to %.1f °%s), water at %.1f °%s", st.Status, st.TargetTemperature, unit, st.CurrentTemperature, unit)
		if st.Status == "low water" {
			b.WriteString("; add water to the pot")
		}
	}
	switch {
	case st.TimerRunning:
		fmt.Fprintf(&b, "; timer running, %d min left", st.TimerValue)
	case st.TimerValue > 0 && ds.Cook != nil && ds.Cook.TimerWaiting:
		fmt.Fprintf(&b, "; timer set to %d min, starts when the water reaches %.1f °%s", st.TimerValue, st.TargetTemperature, unit)
	case st.TimerValue > 0:
		fmt.Fprintf(&b, "; timer set to %d min, not running", st.TimerValue)
	}
	if c := ds.Cook; c != nil && c.EndedAt == nil && c.AutoStop {
		b.WriteString("; auto-stop on")
		if c.StopsAt != nil {
			fmt.Fprintf(&b, ", stops at %s", c.StopsAt.UTC().Format(time.RFC3339))
		}
	} else if c != nil && c.EndedAt != nil && c.EndReason != nil && *c.EndReason == store.EndAutoStop && st.Status != "running" {
		fmt.Fprintf(&b, "; the last cook auto-stopped at %s", c.EndedAt.UTC().Format(time.RFC3339))
	}
	b.WriteString(".")
	return b.String()
}

// ---- rate limits ----

type limiter struct {
	every time.Duration
	burst int
	mu    sync.Mutex
	m     map[uuid.UUID]*rate.Limiter
}

func newLimiter(every time.Duration, burst int) *limiter {
	return &limiter{every: every, burst: burst, m: map[uuid.UUID]*rate.Limiter{}}
}

// take spends one token for u, or returns how long to wait for one.
func (l *limiter) take(u uuid.UUID) time.Duration {
	l.mu.Lock()
	lim, ok := l.m[u]
	if !ok {
		lim = rate.NewLimiter(rate.Every(l.every), l.burst)
		l.m[u] = lim
	}
	l.mu.Unlock()
	now := time.Now()
	r := lim.ReserveN(now, 1)
	if d := r.DelayFrom(now); d > 0 {
		r.CancelAt(now)
		return d
	}
	return 0
}
