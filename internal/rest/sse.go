package rest

import (
	"anova4all/pkg/wifi"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/puzpuzpuz/xsync"
)

type SSEManager struct {
	deviceManager wifi.AnovaManager
	listeners     *xsync.MapOf[string, *xsync.MapOf[string, chan SSEEvent]]
}

func NewSSEManager(deviceManager wifi.AnovaManager) *SSEManager {
	manager := &SSEManager{
		deviceManager: deviceManager,
		listeners:     xsync.NewMapOf[*xsync.MapOf[string, chan SSEEvent]](),
	}
	manager.registerCallbacks()
	return manager
}

func (m *SSEManager) Connect(deviceID string) (string, <-chan SSEEvent) {
	listenerID := uuid.NewString()
	eventChan := make(chan SSEEvent, 100)

	deviceListeners, _ := m.listeners.LoadOrStore(deviceID, xsync.NewMapOf[chan SSEEvent]())
	deviceListeners.Store(listenerID, eventChan)

	return listenerID, eventChan
}

func (m *SSEManager) Disconnect(deviceID, listenerID string) {
	if deviceListeners, ok := m.listeners.Load(deviceID); ok {
		if ch, loaded := deviceListeners.LoadAndDelete(listenerID); loaded {
			close(ch)
		}
		if deviceListeners.Size() == 0 {
			m.listeners.Delete(deviceID)
		}
	}
}

func (m *SSEManager) Broadcast(event SSEEvent) {
	if deviceListeners, ok := m.listeners.Load(event.DeviceID); ok {
		deviceListeners.Range(func(_ string, ch chan SSEEvent) bool {
			go func(ch chan SSEEvent) {
				ch <- event
			}(ch)
			return true
		})
	}
}

func (m *SSEManager) DeviceConnectedCallback(device wifi.AnovaDevice) {
	event := SSEEvent{
		DeviceID:  device.IDCard(),
		EventType: SSEEventTypeDeviceConnected,
		Timestamp: time.Now(),
	}
	m.Broadcast(event)
}

func (m *SSEManager) DeviceDisconnectedCallback(deviceID string) {
	event := SSEEvent{
		DeviceID:  deviceID,
		EventType: SSEEventTypeDeviceDisconnected,
		Timestamp: time.Now(),
	}
	m.Broadcast(event)
}

func (m *SSEManager) DeviceStateChangeCallback(deviceID string, state wifi.DeviceState) {
	event := SSEEvent{
		DeviceID:  deviceID,
		EventType: SSEEventTypeStateChanged,
		Payload:   state,
		Timestamp: time.Now(),
	}
	m.Broadcast(event)
}

func (m *SSEManager) DeviceEventCallback(deviceID string, anovaEvent wifi.AnovaEvent) {
	event := SSEEvent{
		DeviceID:  deviceID,
		EventType: SSEEventTypeEvent,
		Payload:   anovaEvent,
		Timestamp: time.Now(),
	}
	m.Broadcast(event)
}

func (m *SSEManager) registerCallbacks() {
	m.deviceManager.OnDeviceConnected(m.DeviceConnectedCallback)
	m.deviceManager.OnDeviceDisconnected("*", m.DeviceDisconnectedCallback)
	m.deviceManager.OnDeviceStateChange("*", m.DeviceStateChangeCallback)
	m.deviceManager.OnDeviceEvent("*", m.DeviceEventCallback)
}

func (m *SSEManager) ServeHTTP(deviceID string) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		listenerID, eventChan := m.Connect(deviceID)
		defer m.Disconnect(deviceID, listenerID)

		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
			return
		}

		pingTicker := time.NewTicker(30 * time.Second)
		defer pingTicker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case event := <-eventChan:
				data, _ := json.Marshal(event)
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.EventType, data)
				flusher.Flush()
			case <-pingTicker.C:
				fmt.Fprintf(w, "event: ping\ndata: {}\n\n")
				flusher.Flush()
			}
		}
	}
}
