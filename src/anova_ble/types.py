from enum import Enum
from typing import NewType

# Bluetooth Constants
ANOVA_SERVICE_UUID = "ffe0"
ANOVA_CHARACTERISTIC_UUID = "ffe1"
ANOVA_DEVICE_NAME = "Anova"

# Command Constants
MAX_COMMAND_LENGTH = 20
COMMAND_DELIMITER = "\r"

# Custom Types
TemperatureValue = NewType("TemperatureValue", float)
TimerValue = NewType("TimerValue", int)


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


# Custom Exceptions
class AnovaException(Exception):
    """Base exception for Anova-related errors."""


class AnovaConnectionError(AnovaException):
    """Raised when there's an issue connecting to the Anova device."""


class AnovaCommandError(AnovaException):
    """Raised when there's an error executing a command."""
