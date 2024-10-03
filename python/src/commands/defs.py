from abc import ABC, abstractmethod
from enum import Enum
from typing import Any


class Command(ABC):
    @abstractmethod
    def supports_ble(self) -> bool:
        """Return True if the command is supported by the BLE protocol."""
        return False

    @abstractmethod
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


class TimerStatus(Enum):
    RUNNING = "running"
    STOPPED = "stopped"
