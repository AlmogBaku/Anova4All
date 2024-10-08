//go:build !no_wifi

package wifi

import (
	"anova4all/pkg/commands"
	"context"
	"fmt"
	"go.uber.org/zap"
	"sync"
	"time"
)

const HeartbeatInterval = 2 * time.Second

// DeviceState represents the current state of the Anova device.
type DeviceState struct {
	Status             commands.DeviceStatus    `json:"status"`
	CurrentTemperature float64                  `json:"current_temperature"`
	TargetTemperature  float64                  `json:"target_temperature"`
	TimerRunning       bool                     `json:"timer_running"`
	TimerValue         int                      `json:"timer_value"`
	Unit               commands.TemperatureUnit `json:"unit"`
	SpeakerStatus      bool                     `json:"speaker_status"`
}

// StateChangeCallback is a function type for state change notifications.
type StateChangeCallback func(ctx context.Context, idCard string, state DeviceState)
type DeviceEventCallback func(ctx context.Context, idCard string, event AnovaEvent)
type DisconnectedCallback func(ctx context.Context, idCard string)

// AnovaDevice represents an Anova device connected via WiFi.
type AnovaDevice interface {
	SendCommand(ctx context.Context, command commands.Command) (any, error)
	SetStateChangeCallback(callback StateChangeCallback)
	SetEventCallback(callback DeviceEventCallback)
	SetHandleDisconnectCallback(callback DisconnectedCallback)
	StartCooking(ctx context.Context) error
	StopCooking(ctx context.Context) error
	State() DeviceState
	Version() string
	IDCard() string
	SecretKey() string
	Close() error
}

type device struct {
	connection          AnovaConnection
	idCard              string
	version             string
	secretKey           string
	state               DeviceState
	stateChangeMu       sync.RWMutex
	stateChangeCallback StateChangeCallback
	eventCallback       DeviceEventCallback
	disconnectCallback  DisconnectedCallback
	logger              *zap.SugaredLogger
}

// NewAnovaDevice creates a new AnovaDevice instance.
func NewAnovaDevice(ctx context.Context, connection AnovaConnection, logger *zap.Logger) (AnovaDevice, error) {
	if logger == nil {
		logger = zap.NewNop()
	}
	logger = logger.Named("wifi_device")

	dev := &device{
		connection: connection,
		state:      DeviceState{},
		logger:     logger.Sugar(),
	}
	connection.SetEventCallback(dev.handleEvent)
	err := dev.handshake(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to perform a handshake: %e", err)
	}
	go dev.heartbeat(ctx)
	go func() {
		<-ctx.Done()
		if dev.disconnectCallback != nil {
			dev.disconnectCallback(context.Background(), dev.idCard)
		}
	}()

	return dev, nil
}

func (d *device) SecretKey() string {
	return d.secretKey
}
func (d *device) State() DeviceState {
	d.stateChangeMu.RLock()
	defer d.stateChangeMu.RUnlock()
	return d.state
}
func (d *device) Version() string {
	return d.version
}
func (d *device) IDCard() string {
	return d.idCard
}

// handshake performs the initial handshake with the device.
func (d *device) handshake(ctx context.Context) error {
	var err error

	idCard, err := d.SendCommand(ctx, &commands.GetIDCard{})
	if err != nil {
		return fmt.Errorf("failed to get ID card: %w", err)
	}
	d.idCard = idCard.(string)
	d.logger = d.logger.Named(d.idCard)
	d.connection.Name(d.idCard)

	version, err := d.SendCommand(ctx, &commands.GetVersion{})
	if err != nil {
		return fmt.Errorf("failed to get version: %w", err)
	}
	d.version = version.(string)

	secretKey, err := d.SendCommand(ctx, &commands.GetSecretKey{})
	if err != nil {
		return fmt.Errorf("failed to get secret key: %w", err)
	}
	d.secretKey = secretKey.(string)

	_, err = d.SendCommand(ctx, &commands.GetDeviceStatus{})
	if err != nil {
		d.logger.With("error", err).Error("Failed to get initial status")
		return fmt.Errorf("failed to get initial status: %w", err)
	}

	d.logger.Debug("Handshake completed")
	return nil
}

