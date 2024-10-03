package wifi

import (
	"anova4all/pkg/commands"
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

const HeartbeatInterval = 3 * time.Second

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
type StateChangeCallback func(idCard string, state DeviceState)
type DeviceEventCallback func(idCard string, event AnovaEvent)

// AnovaDevice represents an Anova device connected via WiFi.
type AnovaDevice interface {
	SendCommand(ctx context.Context, command commands.Command) (any, error)
	SetStateChangeCallback(callback StateChangeCallback)
	SetEventCallback(callback DeviceEventCallback)
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
}

// NewAnovaDevice creates a new AnovaDevice instance.
func NewAnovaDevice(connection AnovaConnection, ctx context.Context) (AnovaDevice, error) {
	dev := &device{
		connection: connection,
		state:      DeviceState{},
	}
	connection.SetEventCallback(dev.handleEvent)
	err := dev.handshake(ctx)
	if err != nil {
		return nil, fmt.Errorf("Failed to perform a handshake: %e", err)
	}
	go dev.heartbeat(ctx)

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
		log.Printf("Failed to get initial status: %v", err)
		return fmt.Errorf("failed to get initial status: %w", err)
	}

	log.Printf("Handshake completed for device %s", d.idCard)
	return nil
}

// heartbeat perform a periodic heartbeat on the device over HeartbeatInterval
func (d *device) heartbeat(ctx context.Context) {
	ticker := time.NewTicker(HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			log.Println("❤️ heartbeat -- start")

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
					log.Println("heartbeat failed", err)
				}
			}
			log.Println("❤️ heartbeat -- end")
		}
	}
}

// SendCommand sends a command to the device and updates the device state.
func (d *device) SendCommand(ctx context.Context, command commands.Command) (any, error) {
	response, err := d.connection.SendCommand(ctx, command.Encode())
	if err != nil {
		return nil, err
	}

	result, err := command.Decode(response)
	if err != nil {
		return nil, err
	}

	d.updateState(command, result)
	return result, nil
}

func (d *device) updateState(command commands.Command, response any) {
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

	d.notifyStateChange()
}

func (d *device) notifyStateChange() {
	if d.stateChangeCallback != nil {
		d.stateChangeCallback(d.idCard, d.state)
	}
}

func (d *device) handleEvent(event AnovaEvent) error {
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

	d.notifyStateChange()

	if d.eventCallback != nil {
		d.eventCallback(d.idCard, event)
	}
	return nil
}

// SetStateChangeCallback sets the callback for state changes.
func (d *device) SetStateChangeCallback(callback StateChangeCallback) {
	d.stateChangeMu.Lock()
	defer d.stateChangeMu.Unlock()
	d.stateChangeCallback = callback
}

// SetEventCallback sets the callback for events.
func (d *device) SetEventCallback(callback DeviceEventCallback) {
	d.stateChangeMu.Lock()
	defer d.stateChangeMu.Unlock()
	d.eventCallback = callback
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
