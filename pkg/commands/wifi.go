package commands

import "strings"

type GetSecretKey struct{}

func (c GetSecretKey) SupportsBLE() bool  { return false }
func (c GetSecretKey) SupportsWiFi() bool { return true }
func (c GetSecretKey) Encode() string     { return "get number" }
func (c GetSecretKey) Decode(response string) (any, error) {
	return strings.TrimSpace(response), nil
}
