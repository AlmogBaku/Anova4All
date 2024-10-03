from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Optional, Tuple


class AnovaCommand(ABC):
    def supports_ble(self) -> bool:
        """Return True if the command is supported by the BLE protocol."""
        return False

    def supports_wifi(self) -> bool:
        """Return True if the command is supported by the WiFi protocol."""
        return False

    @abstractmethod
    def encode(self) -> str:
        """Encode the command into a string."""
        pass

    def decode(self, response: str) -> Any:
        """Default decode method that returns the stripped response."""
        return response.strip()

    def __str__(self) -> str:
        return self.encode()


class TemperatureUnit(Enum):
    CELSIUS = "c"
    FAHRENHEIT = "f"


class DeviceStatus(Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    LOW_WATER = "low water"
    HEATER_ERROR = "heater error"
    POWER_LOSS = "power loss"
    USER_CHANGE_PARAMETER = "user change parameter"


class SetTargetTemperature(AnovaCommand):
    def supports_wifi(self) -> bool:
        return True

    def supports_ble(self) -> bool:
        return True

    def __init__(self, temperature: float, unit: Optional[TemperatureUnit]):
        if unit:
            if unit == TemperatureUnit.CELSIUS:
                if not 5.0 <= temperature <= 99.9:
                    raise ValueError("Temperature must be between 5.0°C and 99.9°C")
            else:
                if not 41.0 <= temperature <= 211.8:
                    raise ValueError("Temperature must be between 41.0°F and 211.8°F")
        self.temperature = round(temperature, 1)  # Rounds to 1 decimal place
        self.unit = unit

    def encode(self) -> str:
        return f"set temp {self.temperature:.1f}"


class SetTimer(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def __init__(self, minutes: int):
        if not 0 <= minutes <= 6000:
            raise ValueError("Timer must be between 0 and 6000 minutes")
        self.minutes = int(minutes)  # Ensures it's an integer

    def encode(self) -> str:
        return f"set timer {self.minutes}"


class SetTemperatureUnit(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def __init__(self, unit: TemperatureUnit):
        self.unit = unit

    def encode(self) -> str:
        return f"set unit {self.unit.value}"


class GetTargetTemperature(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "read set temp"

    def decode(self, response: str) -> float:
        return float(float(response.strip()))


class GetCurrentTemperature(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "read temp"

    def decode(self, response: str) -> float:
        return float(float(response.strip()))


class StartDevice(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "start"

    def decode(self, response: str) -> bool:
        return response.strip().lower() == "ok" or response.strip().lower() == "start"


class StopDevice(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "stop"

    def decode(self, response: str) -> bool:
        return response.strip().lower() == "ok" or response.strip().lower() == "stop"


class GetDeviceStatus(AnovaCommand):

    def supports_wifi(self) -> bool:
        return True

    def supports_ble(self) -> bool:
        return True

    def encode(self) -> str:
        return "status"

    def decode(self, response: str) -> DeviceStatus:
        try:
            return DeviceStatus(response.strip().lower().split(" ")[0])
        except ValueError:
            raise ValueError(f"Unknown device status: {response}")


class StartTimer(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "start time"


class StopTimer(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "stop time"

    def decode(self, response: str) -> bool:
        return response.strip().lower() == "ok" or response.strip().lower() == "stop time"


class GetTimerStatus(AnovaCommand):
    def supports_wifi(self) -> bool:
        return True

    def supports_ble(self) -> bool:
        return True

    def encode(self) -> str:
        return "read timer"

    def decode(self, response: str) -> Tuple[int, bool]:
        if response.lower().endswith(" stopped"):
            return 0, False
        if response.lower().endswith(" running"):
            return int(response[:-8].strip()), True
        return int(response.strip()), False


class GetTemperatureUnit(AnovaCommand):
    def supports_wifi(self) -> bool:
        return True

    def supports_ble(self) -> bool:
        return True

    def encode(self) -> str:
        return "read unit"

    def decode(self, response: str) -> TemperatureUnit:
        try:
            return TemperatureUnit(response.strip().lower())
        except ValueError:
            raise ValueError(f"Unknown temperature unit: {response}")


class GetIDCard(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "get id card"

    def decode(self, response: str) -> str:
        id_card = response.strip()
        if id_card.startswith("anova "):
            id_card = id_card[6:]
        return id_card


class ClearAlarm(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "clear alarm"

    def decode(self, response: str) -> bool:
        return response.strip().lower() == "ok" or response.strip().lower() == "clear alarm"


class GetSpeakerStatus(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "speaker status"

    def decode(self, response: str) -> bool:
        return response.strip().lower().endswith(" on")


class GetVersion(AnovaCommand):
    def supports_wifi(self) -> bool: return True

    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "version"
