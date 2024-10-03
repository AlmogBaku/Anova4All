package commands

import (
	"fmt"
	"strconv"
	"strings"
)

type GetCalibrationFactor struct{}

func (c GetCalibrationFactor) SupportsBLE() bool  { return true }
func (c GetCalibrationFactor) SupportsWiFi() bool { return false }
func (c GetCalibrationFactor) Encode() string     { return "read cal" }
func (c GetCalibrationFactor) Decode(response string) (any, error) {
	return strconv.ParseFloat(strings.TrimSpace(response), 64)
}

type SetCalibrationFactor struct {
	Factor float64
}

func (c SetCalibrationFactor) SupportsBLE() bool  { return true }
func (c SetCalibrationFactor) SupportsWiFi() bool { return false }
func (c SetCalibrationFactor) Encode() string {
	return fmt.Sprintf("cal %.1f", c.Factor)
}
func (c SetCalibrationFactor) Decode(response string) (any, error) {
	return strings.TrimSpace(response) == "ok", nil
}

type SetServerInfo struct {
	ServerIP string
	Port     int
}

func (c SetServerInfo) SupportsBLE() bool  { return true }
func (c SetServerInfo) SupportsWiFi() bool { return false }
func (c SetServerInfo) Encode() string {
	if c.ServerIP == "" {
		c.ServerIP = "pc.anovaculinary.com"
	}
	if c.Port == 0 {
		c.Port = 8080
	}
	return fmt.Sprintf("server para %s %d", c.ServerIP, c.Port)
}
func (c SetServerInfo) Decode(response string) (any, error) {
	parts := strings.Fields(response)
	if len(parts) != 2 {
		return false, ParseError{"SetServerInfo", "invalid response format"}
	}
	if parts[0] != c.ServerIP {
		return false, ParseError{"SetServerInfo", "unexpected server IP"}
	}
	port, err := strconv.Atoi(parts[1])
	if err != nil || port != c.Port {
		return false, ParseError{"SetServerInfo", "unexpected port"}
	}
	return true, nil
}

type SetLED struct {
	Red, Green, Blue int
}

func (c SetLED) SupportsBLE() bool  { return true }
func (c SetLED) SupportsWiFi() bool { return false }
func (c SetLED) Encode() string {
	return fmt.Sprintf("set led %d %d %d", c.Red, c.Green, c.Blue)
}
func (c SetLED) Decode(response string) (any, error) {
	return strings.TrimSpace(response) == "ok", nil
}

type SetSecretKey struct {
	Key string
}

func (c SetSecretKey) SupportsBLE() bool  { return true }
func (c SetSecretKey) SupportsWiFi() bool { return false }
func (c SetSecretKey) Encode() string     { return fmt.Sprintf("set number %s", c.Key) }
func (c SetSecretKey) Decode(response string) (any, error) {
	return strings.TrimSpace(response) == "ok", nil
}

type GetDate struct{}

func (c GetDate) SupportsBLE() bool { return true }
func (c GetDate) Encode() string    { return "read date" }
func (c GetDate) Decode(response string) (string, error) {
	return strings.TrimSpace(response), nil
}

type GetTemperatureHistory struct{}

func (c GetTemperatureHistory) SupportsBLE() bool  { return true }
func (c GetTemperatureHistory) SupportsWiFi() bool { return false }
func (c GetTemperatureHistory) Encode() string     { return "read data" }
func (c GetTemperatureHistory) Decode(response string) (any, error) {
	parts := strings.Split(response, "read data ")
	if len(parts) != 2 {
		return nil, ParseError{"GetTemperatureHistory", "invalid response format"}
	}
	tempStrs := strings.Fields(strings.TrimSpace(parts[1]))
	temps := make([]float64, 0, len(tempStrs))
	for _, tempStr := range tempStrs {
		temp, err := strconv.ParseFloat(tempStr, 64)
		if err != nil {
			return nil, ParseError{"GetTemperatureHistory", fmt.Sprintf("invalid temperature: %s", tempStr)}
		}
		temps = append(temps, temp)
	}
	return temps, nil
}

type SetWifiCredentials struct {
	SSID     string
	Password string
}

func (c SetWifiCredentials) SupportsBLE() bool  { return true }
func (c SetWifiCredentials) SupportsWiFi() bool { return false }
func (c SetWifiCredentials) Encode() string {
	return fmt.Sprintf("wifi para 2 %s %s WPA2PSK AES", c.SSID, c.Password)
}
func (c SetWifiCredentials) Decode(response string) (any, error) {
	return strings.TrimSpace(response) == "ok", nil
}

type StartSmartlink struct{}

func (c StartSmartlink) SupportsBLE() bool  { return true }
func (c StartSmartlink) SupportsWiFi() bool { return false }
func (c StartSmartlink) Encode() string     { return "smartlink start" }
func (c StartSmartlink) Decode(response string) (any, error) {
	return strings.TrimSpace(response) == "ok", nil
}

type SetDeviceName struct {
	Name string
}

func (c SetDeviceName) SupportsBLE() bool  { return true }
func (c SetDeviceName) SupportsWiFi() bool { return false }
func (c SetDeviceName) Encode() string     { return fmt.Sprintf("set name %s", c.Name) }
func (c SetDeviceName) Decode(response string) (any, error) {
	return strings.TrimSpace(response) == "ok", nil
}

type SetSpeaker struct {
	Enable bool
}

func (c SetSpeaker) SupportsBLE() bool  { return true }
func (c SetSpeaker) SupportsWiFi() bool { return false }
func (c SetSpeaker) Encode() string {
	if c.Enable {
		return "set speaker on"
	}
	return "set speaker off"
}
func (c SetSpeaker) Decode(response string) (any, error) {
	return strings.TrimSpace(response) == "ok", nil
}
