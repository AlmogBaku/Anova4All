from typing import List, Optional

from .common import AnovaCommand


class GetCalibrationFactor(AnovaCommand):
    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "read cal"

    def decode(self, response: str) -> float:
        return float(response.strip())


class SetCalibrationFactor(AnovaCommand):
    def supports_ble(self) -> bool: return True

    def __init__(self, factor: float = 0.0):
        if not -9.9 <= factor <= 9.9:
            raise ValueError("Calibration factor must be between -9.9 and 9.9")
        self.factor = round(factor, 1)  # Rounds to 1 decimal place

    def encode(self) -> str:
        return f"cal {self.factor:.1f}"


class SetServerInfo(AnovaCommand):
    def supports_ble(self) -> bool:
        return True

    def __init__(self, server_ip: Optional[str] = None, port: Optional[int] = None):
        if not server_ip:
            server_ip = "pc.anovaculinary.com"
        if not port:
            port = 8080

        self.server_ip = server_ip
        self.port = port

    def encode(self) -> str:
        return f"server para {self.server_ip} {self.port}"

    def decode(self, response: str) -> bool:
        parts = response.strip().split(" ")
        if len(parts) == 2:
            return parts[0] == self.server_ip and int(parts[1]) == self.port
        return False


class SetLED(AnovaCommand):
    def supports_ble(self) -> bool:
        return True

    def __init__(self, red: int, green: int, blue: int):
        for color, value in [("Red", red), ("Green", green), ("Blue", blue)]:
            if not 0 <= value <= 255:
                raise ValueError(f"{color} value must be between 0 and 255")
        self.red = red
        self.green = green
        self.blue = blue

    def encode(self) -> str:
        return f"set led {self.red} {self.green} {self.blue}"


class SetSecretKey(AnovaCommand):
    def supports_ble(self) -> bool: return True

    def __init__(self, key: str):
        if len(key) != 10 or not key.islower() or not key.isalnum():
            raise ValueError("Secret key must be 10 lowercase alphanumeric characters")
        self.key = key

    def encode(self) -> str:
        return f"set number {self.key}"


class GetDate(AnovaCommand):
    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "read date"


class GetTemperatureHistory(AnovaCommand):
    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "read data"

    def decode(self, response: str) -> List[float]:
        parts = response.strip().split("read data ")
        if len(parts) != 2:
            raise ValueError(f"Invalid temperature history response: {response}")

        return [float(temp) for temp in parts[1].strip().split(" ") if temp != ""]


class SetWifiCredentials(AnovaCommand):
    def supports_ble(self) -> bool: return True

    def __init__(self, ssid: str, password: str):
        self.ssid = ssid
        self.password = password

    def encode(self) -> str:
        return f"wifi para 2 {self.ssid} {self.password} WPA2PSK AES"


class StartSmartlink(AnovaCommand):
    def supports_ble(self) -> bool: return True

    def encode(self) -> str:
        return "smartlink start"


class SetDeviceName(AnovaCommand):
    def supports_ble(self) -> bool: return True

    def __init__(self, name: str):
        self.name = name

    def encode(self) -> str:
        return f"set name {self.name}"


class SetSpeaker(AnovaCommand):
    def supports_ble(self) -> bool: return True

    def __init__(self, enable: bool):
        self.enable = enable

    def encode(self) -> str:
        return f"set speaker {'on' if self.enable else 'off'}"
