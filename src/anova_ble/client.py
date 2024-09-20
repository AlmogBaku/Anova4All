import asyncio
from types import TracebackType
from typing import Optional, Any, Union, Type, Tuple

from bleak import BleakScanner, BleakClient, BLEDevice, AdvertisementData, normalize_uuid_str, \
    BleakGATTCharacteristic  # type: ignore

from .cmds import StartDevice, StopDevice, GetDeviceStatus, StartTimer, StopTimer, GetTimerStatus, GetTemperatureUnit, \
    GetDeviceInformation, SetCalibrationFactor, SetServerInfo, SetLED, SetSecretKey, SetTargetTemperature, SetTimer, \
    SetTemperatureUnit, GetCurrentTemperature, GetTargetTemperature, ReadCalibrationFactor, ClearAlarm, GetDate, \
    GetTemperatureHistory, SetWifiCredentials, StartSmartlink, SetDeviceName, TurnOffSpeaker, GetVersion, Command, \
    ANOVA_SERVICE_UUID, ANOVA_CHARACTERISTIC_UUID, ANOVA_DEVICE_NAME, TemperatureUnit, DeviceStatus, TimerStatus, \
    AnovaConnectionError, AnovaCommandError


class AnovaBluetoothClient:
    _client: BleakClient
    command_lock: asyncio.Lock
    device: Union[BLEDevice, str]

    def __init__(self, device: Union[BLEDevice, str] = None):
        self.command_lock = asyncio.Lock()
        self.device = device

    @staticmethod
    async def scan(timeout: float = 5.0) -> Optional[Tuple[BLEDevice, AdvertisementData]]:
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

    async def send_command(self, command: Union[Command, str], timeout: float = 20.0) -> Any:
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

    async def set_calibration_factor(self, factor: float = 0.0) -> str:
        return await self.send_command(SetCalibrationFactor(factor))

    async def set_server_info(self, server_ip: str = "pc.anovaculinary.com", port: int = 8080) -> str:
        return await self.send_command(SetServerInfo(server_ip, port))

    async def set_led(self, red: int, green: int, blue: int) -> str:
        return await self.send_command(SetLED(red, green, blue))

    async def set_secret_key(self, key: str) -> str:
        return await self.send_command(SetSecretKey(key))

    async def set_target_temperature(self, temperature: float, unit: TemperatureUnit) -> str:
        return await self.send_command(SetTargetTemperature(temperature, unit))

    async def set_timer(self, minutes: int) -> str:
        return await self.send_command(SetTimer(minutes))

    async def set_temperature_unit(self, unit: TemperatureUnit) -> str:
        return await self.send_command(SetTemperatureUnit(unit))

    async def get_target_temperature(self) -> float:
        return await self.send_command(GetTargetTemperature())

    async def get_current_temperature(self) -> float:
        return await self.send_command(GetCurrentTemperature())

    async def start_device(self) -> str:
        return await self.send_command(StartDevice())

    async def stop_device(self) -> str:
        return await self.send_command(StopDevice())

    async def get_device_status(self) -> DeviceStatus:
        return await self.send_command(GetDeviceStatus())

    async def start_timer(self) -> str:
        return await self.send_command(StartTimer())

    async def stop_timer(self) -> str:
        return await self.send_command(StopTimer())

    async def get_timer_status(self) -> TimerStatus:
        return await self.send_command(GetTimerStatus())

    async def get_temperature_unit(self) -> TemperatureUnit:
        return await self.send_command(GetTemperatureUnit())

    async def get_device_information(self) -> str:
        return await self.send_command(GetDeviceInformation())

    async def read_calibration_factor(self) -> float:
        return await self.send_command(ReadCalibrationFactor())

    async def clear_alarm(self) -> str:
        return await self.send_command(ClearAlarm())

    async def get_date(self) -> str:
        return await self.send_command(GetDate())

    async def get_temperature_history(self) -> str:
        return await self.send_command(GetTemperatureHistory())

    async def set_wifi_credentials(self, ssid: str, password: str) -> str:
        return await self.send_command(SetWifiCredentials(ssid, password))

    async def start_smartlink(self) -> str:
        return await self.send_command(StartSmartlink())

    async def set_device_name(self, name: str) -> str:
        return await self.send_command(SetDeviceName(name))

    async def turn_off_speaker(self) -> str:
        return await self.send_command(TurnOffSpeaker())

    async def get_version(self) -> str:
        return await self.send_command(GetVersion())
