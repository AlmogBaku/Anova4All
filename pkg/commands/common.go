package commands

import (
	"fmt"
	"strconv"
	"strings"
)

type SetTargetTemperature struct {
	Temperature float64
	Unit        TemperatureUnit
}

func (c SetTargetTemperature) SupportsBLE() bool  { return true }
func (c SetTargetTemperature) SupportsWiFi() bool { return true }
func (c SetTargetTemperature) Encode() string     { return fmt.Sprintf("set temp %.1f", c.Temperature) }
func (c SetTargetTemperature) Decode(response string) (any, error) {
	return strings.TrimSpace(response) == "ok", nil
}

type SetTimer struct {
	Minutes int
}

func (c SetTimer) SupportsBLE() bool  { return true }
func (c SetTimer) SupportsWiFi() bool { return true }
func (c SetTimer) Encode() string     { return fmt.Sprintf("set timer %d", c.Minutes) }
func (c SetTimer) Decode(response string) (any, error) {
	return strings.TrimSpace(response) == "ok", nil
}

type SetTemperatureUnit struct {
	Unit TemperatureUnit
}

func (c SetTemperatureUnit) SupportsBLE() bool  { return true }
func (c SetTemperatureUnit) SupportsWiFi() bool { return true }
func (c SetTemperatureUnit) Encode() string     { return fmt.Sprintf("set unit %s", c.Unit) }
func (c SetTemperatureUnit) Decode(response string) (any, error) {
	return strings.TrimSpace(response) == "ok", nil
}

type GetTargetTemperature struct{}

func (c GetTargetTemperature) SupportsBLE() bool  { return true }
func (c GetTargetTemperature) SupportsWiFi() bool { return true }
func (c GetTargetTemperature) Encode() string     { return "read set temp" }
func (c GetTargetTemperature) Decode(response string) (any, error) {
	return strconv.ParseFloat(strings.TrimSpace(response), 64)
}

type GetCurrentTemperature struct{}

func (c GetCurrentTemperature) SupportsBLE() bool  { return true }
func (c GetCurrentTemperature) SupportsWiFi() bool { return true }
func (c GetCurrentTemperature) Encode() string     { return "read temp" }
func (c GetCurrentTemperature) Decode(response string) (any, error) {
	return strconv.ParseFloat(strings.TrimSpace(response), 64)
}

type StartDevice struct{}

func (c StartDevice) SupportsBLE() bool  { return true }
func (c StartDevice) SupportsWiFi() bool { return true }
func (c StartDevice) Encode() string     { return "start" }
func (c StartDevice) Decode(response string) (any, error) {
	resp := strings.ToLower(strings.TrimSpace(response))
	return resp == "ok" || resp == "start", nil
}

type StopDevice struct{}

func (c StopDevice) SupportsBLE() bool  { return true }
func (c StopDevice) SupportsWiFi() bool { return true }
func (c StopDevice) Encode() string     { return "stop" }
func (c StopDevice) Decode(response string) (any, error) {
	resp := strings.ToLower(strings.TrimSpace(response))
	return resp == "ok" || resp == "stop", nil
}

type GetDeviceStatus struct{}

func (c GetDeviceStatus) SupportsBLE() bool  { return true }
func (c GetDeviceStatus) SupportsWiFi() bool { return true }
func (c GetDeviceStatus) Encode() string     { return "status" }
func (c GetDeviceStatus) Decode(response string) (any, error) {
	status := DeviceStatus(strings.ToLower(strings.TrimSpace(response)))
	switch status {
	case Running, Stopped, LowWater, HeaterError, PowerLoss, UserChangeParameter:
		return status, nil
	default:
		return "", ParseError{"GetDeviceStatus", fmt.Sprintf("unknown status: %s", status)}
	}
}

type StartTimer struct{}

func (c StartTimer) SupportsBLE() bool  { return true }
func (c StartTimer) SupportsWiFi() bool { return true }
func (c StartTimer) Encode() string     { return "start time" }
func (c StartTimer) Decode(response string) (any, error) {
	return strings.TrimSpace(response) == "ok", nil
}

type StopTimer struct{}

func (c StopTimer) SupportsBLE() bool  { return true }
func (c StopTimer) SupportsWiFi() bool { return true }
func (c StopTimer) Encode() string     { return "stop time" }
func (c StopTimer) Decode(response string) (any, error) {
	resp := strings.ToLower(strings.TrimSpace(response))
	return resp == "ok" || resp == "stop time", nil
}

type GetTimerStatus struct{}

func (c GetTimerStatus) SupportsBLE() bool  { return true }
func (c GetTimerStatus) SupportsWiFi() bool { return true }
func (c GetTimerStatus) Encode() string     { return "read timer" }
func (c GetTimerStatus) Decode(response string) (any, error) {
	parts := strings.Fields(response)
	if len(parts) != 2 {
		return TimerStatus{}, ParseError{"GetTimerStatus", "invalid response format"}
	}
	minutes, err := strconv.Atoi(parts[0])
	if err != nil {
		return TimerStatus{}, ParseError{"GetTimerStatus", "invalid minutes"}
	}
	running := strings.ToLower(parts[1]) == "1"
	return TimerStatus{Minutes: minutes, Running: running}, nil
}

type GetTemperatureUnit struct{}

func (c GetTemperatureUnit) SupportsBLE() bool  { return true }
func (c GetTemperatureUnit) SupportsWiFi() bool { return true }
func (c GetTemperatureUnit) Encode() string     { return "read unit" }
func (c GetTemperatureUnit) Decode(response string) (any, error) {
	unit := TemperatureUnit(strings.ToLower(strings.TrimSpace(response)))
	if unit != Celsius && unit != Fahrenheit {
		return "", ParseError{"GetTemperatureUnit", fmt.Sprintf("unknown unit: %s", unit)}
	}
	return unit, nil
}

type GetIDCard struct{}

func (c GetIDCard) SupportsBLE() bool  { return true }
func (c GetIDCard) SupportsWiFi() bool { return true }
func (c GetIDCard) Encode() string     { return "get id card" }
func (c GetIDCard) Decode(response string) (any, error) {
	id := strings.TrimSpace(response)
	if strings.HasPrefix(id, "anova ") {
		id = id[6:]
	}
	return id, nil
}

type ClearAlarm struct{}

func (c ClearAlarm) SupportsBLE() bool  { return true }
func (c ClearAlarm) SupportsWiFi() bool { return true }
func (c ClearAlarm) Encode() string     { return "clear alarm" }
func (c ClearAlarm) Decode(response string) (any, error) {
	resp := strings.ToLower(strings.TrimSpace(response))
	return resp == "ok" || resp == "clear alarm", nil
}

type GetSpeakerStatus struct{}

func (c GetSpeakerStatus) SupportsBLE() bool  { return true }
func (c GetSpeakerStatus) SupportsWiFi() bool { return true }
func (c GetSpeakerStatus) Encode() string     { return "speaker status" }
func (c GetSpeakerStatus) Decode(response string) (any, error) {
	return strings.HasSuffix(strings.ToLower(strings.TrimSpace(response)), " on"), nil
}

type GetVersion struct{}

func (c GetVersion) SupportsBLE() bool  { return true }
func (c GetVersion) SupportsWiFi() bool { return true }
func (c GetVersion) Encode() string     { return "version" }
func (c GetVersion) Decode(response string) (any, error) {
	return strings.TrimSpace(response), nil
}
