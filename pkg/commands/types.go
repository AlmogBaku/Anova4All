package commands

import (
	"fmt"
)

// Command is the interface that wraps the basic methods for Anova commands.
type Command interface {
	Encode() string
	Decode(response string) (any, error)
	SupportsBLE() bool
	SupportsWiFi() bool
}

// TemperatureUnit represents the unit of temperature measurement.
type TemperatureUnit string

const (
	Celsius    TemperatureUnit = "c"
	Fahrenheit TemperatureUnit = "f"
)

// DeviceStatus represents the current status of the Anova device.
type DeviceStatus string

const (
	Running             DeviceStatus = "running"
	Stopped             DeviceStatus = "stopped"
	LowWater            DeviceStatus = "low water"
	HeaterError         DeviceStatus = "heater error"
	PowerLoss           DeviceStatus = "power loss"
	UserChangeParameter DeviceStatus = "user change parameter"
)

// TimerStatus represents the status of the timer.
type TimerStatus struct {
	Minutes int
	Running bool
}

// ParseError is a custom error type for parsing errors.
type ParseError struct {
	Command string
	Message string
}

func (e ParseError) Error() string {
	return fmt.Sprintf("parse error in %s: %s", e.Command, e.Message)
}
