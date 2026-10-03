package control

import (
	"errors"
	"fmt"
)

// Code is a stable error code shared by REST and MCP.
type Code string

const (
	CodeDeviceOffline  Code = "device_offline"
	CodeNotMember      Code = "not_member"
	CodeOwnerOnly      Code = "owner_only"
	CodeKeyMismatch    Code = "key_mismatch"
	CodeRateLimited    Code = "rate_limited"
	CodeCookInProgress Code = "cook_in_progress"
	CodeNoActiveCook   Code = "no_active_cook"
	CodeInvalidInput   Code = "invalid_input"
)

// Error is a typed, user-facing error. Message never contains secrets.
type Error struct {
	Code    Code
	Message string
}

func (e *Error) Error() string { return fmt.Sprintf("%s: %s", e.Code, e.Message) }

// Is matches any *Error with the same code, so errors.Is(err, ErrDeviceOffline) works.
func (e *Error) Is(target error) bool {
	t, ok := target.(*Error)
	return ok && t.Code == e.Code
}

var (
	ErrDeviceOffline  = &Error{CodeDeviceOffline, "the cooker is not connected to the server"}
	ErrNotMember      = &Error{CodeNotMember, "you don't have access to this cooker"}
	ErrOwnerOnly      = &Error{CodeOwnerOnly, "only the cooker's owner can do this"}
	ErrKeyMismatch    = &Error{CodeKeyMismatch, "the cooker hasn't reported the new key yet"}
	ErrRateLimited    = &Error{CodeRateLimited, "too many requests, slow down"}
	ErrCookInProgress = &Error{CodeCookInProgress, "the cooker is already heating; update or stop the current cook"}
	ErrNoActiveCook   = &Error{CodeNoActiveCook, "the cooker isn't heating; start a cook first"}
)

func invalid(format string, args ...any) *Error {
	return &Error{CodeInvalidInput, fmt.Sprintf(format, args...)}
}

// CodeOf returns the error's code, or "" for an internal error.
func CodeOf(err error) Code {
	var e *Error
	if errors.As(err, &e) {
		return e.Code
	}
	return ""
}
