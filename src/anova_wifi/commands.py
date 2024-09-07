from typing import Any

from pydantic import BaseModel, Field


class AnovaCommand(BaseModel):
    @classmethod
    async def execute(cls, *args, **kwargs) -> str:
        raise NotImplementedError("Subclasses must implement execute method")

    @classmethod
    def parse_response(cls, response: str) -> Any:
        raise NotImplementedError("Subclasses must implement parse_response method")


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
    target_temperature: float
    timer_running: bool
    timer_value: int

    @classmethod
    async def execute(cls) -> str:
        return "status"

    @classmethod
    def parse_response(cls, response: str) -> 'StatusCommand':
        if response.lower() == "stopped":
            return cls(running=False, temperature=0.0, target_temperature=0.0, timer_running=False, timer_value=0)

        parts = response.split(',')
        return cls(
            running=parts[0] == "running",
            temperature=float(parts[1]),
            target_temperature=float(parts[2]),
            timer_running=parts[3] == "timer_on",
            timer_value=int(parts[4])
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
    unit: str

    @classmethod
    async def execute(cls) -> str:
        return "read unit"

    @classmethod
    def parse_response(cls, response: str) -> 'ReadUnitCommand':
        return cls(unit=response.strip())


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
