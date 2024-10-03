import logging
from typing import Callable, Coroutine, Type, Optional, Any

from pydantic import BaseModel

from commands import (
    AnovaCommand,
    GetIDCard,
    GetVersion,
    GetSecretKey,
    GetDeviceStatus,
    GetCurrentTemperature,
    GetTargetTemperature,
    SetTargetTemperature,
    GetTemperatureUnit,
    GetTimerStatus,
    SetTimer,
    GetSpeakerStatus,
    TemperatureUnit,
    SetTemperatureUnit,
    StartDevice,
    StopDevice,
    DeviceStatus,
)
from .connection import AnovaConnection
from .event import AnovaEvent, EventType

logger = logging.getLogger(__name__)


class DeviceState(BaseModel):
    status: DeviceStatus = DeviceStatus.STOPPED
    current_temperature: float = 0.0
    target_temperature: float = 0.0
    timer_running: bool = False
    timer_value: int = 0
    unit: Optional[TemperatureUnit] = None
    speaker_status: bool = False


class AnovaDevice:
    id_card: Optional[str]
    version: Optional[str]
    secret_key: Optional[str]
    _state_change_callback: Optional[Callable[[str, DeviceState], Coroutine[None, None, None]]]
    _state: DeviceState = DeviceState()
    _event_callback: Optional[Callable[[str, AnovaEvent], Coroutine[None, None, None]]]

    def __init__(self, connection: AnovaConnection):
        self.connection = connection
        self.connection.set_event_callback(self.handle_event)

    @property
    def state(self) -> DeviceState:
        return self._state

    def add_state_change_callback(self, callback: Callable[[str, DeviceState], Coroutine[None, None, None]]) -> None:
        self._state_change_callback = callback

    def remove_state_change_callback(self) -> None:
        self._state_change_callback = None

    def add_event_callback(self, callback: Callable[[str, AnovaEvent], Coroutine[None, None, None]]) -> None:
        self._event_callback = callback

    def remove_event_callback(self) -> None:
        self._event_callback = None

    async def perform_handshake(self) -> None:
        try:
            self.id_card = await self.send_command(GetIDCard())
            self.version = await self.send_command(GetVersion())
            self.secret_key = await self.send_command(GetSecretKey())

            try:
                await self.send_command(GetDeviceStatus())
            except Exception as e:
                logger.warning(f"Failed to get initial status: {repr(e)}")
                raise

            logger.info(f"Handshake completed for device {self.id_card}")
        except Exception as e:
            logger.error(f"Critical error during handshake: {repr(e)}")
            raise

    async def heartbeat(self) -> None:
        logger.debug("❤️Heartbeat -- start")
        try:
            await self.send_command(GetDeviceStatus())
            await self.send_command(GetTargetTemperature())
            await self.send_command(GetCurrentTemperature())
            await self.send_command(GetTemperatureUnit())
            await self.send_command(GetTimerStatus())
            await self.send_command(GetSpeakerStatus())
        except ConnectionResetError as e:
            logger.error(f"Connection reset during heartbeat: {repr(e)}")
        except Exception as e:
            logger.error(f"Error during heartbeat: {repr(e)}")
            raise
        logger.debug("❤️Heartbeat -- end")

    async def send_command(self, command: AnovaCommand) -> Any:
        if not command.supports_wifi():
            raise ValueError(f"Command {command} does not support WiFi")

        response_data = await self.connection.send_command(command.encode())
        response = command.decode(response_data)
        await self._update_state(type(command), response)
        return response

    async def handle_event(self, event: AnovaEvent) -> None:
        await self._update_state_from_event(event)
        await self._notify_state_change()
        if self.id_card is None:
            logger.warning("Device ID is None when notifying state change")
            return
        if self._event_callback is not None:
            await self._event_callback(self.id_card, event)

    async def _update_state_from_event(self, event: AnovaEvent) -> None:
        if event.type == EventType.TEMP_REACHED:
            self.state.current_temperature = self.state.target_temperature
        elif event.type == EventType.LOW_WATER:
            self.state.status = DeviceStatus.LOW_WATER
        elif event.type == EventType.STOP:
            self.state.status = DeviceStatus.STOPPED
        elif event.type == EventType.START:
            self.state.status = DeviceStatus.RUNNING
        elif event.type == EventType.TIME_START:
            self.state.timer_running = True
        elif event.type == EventType.TIME_STOP:
            self.state.timer_running = False
        elif event.type == EventType.TIME_FINISH:
            self.state.timer_running = False

    async def get_id_card(self) -> str:
        return await self.send_command(GetIDCard())

    async def _update_state(self, command_class: Type[AnovaCommand], response: Any) -> None:
        if command_class == GetDeviceStatus:
            self._state.status = response
        elif command_class == GetCurrentTemperature:
            self._state.current_temperature = response
        elif command_class in (GetTargetTemperature, SetTargetTemperature):
            self._state.target_temperature = response
        elif command_class in (SetTemperatureUnit, GetTemperatureUnit):
            self._state.unit = response
        elif command_class == GetTimerStatus:
            self._state.timer_value, self._state.timer_running = response
        elif command_class == SetTimer:
            self._state.timer_value = response
        elif command_class == GetSpeakerStatus:
            self._state.speaker_status = response

    async def _notify_state_change(self) -> None:
        if self.id_card is None:
            logger.warning("Device ID is None when notifying state change")
            return
        if self._state_change_callback is not None:
            await self._state_change_callback(self.id_card, self.state)

    async def close(self) -> None:
        await self.connection.close()

    async def start_cooking(self) -> bool:
        return await self.send_command(StartDevice())

    async def stop_cooking(self) -> bool:
        return await self.send_command(StopDevice())

    def __repr__(self) -> str:
        return f"<AnovaDevice id_card={self.id_card} version={self.version} device_number={self.secret_key}>"
