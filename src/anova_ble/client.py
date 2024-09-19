import asyncio
from typing import Optional, List, Any

from bleak import BleakScanner, BleakClient # type: ignore
from bleak.backends.characteristic import BleakGATTCharacteristic # type: ignore
from bleak.backends.device import BLEDevice # type: ignore
from bleak.exc import BleakError # type: ignore

from .cmds import StartDevice, StopDevice, GetDeviceStatus, StartTimer, StopTimer, GetTimerStatus, GetTemperatureUnit, \
    GetDeviceInformation, SetCalibrationFactor, SetServerInfo, SetLED, SetSecretKey, SetTargetTemperature, SetTimer, \
    SetTemperatureUnit, GetCurrentTemperature, GetTargetTemperature, ReadCalibrationFactor, ClearAlarm, GetDate, \
    GetTemperatureHistory, SetWifiCredentials, StartSmartlink, SetDeviceName, TurnOffSpeaker, GetVersion, Command
from .types import (
    ANOVA_CHARACTERISTIC_UUID,
    ANOVA_DEVICE_NAME,
    TemperatureValue,
    TimerValue,
    TemperatureUnit,
    DeviceStatus,
    TimerStatus,
    AnovaConnectionError,
    AnovaCommandError,
)


class AnovaBluetoothClient:
    client: Optional[BleakClient]
    characteristic: Optional[BleakGATTCharacteristic]
    command_lock: asyncio.Lock

    @staticmethod
    async def scan(timeout: float = 5.0) -> List[BLEDevice]:
        """
        Scan for Anova devices.

        :param timeout: Scan duration in seconds
        :return: List of discovered Anova devices
        """
        devices = await BleakScanner.discover(timeout=timeout)
        return [d for d in devices if d.name == ANOVA_DEVICE_NAME]

    async def connect(self, device: BLEDevice) -> None:
        """
        Connect to a specific Anova device.

        :param device: BLEDevice to connect to
        :raises AnovaConnectionError: If connection fails
        """
        try:
            self.client = BleakClient(device)
            await self.client.connect()
            self.characteristic = await self.client.get_characteristic(ANOVA_CHARACTERISTIC_UUID)
        except BleakError as e:
            raise AnovaConnectionError(f"Failed to connect to device {device.address}: {str(e)}")
        except ValueError:
            raise AnovaConnectionError(f"Characteristic {ANOVA_CHARACTERISTIC_UUID} not found")

    async def disconnect(self) -> None:
        if self.client and self.client.is_connected:
            await self.client.disconnect()
        self.client = None
        self.characteristic = None

    async def send_command(self, command: Command, timeout: float = 5.0) -> Any:
        if not self.client or not self.characteristic:
            raise AnovaConnectionError("Not connected to Anova device")

        async with self.command_lock:
            response_future: asyncio.Future[str] = asyncio.Future()

            def response_callback(sender: int, data: bytearray) -> None:
                nonlocal response_future
                response = data.decode('utf-8')
                if '\r' in response:
                    response_future.set_result(response.strip())

            try:
                await self.client.start_notify(self.characteristic, response_callback)
                await self.client.write_gatt_char(self.characteristic, f"{command.encode()}\r".encode('utf-8'))
                response = await asyncio.wait_for(response_future, timeout)
                return command.decode(response)
            except asyncio.TimeoutError:
                raise AnovaCommandError(f"Command '{command.encode()}' timed out")
            finally:
                await self.client.stop_notify(self.characteristic)

    async def set_calibration_factor(self, factor: float = 0.0) -> str:
        return await self.send_command(SetCalibrationFactor(factor))

    async def set_server_info(self, server_ip: str = "pc.anovaculinary.com", port: int = 8080) -> str:
        return await self.send_command(SetServerInfo(server_ip, port))

    async def set_led(self, red: int, green: int, blue: int) -> str:
        return await self.send_command(SetLED(red, green, blue))

    async def set_secret_key(self, key: str) -> str:
        return await self.send_command(SetSecretKey(key))

    async def set_target_temperature(self, temperature: TemperatureValue, unit: TemperatureUnit) -> str:
        return await self.send_command(SetTargetTemperature(temperature, unit))

    async def set_timer(self, minutes: TimerValue) -> str:
        return await self.send_command(SetTimer(minutes))

    async def set_temperature_unit(self, unit: TemperatureUnit) -> str:
        return await self.send_command(SetTemperatureUnit(unit))

    async def get_target_temperature(self) -> TemperatureValue:
        return await self.send_command(GetTargetTemperature())

    async def get_current_temperature(self) -> TemperatureValue:
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
