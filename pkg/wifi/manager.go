//go:build !no_wifi

package wifi

import (
	"context"
	"fmt"
	"github.com/puzpuzpuz/xsync"
	"go.uber.org/zap"
	"golang.org/x/sync/errgroup"
)

type ConnectedCallback func(ctx context.Context, device AnovaDevice)

type AnovaManager interface {
	Devices() []AnovaDevice
	Device(deviceID string) AnovaDevice
	OnDeviceConnected(callback ConnectedCallback)
	OnDeviceDisconnected(deviceID string, callback DisconnectedCallback)
	OnDeviceStateChange(deviceID string, callback StateChangeCallback)
	OnDeviceEvent(deviceID string, callback DeviceEventCallback)
	Server() AnovaServer
	Close() error
}

type manager struct {
	server                      AnovaServer
	devices                     *xsync.MapOf[string, AnovaDevice]
	deviceConnectedCallbacks    []ConnectedCallback
	deviceDisconnectedCallbacks *xsync.MapOf[string, DisconnectedCallback]
	deviceStateChangeCallbacks  *xsync.MapOf[string, StateChangeCallback]
	deviceEventCallbacks        *xsync.MapOf[string, DeviceEventCallback]
	logger                      *zap.SugaredLogger
}

func NewAnovaManager(ctx context.Context, host string, port int, logger *zap.Logger) (AnovaManager, error) {
	if logger == nil {
		logger = zap.NewNop()
	}
	logger = logger.Named("wifi_manager")

	srv, err := NewAnovaServer(ctx, host, port, logger)
	if err != nil {
		return nil, fmt.Errorf("failed to create AnovaServer: %w", err)
	}

	mgr := &manager{
		server:                      srv,
		devices:                     xsync.NewMapOf[AnovaDevice](),
		deviceDisconnectedCallbacks: xsync.NewMapOf[DisconnectedCallback](),
		deviceStateChangeCallbacks:  xsync.NewMapOf[StateChangeCallback](),
		deviceEventCallbacks:        xsync.NewMapOf[DeviceEventCallback](),
		logger:                      logger.Sugar(),
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

func (m *manager) OnDeviceConnected(callback ConnectedCallback) {
	m.deviceConnectedCallbacks = append(m.deviceConnectedCallbacks, callback)
}

func (m *manager) OnDeviceDisconnected(deviceID string, callback DisconnectedCallback) {
	m.deviceDisconnectedCallbacks.Store(deviceID, callback)
}

func (m *manager) OnDeviceStateChange(deviceID string, callback StateChangeCallback) {
	m.deviceStateChangeCallbacks.Store(deviceID, callback)
}

func (m *manager) OnDeviceEvent(deviceID string, callback DeviceEventCallback) {
	m.deviceEventCallbacks.Store(deviceID, callback)
}

func (m *manager) handleNewConnection(ctx context.Context, conn AnovaConnection) error {
	dev, err := NewAnovaDevice(ctx, conn, m.logger.Desugar())
	if err != nil {
		return fmt.Errorf("failed to create AnovaDevice: %w", err)
	}
	deviceID := dev.IDCard()
	if deviceID == "" {
		return fmt.Errorf("device ID is empty after handshake")
	}

	if oldDevice, loaded := m.devices.LoadAndStore(deviceID, dev); loaded {
		m.logger.With("device", deviceID).Debug("Device is already connected. Closing old connection.")
		if err := oldDevice.Close(); err != nil {
			m.logger.With("device", deviceID).With("error", err).Error("Error closing old device connection")
		}
	}

	dev.SetStateChangeCallback(m.handleDeviceStateChange)
	dev.SetEventCallback(m.handleDeviceEvent)
	dev.SetHandleDisconnectCallback(m.handleDeviceDisconnection)

	m.logger.With("device", deviceID).Info("New device connected")

	for _, callback := range m.deviceConnectedCallbacks {
		callback(ctx, dev)
	}

	return nil
}

func (m *manager) handleDeviceDisconnection(ctx context.Context, deviceID string) {
	if dev, loaded := m.devices.LoadAndDelete(deviceID); loaded {
		m.logger.With("device", deviceID).Info("Device disconnected")
		if err := dev.Close(); err != nil {
			m.logger.With("device", deviceID).With("error", err).Error("Error closing device")
		}

		if callback, ok := m.deviceDisconnectedCallbacks.Load(deviceID); ok {
			callback(ctx, deviceID)
		}
		if callback, ok := m.deviceDisconnectedCallbacks.Load("*"); ok {
			callback(ctx, deviceID)
		}

		m.deviceDisconnectedCallbacks.Delete(deviceID)
		m.deviceStateChangeCallbacks.Delete(deviceID)
		m.deviceEventCallbacks.Delete(deviceID)
	}
}

func (m *manager) handleDeviceStateChange(ctx context.Context, deviceID string, state DeviceState) {
	if callback, ok := m.deviceStateChangeCallbacks.Load(deviceID); ok {
		callback(ctx, deviceID, state)
	}
	if callback, ok := m.deviceStateChangeCallbacks.Load("*"); ok {
		callback(ctx, deviceID, state)
	}
}

func (m *manager) handleDeviceEvent(ctx context.Context, deviceID string, event AnovaEvent) {
	if callback, ok := m.deviceEventCallbacks.Load(deviceID); ok {
		callback(ctx, deviceID, event)
	}
	if callback, ok := m.deviceEventCallbacks.Load("*"); ok {
		callback(ctx, deviceID, event)
	}
}