// heartbeat perform a periodic heartbeat on the device over HeartbeatInterval
// This is used to keep the connection alive and to keep the device state up to date (polling).
func (d *device) heartbeat(ctx context.Context) {
	ticker := time.NewTicker(HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.logger.Debug("Heartbeat...")

			sequence := []commands.Command{
				&commands.GetDeviceStatus{},
				&commands.GetTargetTemperature{},
				&commands.GetCurrentTemperature{},
				&commands.GetTemperatureUnit{},
				&commands.GetTimerStatus{},
				&commands.GetSpeakerStatus{},
			}

			for _, cmd := range sequence {
				if _, err := d.SendCommand(ctx, cmd); err != nil {
					d.logger.With("error", err).Error("heartbeat failed")
				}
			}
		}
	}
}

// SendCommand sends a command to the device and updates the device state.
func (d *device) SendCommand(ctx context.Context, command commands.Command) (any, error) {
	if command == nil || !command.SupportsWiFi() {
		return nil, fmt.Errorf("invalid command: %v", command)
	}
	response, err := d.connection.SendCommand(ctx, command.Encode())
	if err != nil {
		return nil, err
	}

	result, err := command.Decode(response)
	if err != nil {
		return nil, err
	}

	d.updateState(ctx, command, result)
	return result, nil
}

func (d *device) updateState(ctx context.Context, command commands.Command, response any) {
	d.stateChangeMu.Lock()
	defer d.stateChangeMu.Unlock()

	switch command.(type) {
	case *commands.GetDeviceStatus:
		d.state.Status = response.(commands.DeviceStatus)
	case *commands.GetCurrentTemperature:
		d.state.CurrentTemperature = response.(float64)
	case *commands.GetTargetTemperature, *commands.SetTargetTemperature:
		d.state.TargetTemperature = response.(float64)
	case *commands.SetTemperatureUnit, *commands.GetTemperatureUnit:
		d.state.Unit = response.(commands.TemperatureUnit)
	case *commands.GetTimerStatus:
		timerStatus := response.(commands.TimerStatus)
		d.state.TimerValue = timerStatus.Minutes
		d.state.TimerRunning = timerStatus.Running
	case *commands.SetTimer:
		d.state.TimerValue = response.(int)
	case *commands.GetSpeakerStatus:
		d.state.SpeakerStatus = response.(bool)
	}

	d.notifyStateChange(ctx)
}

func (d *device) notifyStateChange(ctx context.Context) {
	if d.stateChangeCallback != nil {
		d.stateChangeCallback(ctx, d.idCard, d.state)
	}
}

func (d *device) handleEvent(ctx context.Context, event AnovaEvent) error {
	d.stateChangeMu.Lock()
	defer d.stateChangeMu.Unlock()

	switch event.Type {
	case EventTypeTempReached:
		d.state.CurrentTemperature = d.state.TargetTemperature
	case EventTypeLowWater:
		d.state.Status = commands.LowWater
	case EventTypeStop:
		d.state.Status = commands.Stopped
	case EventTypeStart:
		d.state.Status = commands.Running
	case EventTypeTimeStart:
		d.state.TimerRunning = true
	case EventTypeTimeStop, EventTypeTimeFinish:
		d.state.TimerRunning = false
	default:
		return fmt.Errorf("unknown event: %s", event)
	}

	d.notifyStateChange(ctx)

	if d.eventCallback != nil {
		d.eventCallback(ctx, d.idCard, event)
	}
	return nil
}

// SetStateChangeCallback sets the callback for state changes.
func (d *device) SetStateChangeCallback(callback StateChangeCallback) {
	d.stateChangeCallback = callback
}

// SetEventCallback sets the callback for events.
func (d *device) SetEventCallback(callback DeviceEventCallback) {
	d.eventCallback = callback
}

// SetHandleDisconnectCallback sets the callback for disconnections.
func (d *device) SetHandleDisconnectCallback(callback DisconnectedCallback) {
	d.disconnectCallback = callback
}

// StartCooking starts the cooking process.
func (d *device) StartCooking(ctx context.Context) error {
	ret, err := d.SendCommand(ctx, &commands.StartDevice{})
	if err != nil {
		return err
	}
	if !ret.(bool) {
		return fmt.Errorf("failed to start cooking")
	}
	return nil
}

// StopCooking stops the cooking process.
func (d *device) StopCooking(ctx context.Context) error {
	ret, err := d.SendCommand(ctx, &commands.StopDevice{})
	if err != nil {
		return err
	}
	if !ret.(bool) {
		return fmt.Errorf("failed to stop cooking")
	}
	return nil
}

// Close closes the connection to the device.
func (d *device) Close() error {
	return d.connection.Close()
}

func (d *device) String() string {
	return fmt.Sprintf("<device id_card=%s version=%s device_number=%s>", d.idCard, d.version, d.secretKey)
}
