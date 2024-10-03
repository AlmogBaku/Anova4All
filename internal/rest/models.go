package rest

import (
	"anova4all/pkg/commands"
	"time"
)

// OkResponse represents a simple OK response
type OkResponse string

const OkResponseValue OkResponse = "ok"

// ServerInfo represents server information
type ServerInfo struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

// SSEEventType represents the type of SSE event
type SSEEventType string

const (
	SSEEventTypeDeviceConnected    SSEEventType = "device_connected"
	SSEEventTypeDeviceDisconnected SSEEventType = "device_disconnected"
	SSEEventTypeStateChanged       SSEEventType = "state_changed"
	SSEEventTypeEvent              SSEEventType = "event"
	SSEEventTypePing               SSEEventType = "ping"
)

// SSEEvent represents an SSE event
type SSEEvent struct {
	EventType SSEEventType `json:"event_type"`
	DeviceID  string       `json:"device_id,omitempty"`
	Payload   interface{}  `json:"payload,omitempty"`
	Timestamp time.Time    `json:"timestamp"`
}

// DeviceInfo represents basic device information
type DeviceInfo struct {
	ID           string `json:"id"`
	Version      string `json:"version,omitempty"`
	DeviceNumber string `json:"device_number,omitempty"`
}

// TemperatureResponse represents a temperature response
type TemperatureResponse struct {
	Temperature float64 `json:"temperature"`
}

// SetTemperatureResponse represents a response to setting the temperature
type SetTemperatureResponse struct {
	ChangedTo float64 `json:"changed_to"`
}

// GetTargetTemperatureResponse represents a response for getting the target temperature
type GetTargetTemperatureResponse struct {
	Temperature float64 `json:"temperature"`
}

// SetTimerResponse represents a response to setting the timer
type SetTimerResponse struct {
	Message string `json:"message"`
	Minutes int    `json:"minutes"`
}

// UnitResponse represents a response for getting the temperature unit
type UnitResponse struct {
	Unit commands.TemperatureUnit `json:"unit"`
}

// SpeakerStatusResponse represents a response for getting the speaker status
type SpeakerStatusResponse struct {
	SpeakerStatus bool `json:"speaker_status"`
}

// TimerResponse represents a response for getting the timer status
type TimerResponse struct {
	Timer int `json:"timer"`
}

// BLEDevice represents a Bluetooth Low Energy device
type BLEDevice struct {
	Address string `json:"address"`
	Name    string `json:"name"`
}

// NewSecretResponse represents a response for generating a new secret key
type NewSecretResponse struct {
	SecretKey string `json:"secret_key"`
}
