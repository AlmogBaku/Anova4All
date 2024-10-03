from enum import Enum

from pydantic import BaseModel


class EventType(str, Enum):
    TEMP_REACHED = "temp_reached"
    LOW_WATER = "low_water"
    START = "start"
    STOP = "stop"
    CHANGE_TEMP = "change_temp"
    TIME_START = "time_start"
    TIME_STOP = "time_stop"
    TIME_FINISH = "time_finish"
    ChangeParam = "change_param"


class EventOriginator(str, Enum):
    WIFI = "wifi"
    BLE = "ble"
    Device = "device"


class AnovaEvent(BaseModel):
    type: EventType
    originator: EventOriginator = EventOriginator.Device

    @classmethod
    def parse_event(cls, event_string: str) -> 'AnovaEvent':
        orig = EventOriginator.Device

        if event_string.startswith("event wifi"):
            orig = EventOriginator.WIFI
        elif event_string.startswith("event ble"):
            orig = EventOriginator.BLE

        event_string = event_string.replace("event ", "").replace("wifi ", "").replace("ble ", "")

        es = event_string.lower().strip()
        if es.startswith("user changed"):
            return cls(type=EventType.ChangeParam, originator=orig)
        elif es == "stop":
            return cls(type=EventType.STOP, originator=orig)
        elif es == "start":
            return cls(type=EventType.START, originator=orig)
        elif es == "low water":
            return cls(type=EventType.LOW_WATER, originator=orig)
        elif es == "time start":
            return cls(type=EventType.TIME_START, originator=orig)
        elif es == "time stop":
            return cls(type=EventType.TIME_STOP, originator=orig)
        elif es == "time finish":
            return cls(type=EventType.TIME_FINISH, originator=orig)
        elif es.startswith("temp has reached"):
            return cls(type=EventType.TEMP_REACHED, originator=orig)
        else:
            raise ValueError(f"Unknown event: {event_string}")

    @staticmethod
    def is_event(message: str) -> bool:
        return message.startswith("event") or message.startswith("user changed")
