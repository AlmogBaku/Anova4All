import asyncio
from types import TracebackType
from typing import Optional, Any, Union, Type, Tuple

from bleak import BleakClient, BleakScanner
from bleak.backends.characteristic import BleakGATTCharacteristic
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData
from bleak.uuids import normalize_uuid_str

from commands import AnovaCommand

# Bluetooth Constants
ANOVA_SERVICE_UUID = "ffe0"
ANOVA_CHARACTERISTIC_UUID = "ffe1"
ANOVA_DEVICE_NAME = "Anova"

# Command Constants
MAX_COMMAND_LENGTH = 20
COMMAND_DELIMITER = "\r"


# Custom Exceptions
class AnovaException(Exception):
    """Base exception for Anova-related errors."""


class AnovaConnectionError(AnovaException):
    """Raised when there's an issue connecting to the Anova device."""


class AnovaCommandError(AnovaException):
    """Raised when there's an error executing a command."""


class AnovaBluetoothClient:
    _client: Optional[BleakClient]
    command_lock: asyncio.Lock
    device: Union[BLEDevice, str]

    def __init__(self, device: Union[BLEDevice, str]):
        self.command_lock = asyncio.Lock()
        self.device = device

    @staticmethod
    async def scan(timeout: float = 5.0) -> Tuple[Optional[BLEDevice], Optional[AdvertisementData]]:
        """
        Scan for Anova devices.

        :param timeout: Scan duration in seconds
        :return: BLEDevice and AdvertisementData of the device if found
        """
        devs = await BleakScanner.discover(timeout=timeout, return_adv=True)
        for dev, adv in devs.values():
            if adv.local_name == ANOVA_DEVICE_NAME:
                for uuid in adv.service_uuids:
                    if normalize_uuid_str(ANOVA_SERVICE_UUID) == uuid:
                        return dev, adv

        return None, None

    async def __aenter__(self) -> 'AnovaBluetoothClient':
        self._client = BleakClient(self.device)
        await self._client.connect()
        return self

    async def __aexit__(
            self,
            exc_type: Type[BaseException],
            exc_val: BaseException,
            exc_tb: TracebackType,
    ) -> None:
        if self._client:
            await self._client.disconnect()
            self._client = None

    async def send_command(self, command: Union[AnovaCommand, str], timeout: float = 5.0) -> Any:
        if isinstance(command, AnovaCommand) and not command.supports_ble():
            raise AnovaCommandError(f"Command '{command}' is not supported over BLE")
        if not self._client:
            raise AnovaConnectionError("Not connected to Anova device")

        async with self.command_lock:
            q: asyncio.Queue[bytearray] = asyncio.Queue()

            async def response_callback(sender: BleakGATTCharacteristic, data: bytearray) -> None:
                nonlocal q
                await q.put(data)

            try:
                await self._client.start_notify(normalize_uuid_str(ANOVA_CHARACTERISTIC_UUID), response_callback)
                await self._client.write_gatt_char(normalize_uuid_str(ANOVA_CHARACTERISTIC_UUID),
                                                   f"{command}\r".encode())

                response_buffer = bytearray()
                async with asyncio.timeout(timeout):
                    while chunk := await q.get():
                        response_buffer.extend(chunk)
                        if b'\r' in chunk:
                            break

                if isinstance(command, str):
                    return response_buffer.decode().strip()
                return command.decode(response_buffer.decode().strip())
            except asyncio.TimeoutError:
                raise AnovaCommandError(f"Command '{command}' timed out")
            finally:
                await self._client.stop_notify(normalize_uuid_str(ANOVA_CHARACTERISTIC_UUID))
