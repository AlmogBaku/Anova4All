from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class AnovaCommand(BaseModel):
    @classmethod
    async def execute(cls, *args: Any, **kwargs: Any) -> str:
        raise NotImplementedError("Subclasses must implement execute method")

    @classmethod
    def parse_response(cls, response: str) -> Any:
        raise NotImplementedError("Subclasses must implement parse_response method")


UnitType = Literal['c', 'f']


class GetIdCardCommand(AnovaCommand):
    id_card: str

    @classmethod
    async def execute(cls) -> str:
        return "get id card"

    @classmethod
    def parse_response(cls, response: str) -> 'GetIdCardCommand':
        id_card = response.strip()
        if id_card.startswith("anova "):
            id_card = id_card[6:]
        return cls(id_card=id_card)


class VersionCommand(AnovaCommand):
    version: str

    @classmethod
    async def execute(cls) -> str:
        return "version"

    @classmethod
    def parse_response(cls, response: str) -> 'VersionCommand':
        return cls(version=response.strip())


class GetNumberCommand(AnovaCommand):
    number: str

    @classmethod
    async def execute(cls) -> str:
        return "get number"

    @classmethod
    def parse_response(cls, response: str) -> 'GetNumberCommand':
        return cls(number=response.strip())


class StatusCommand(AnovaCommand):
    running: bool
    temperature: float
    unit: Optional[UnitType]

    @classmethod
    async def execute(cls) -> str:
        return "status"

    @classmethod
    def parse_response(cls, response: str) -> 'StatusCommand':
        if response.lower() == "stopped":
            return cls(running=False, temperature=0.0, unit=None)

        parts = response.split(',')
        return cls(
            running=parts[0] == "running",
            temperature=float(parts[1]),
            unit=parts[2].strip().lower(),  # type: ignore[arg-type]
        )


class SetTempCommand(AnovaCommand):
    temperature: float

    @classmethod
    async def execute(cls, temperature: float) -> str:
        return f"set temp {temperature:.1f}"

    @classmethod
    def parse_response(cls, response: str) -> 'SetTempCommand':
        return cls(temperature=float(response.strip()))


class ReadSetTempCommand(AnovaCommand):
    temperature: float

    @classmethod
    async def execute(cls) -> str:
        return "read set temp"

    @classmethod
    def parse_response(cls, response: str) -> 'ReadSetTempCommand':
        return cls(temperature=float(response.strip()))


class ReadTempCommand(AnovaCommand):
    temperature: float

    @classmethod
    async def execute(cls) -> str:
        return "read temp"

    @classmethod
    def parse_response(cls, response: str) -> 'ReadTempCommand':
        return cls(temperature=float(response.strip()))


class ReadUnitCommand(AnovaCommand):
    unit: UnitType

    @classmethod
    async def execute(cls) -> str:
        return "read unit"

    @classmethod
    def parse_response(cls, response: str) -> 'ReadUnitCommand':
        return cls(unit=response.strip().lower())  # type: ignore[arg-type]


class StartCommand(AnovaCommand):
    success: bool = Field(default=False)

    @classmethod
    async def execute(cls) -> str:
        return "start"

    @classmethod
    def parse_response(cls, response: str) -> 'StartCommand':
        return cls(success=response.strip().lower() == "ok")


class StopCommand(AnovaCommand):
    success: bool = Field(default=False)

    @classmethod
    async def execute(cls) -> str:
        return "stop"

    @classmethod
    def parse_response(cls, response: str) -> 'StopCommand':
        return cls(success=response.strip().lower() == "ok")


class ReadTimerCommand(AnovaCommand):
    minutes: int

    @classmethod
    async def execute(cls) -> str:
        return "read timer"

    @classmethod
    def parse_response(cls, response: str) -> 'ReadTimerCommand':
        if response.lower().endswith(" stopped"):
            return cls(minutes=0)
        return cls(minutes=int(response.strip()))


class SetTimerCommand(AnovaCommand):
    minutes: int

    @classmethod
    async def execute(cls, minutes: int) -> str:
        return f"set timer {minutes:d}"

    @classmethod
    def parse_response(cls, response: str) -> 'SetTimerCommand':
        return cls(minutes=int(response.strip()))


class StopTimerCommand(AnovaCommand):
    success: bool = Field(default=False)

    @classmethod
    async def execute(cls) -> str:
        return "stop time"

    @classmethod
    def parse_response(cls, response: str) -> 'StopTimerCommand':
        return cls(success=response.strip().lower() == "ok")


class ClearAlarmCommand(AnovaCommand):
    success: bool = Field(default=False)

    @classmethod
    async def execute(cls) -> str:
        return "clear alarm"

    @classmethod
    def parse_response(cls, response: str) -> 'ClearAlarmCommand':
        return cls(success=response.strip().lower() == "ok")


class SpeakerStatusCommand(AnovaCommand):
    is_on: bool

    @classmethod
    async def execute(cls) -> str:
        return "speaker status"

    @classmethod
    def parse_response(cls, response: str) -> 'SpeakerStatusCommand':
        return cls(is_on=response.strip().lower().endswith(" on"))


class EventType(str, Enum):
    TEMP_REACHED = "temp_reached"
    LOW_WATER = "low_water"
    START = "start"
    STOP = "stop"
    CHANGE_TEMP = "change_temp"
    TIME_START = "time_start"
    TIME_STOP = "time_stop"
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
        elif es.startswith("temp has reached"):
            return cls(type=EventType.TEMP_REACHED, originator=orig)
        else:
            raise ValueError(f"Unknown event: {event_string}")

    @staticmethod
    def is_event(message: str) -> bool:
        return message.startswith("event") or message.startswith("user changed")


class SetUnitCommand(AnovaCommand):
    unit: UnitType

    @classmethod
    async def execute(cls, unit: str) -> str:
        if unit.lower() not in ['c', 'f']:
            raise ValueError("Unit must be 'c' or 'f'")
        return f"set unit {unit.lower()}"

    @classmethod
    def parse_response(cls, response: str) -> 'SetUnitCommand':
        return cls(unit=response.strip().lower())  # type: ignore[arg-type]
