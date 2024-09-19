from abc import ABC, abstractmethod
from typing import Any
from .types import TemperatureValue, TimerValue, TemperatureUnit, DeviceStatus, TimerStatus

class Command(ABC):
    @abstractmethod
    def encode(self) -> str:
        """Encode the command into a string."""
        pass

    def decode(self, response: str) -> Any:
        """Default decode method that returns the stripped response."""
        return response.strip()

class SetCalibrationFactor(Command):
    def __init__(self, factor: float = 0.0):
        if not -9.9 <= factor <= 9.9:
            raise ValueError("Calibration factor must be between -9.9 and 9.9")
        self.factor = round(factor, 1)  # Rounds to 1 decimal place

    def encode(self) -> str:
        return f"cal {self.factor:.1f}"

class SetServerInfo(Command):
    def __init__(self, server_ip: str = "pc.anovaculinary.com", port: int = 8080):
        self.server_ip = server_ip
        self.port = port

    def encode(self) -> str:
        return f"server para {self.server_ip} {self.port}"

class SetLED(Command):
    def __init__(self, red: int, green: int, blue: int):
        for color, value in [("Red", red), ("Green", green), ("Blue", blue)]:
            if not 0 <= value <= 255:
                raise ValueError(f"{color} value must be between 0 and 255")
        self.red = red
        self.green = green
        self.blue = blue

    def encode(self) -> str:
        return f"set led {self.red} {self.green} {self.blue}"

class SetSecretKey(Command):
    def __init__(self, key: str):
        if len(key) != 10 or not key.islower() or not key.isalnum():
            raise ValueError("Secret key must be 10 lowercase alphanumeric characters")
        self.key = key

    def encode(self) -> str:
        return f"set number {self.key}"

class SetTargetTemperature(Command):
    def __init__(self, temperature: TemperatureValue, unit: TemperatureUnit):
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

class SetTimer(Command):
    def __init__(self, minutes: TimerValue):
        if not 0 <= minutes <= 6000:
            raise ValueError("Timer must be between 0 and 6000 minutes")
        self.minutes = int(minutes)  # Ensures it's an integer

    def encode(self) -> str:
        return f"set timer {self.minutes}"

class SetTemperatureUnit(Command):
    def __init__(self, unit: TemperatureUnit):
        self.unit = unit

    def encode(self) -> str:
        return f"set unit {self.unit.value}"

class GetTargetTemperature(Command):
    def encode(self) -> str:
        return "read set temp"

    def decode(self, response: str) -> TemperatureValue:
        return TemperatureValue(float(response.strip()))

class GetCurrentTemperature(Command):
    def encode(self) -> str:
        return "read temp"

    def decode(self, response: str) -> TemperatureValue:
        return TemperatureValue(float(response.strip()))

class StartDevice(Command):
    def encode(self) -> str:
        return "start"

class StopDevice(Command):
    def encode(self) -> str:
        return "stop"

class GetDeviceStatus(Command):
    def encode(self) -> str:
        return "status"

    def decode(self, response: str) -> DeviceStatus:
        try:
            return DeviceStatus(response.strip().lower())
        except ValueError:
            raise ValueError(f"Unknown device status: {response}")

class StartTimer(Command):
    def encode(self) -> str:
        return "start time"

class StopTimer(Command):
    def encode(self) -> str:
        return "stop time"

class GetTimerStatus(Command):
    def encode(self) -> str:
        return "read timer"

    def decode(self, response: str) -> TimerStatus:
        try:
            return TimerStatus(response.strip().lower())
        except ValueError:
            raise ValueError(f"Unknown timer status: {response}")

class GetTemperatureUnit(Command):
    def encode(self) -> str:
        return "read unit"

    def decode(self, response: str) -> TemperatureUnit:
        try:
            return TemperatureUnit(response.strip().lower())
        except ValueError:
            raise ValueError(f"Unknown temperature unit: {response}")

class GetDeviceInformation(Command):
    def encode(self) -> str:
        return "get id card"

class ReadCalibrationFactor(Command):
    def encode(self) -> str:
        return "read cal"

    def decode(self, response: str) -> float:
        return float(response.strip())

class ClearAlarm(Command):
    def encode(self) -> str:
        return "clear alarm"

class GetDate(Command):
    def encode(self) -> str:
        return "read date"

class GetTemperatureHistory(Command):
    def encode(self) -> str:
        return "read data"

class SetWifiCredentials(Command):
    def __init__(self, ssid: str, password: str):
        self.ssid = ssid
        self.password = password

    def encode(self) -> str:
        return f"wifi para 2 {self.ssid} {self.password} WPA2PSK AES"

class StartSmartlink(Command):
    def encode(self) -> str:
        return "smartlink start"

class SetDeviceName(Command):
    def __init__(self, name: str):
        self.name = name

    def encode(self) -> str:
        return f"set name {self.name}"

class TurnOffSpeaker(Command):
    def encode(self) -> str:
        return "set speaker off"

class GetVersion(Command):
    def encode(self) -> str:
        return "version"