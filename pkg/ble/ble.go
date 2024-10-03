//go:build !no_ble

package ble

import (
	"anova4all/pkg/commands"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"tinygo.org/x/bluetooth"
)

const (
	anovaServiceUUID        = "FFE0"
	anovaCharacteristicUUID = "FFE1"
	anovaDeviceName         = "Anova"
	maxCommandLength        = 20
	commandDelimiter        = "\r"
)

// ErrCommandNotSupported is returned when a command is not supported over BLE.
var ErrCommandNotSupported = errors.New("command not supported over BLE")

// Scan scans for Anova devices.
func Scan() (bluetooth.AdvertisementPayload, error) {
	adapter := bluetooth.DefaultAdapter
	err := adapter.Enable()
	if err != nil {
		return nil, fmt.Errorf("failed to enable Bluetooth adapter: %w", err)
	}

	var device bluetooth.ScanResult
	err = adapter.Scan(func(adapter *bluetooth.Adapter, device bluetooth.ScanResult) {
		if device.LocalName() == anovaDeviceName {
			device = device
			_ = adapter.StopScan()
			return
		}
	})

	if err != nil {
		return nil, fmt.Errorf("scan failed: %w", err)
	}

	return device, nil
}

type AnovaBLE interface {
	SendCommand(cmd commands.Command) (any, error)
}

type client struct {
	adapter        *bluetooth.Adapter
	characteristic bluetooth.DeviceCharacteristic
	commandLock    sync.Mutex
}

func New(addr bluetooth.Address) (AnovaBLE, error) {
	adapter := bluetooth.DefaultAdapter
	err := adapter.Enable()
	if err != nil {
		return nil, fmt.Errorf("failed to enable Bluetooth adapter: %w", err)
	}

	device, err := adapter.Connect(addr, bluetooth.ConnectionParams{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect: %w", err)
	}

	anovaUUID, err := hex.DecodeString(anovaServiceUUID)
	if err != nil {
		return nil, fmt.Errorf("failed to decode service UUID: %w", err)
	}

	services, err := device.DiscoverServices([]bluetooth.UUID{bluetooth.NewUUID([16]byte(anovaUUID))})
	if err != nil {
		return nil, fmt.Errorf("failed to discover services: %w", err)
	}

	anovaChar, err := hex.DecodeString(anovaCharacteristicUUID)
	if err != nil {
		return nil, fmt.Errorf("failed to decode characteristic UUID: %w", err)
	}
	characteristics, err := services[0].DiscoverCharacteristics([]bluetooth.UUID{bluetooth.NewUUID([16]byte(anovaChar))})
	if err != nil {
		return nil, fmt.Errorf("failed to discover characteristics: %w", err)
	}

	return &client{
		adapter:        adapter,
		characteristic: characteristics[0],
	}, nil
}

func (c *client) SendCommand(cmd commands.Command) (any, error) {
	if !cmd.SupportsBLE() {
		return nil, ErrCommandNotSupported
	}

	c.commandLock.Lock()
	defer c.commandLock.Unlock()

	encodedCmd := cmd.Encode() + commandDelimiter
	_, err := c.characteristic.WriteWithoutResponse([]byte(encodedCmd))
	if err != nil {
		return nil, fmt.Errorf("failed to write command: %w", err)
	}

	buff := make([]byte, maxCommandLength)
	n, err := c.characteristic.Read(buff)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}
	buff = buff[:n]

	return cmd.Decode(string(buff))
}
