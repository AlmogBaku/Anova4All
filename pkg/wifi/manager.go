//go:build !no_wifi

package wifi

import (
	"context"
	"fmt"
	"log"

	"github.com/puzpuzpuz/xsync"
	"golang.org/x/sync/errgroup"
)

type DeviceConnectedCallback func(device AnovaDevice)
type DeviceDisconnectedCallback func(deviceID string)
type DeviceStateChangeCallback func(deviceID string, state DeviceState)

type AnovaManager interface {
	Devices() []AnovaDevice
	Device(deviceID string) AnovaDevice
	OnDeviceConnected(callback DeviceConnectedCallback)
	OnDeviceDisconnected(deviceID string, callback DeviceDisconnectedCallback)
	OnDeviceStateChange(deviceID string, callback DeviceStateChangeCallback)
	OnDeviceEvent(deviceID string, callback DeviceEventCallback)
	Server() AnovaServer
	Close() error
}

type manager struct {
	ctx                         context.Context
	server                      AnovaServer
	devices                     *xsync.MapOf[string, AnovaDevice]
	deviceConnectedCallbacks    []DeviceConnectedCallback
	deviceDisconnectedCallbacks *xsync.MapOf[string, DeviceDisconnectedCallback]
	deviceStateChangeCallbacks  *xsync.MapOf[string, DeviceStateChangeCallback]
	deviceEventCallbacks        *xsync.MapOf[string, DeviceEventCallback]
}

func NewAnovaManager(ctx context.Context, host string, port int) (AnovaManager, error) {
	srv, err := NewAnovaServer(host, port)
	if err != nil {
		return nil, fmt.Errorf("failed to create AnovaServer: %w", err)
	}

	mgr := &manager{
		ctx:                         ctx,
		server:                      srv,
		devices:                     xsync.NewMapOf[AnovaDevice](),
		deviceDisconnectedCallbacks: xsync.NewMapOf[DeviceDisconnectedCallback](),
		deviceStateChangeCallbacks:  xsync.NewMapOf[DeviceStateChangeCallback](),
		deviceEventCallbacks:        xsync.NewMapOf[DeviceEventCallback](),
	}
	mgr.server.OnConnection(mgr.handleNewConnection)
	return mgr, nil
}

func (m *manager) Server() AnovaServer {
	return m.server
}

func (m *manager) Close() error {
	eg := errgroup.Group{}
	m.devices.Range(func(key string, dev AnovaDevice) bool {
		func(dev AnovaDevice) {
			eg.Go(func() error {
				return dev.Close()
			})
		}(dev)
		return true
	})
	err := eg.Wait()
	if err != nil {
		return err
	}
	m.devices = xsync.NewMapOf[AnovaDevice]()
	return m.server.Close()
}

func (m *manager) Devices() []AnovaDevice {
	var devices []AnovaDevice
	m.devices.Range(func(_ string, device AnovaDevice) bool {
		devices = append(devices, device)
		return true
	})
	return devices
}

func (m *manager) Device(deviceID string) AnovaDevice {
	dev, ok := m.devices.Load(deviceID)
	if !ok {
		return nil
	}
	return dev
}

func (m *manager) OnDeviceConnected(callback DeviceConnectedCallback) {
	m.deviceConnectedCallbacks = append(m.deviceConnectedCallbacks, callback)
}

func (m *manager) OnDeviceDisconnected(deviceID string, callback DeviceDisconnectedCallback) {
	m.deviceDisconnectedCallbacks.Store(deviceID, callback)
}

func (m *manager) OnDeviceStateChange(deviceID string, callback DeviceStateChangeCallback) {
	m.deviceStateChangeCallbacks.Store(deviceID, callback)
}

func (m *manager) OnDeviceEvent(deviceID string, callback DeviceEventCallback) {
	m.deviceEventCallbacks.Store(deviceID, callback)
}

func (m *manager) handleNewConnection(conn AnovaConnection) error {
	dev, err := NewAnovaDevice(conn, m.ctx)
	if err != nil {
		return fmt.Errorf("failed to create AnovaDevice: %w", err)
	}
	deviceID := dev.IDCard()
	if deviceID == "" {
		return fmt.Errorf("device ID is empty after handshake")
	}

	if oldDevice, loaded := m.devices.LoadAndStore(deviceID, dev); loaded {
		log.Printf("Device with ID %s is already connected. Closing old connection.", deviceID)
		if err := oldDevice.Close(); err != nil {
			log.Printf("Error closing old device connection: %v", err)
		}
	}

	dev.SetStateChangeCallback(m.handleDeviceStateChange)
	dev.SetEventCallback(m.handleDeviceEvent)

	log.Printf("New device connected: %v", dev)

	for _, callback := range m.deviceConnectedCallbacks {
		callback(dev)
	}

	return nil
}

func (m *manager) handleDeviceDisconnection(deviceID string) {
	if dev, loaded := m.devices.LoadAndDelete(deviceID); loaded {
		log.Printf("Device disconnected: %v", dev)
		if err := dev.Close(); err != nil {
			log.Printf("Error closing device: %v", err)
		}

		if callback, ok := m.deviceDisconnectedCallbacks.Load(deviceID); ok {
			callback(deviceID)
		}
		if callback, ok := m.deviceDisconnectedCallbacks.Load("*"); ok {
			callback(deviceID)
		}

		m.deviceDisconnectedCallbacks.Delete(deviceID)
		m.deviceStateChangeCallbacks.Delete(deviceID)
		m.deviceEventCallbacks.Delete(deviceID)
	}
}

func (m *manager) handleDeviceStateChange(deviceID string, state DeviceState) {
	if callback, ok := m.deviceStateChangeCallbacks.Load(deviceID); ok {
		callback(deviceID, state)
	}
	if callback, ok := m.deviceStateChangeCallbacks.Load("*"); ok {
		callback(deviceID, state)
	}
}

func (m *manager) handleDeviceEvent(deviceID string, event AnovaEvent) {
	if callback, ok := m.deviceEventCallbacks.Load(deviceID); ok {
		callback(deviceID, event)
	}
	if callback, ok := m.deviceEventCallbacks.Load("*"); ok {
		callback(deviceID, event)
	}
}
