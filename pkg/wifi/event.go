package wifi

import (
	"errors"
	"strings"
)

type EventType string

const (
	EventTypeTempReached EventType = "temp_reached"
	EventTypeLowWater    EventType = "low_water"
	EventTypeStart       EventType = "start"
	EventTypeStop        EventType = "stop"
	EventTypeChangeTemp  EventType = "change_temp"
	EventTypeTimeStart   EventType = "time_start"
	EventTypeTimeStop    EventType = "time_stop"
	EventTypeTimeFinish  EventType = "time_finish"
	EventTypeChangeParam EventType = "change_param"
)

type EventOriginator string

const (
	EventOriginatorWiFi   EventOriginator = "wifi"
	EventOriginatorBLE    EventOriginator = "ble"
	EventOriginatorDevice EventOriginator = "device"
)

type AnovaEvent struct {
	Type       EventType       `json:"type"`
	Originator EventOriginator `json:"originator"`
}

func ParseEvent(msg *AnovaMessage) (AnovaEvent, error) {
	eventString := string(*msg)
	orig := EventOriginatorDevice

	eventString = strings.TrimSpace(strings.ToLower(eventString))

	if strings.HasPrefix(eventString, "event wifi") {
		orig = EventOriginatorWiFi
		eventString = strings.TrimPrefix(eventString, "event wifi ")
	} else if strings.HasPrefix(eventString, "event ble") {
		orig = EventOriginatorBLE
		eventString = strings.TrimPrefix(eventString, "event ble ")
	} else if strings.HasPrefix(eventString, "event ") {
		eventString = strings.TrimPrefix(eventString, "event ")
	}

	var eventType EventType

	switch {
	case strings.HasPrefix(eventString, "user changed"):
		eventType = EventTypeChangeParam
	case eventString == "stop":
		eventType = EventTypeStop
	case eventString == "start":
		eventType = EventTypeStart
	case eventString == "low water":
		eventType = EventTypeLowWater
	case eventString == "time start":
		eventType = EventTypeTimeStart
	case eventString == "time stop":
		eventType = EventTypeTimeStop
	case eventString == "time finish":
		eventType = EventTypeTimeFinish
	case strings.HasPrefix(eventString, "temp has reached"):
		eventType = EventTypeTempReached
	default:
		return AnovaEvent{}, errors.New("unknown event: " + eventString)
	}

	return AnovaEvent{Type: eventType, Originator: orig}, nil
}

func IsEvent(msg *AnovaMessage) bool {
	return strings.HasPrefix(string(*msg), "event") || strings.HasPrefix(string(*msg), "user changed")
}
