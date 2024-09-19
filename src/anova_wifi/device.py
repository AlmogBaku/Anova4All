import logging
from pydantic import BaseModel
from typing import Callable, Coroutine, Type, Optional, Any, List

from .commands import UnitType, AnovaCommand, GetIdCardCommand, VersionCommand, GetNumberCommand, StatusCommand, \
    ReadSetTempCommand, ReadTempCommand, ReadUnitCommand, ReadTimerCommand, SetTempCommand, SetTimerCommand, \
    SpeakerStatusCommand, StartCommand, StopCommand, ClearAlarmCommand, StopTimerCommand, EventType, AnovaEvent
from .connection import AnovaConnection

logger = logging.getLogger(__name__)


class DeviceState(BaseModel):
    running: bool = False
    temperature: float = 0.0
    target_temperature: float = 0.0
    timer_running: bool = False
    timer_value: int = 0
    unit: Optional[UnitType] = None
    speaker_status: bool = False


class AnovaDevice:
    id_card: Optional[str]
    version: Optional[str]
    device_number: Optional[str]
    _state_change_callbacks: List[Callable[[str, DeviceState], Coroutine[None, None, None]]] = []
    _state: DeviceState = DeviceState()

    def __init__(self, connection: AnovaConnection):
        self.connection = connection
        self.connection.set_event_callback(self.handle_event)

    @property
    def state(self) -> DeviceState:
        return self._state

    def set_state_change_callback(self, callback: Callable[[str, DeviceState], Coroutine[None, None, None]]) -> None:
        self._state_change_callbacks.append(callback)

    async def perform_handshake(self) -> None:
        try:
            id_card_response = await self.send_command(GetIdCardCommand)
            self.id_card = id_card_response.id_card

            version_response = await self.send_command(VersionCommand)
            self.version = version_response.version

            number_response = await self.send_command(GetNumberCommand)
            self.device_number = number_response.number

            try:
                await self.get_status()
            except Exception as e:
                logger.warning(f"Failed to get initial status: {e}")
                raise

            logger.info(f"Handshake completed for device {self.id_card}")
        except Exception as e:
            logger.error(f"Critical error during handshake: {e}")
            raise

    async def heartbeat(self) -> None:
        try:
            await self.get_status()
            await self.get_set_temperature()
            await self.get_current_temperature()
            await self.get_unit()
            await self.get_timer()
            await self.get_speaker_status()
        except ConnectionResetError as e:
            logger.error(f"Connection reset during heartbeat: {e}")
        except Exception as e:
            logger.error(f"Error during heartbeat: {e}")
            raise

    async def send_command(self, command_class: Type[AnovaCommand], *args: Any, **kwargs: Any) -> Any:
        command = await command_class.execute(*args, **kwargs)
        logger.info(f"Sending command: {command}")
        response_data = await self.connection.send_command(command)
        logger.info(f"Received response: {response_data}")
        response = command_class.parse_response(response_data)
        await self._update_state(command_class, response)
        return response

    async def handle_event(self, event: str) -> None:
        parsed_event = AnovaEvent.parse_event(event)
        await self._update_state_from_event(parsed_event)
        await self._notify_state_change()

    async def _update_state_from_event(self, event: AnovaEvent) -> None:
        if event.type == EventType.TEMP_REACHED:
            self.state.temperature = self.state.target_temperature
        elif event.type == EventType.LOW_WATER:
            self.state.running = False
        elif event.type == EventType.STOP:
            self.state.running = False
        elif event.type == EventType.START:
            self.state.running = True
        elif event.type == EventType.TIME_START:
            self.state.timer_running = True
        elif event.type == EventType.TIME_STOP:
            self.state.timer_running = False

    async def get_id_card(self) -> GetIdCardCommand:
        return await self.send_command(GetIdCardCommand)

    async def get_version(self) -> VersionCommand:
        return await self.send_command(VersionCommand)

    async def get_device_number(self) -> GetNumberCommand:
        return await self.send_command(GetNumberCommand)

    async def get_status(self) -> StatusCommand:
        return await self.send_command(StatusCommand)

    async def get_set_temperature(self) -> ReadSetTempCommand:
        return await self.send_command(ReadSetTempCommand)

    async def get_current_temperature(self) -> ReadTempCommand:
        return await self.send_command(ReadTempCommand)

    async def set_temperature(self, temperature: float) -> SetTempCommand:
        return await self.send_command(SetTempCommand, temperature)

    async def get_unit(self) -> ReadUnitCommand:
        return await self.send_command(ReadUnitCommand)

    async def get_timer(self) -> ReadTimerCommand:
        return await self.send_command(ReadTimerCommand)

    async def set_timer(self, minutes: int) -> SetTimerCommand:
        return await self.send_command(SetTimerCommand, minutes)

    async def stop_timer(self) -> StopTimerCommand:
        return await self.send_command(StopTimerCommand)

    async def get_speaker_status(self) -> SpeakerStatusCommand:
        return await self.send_command(SpeakerStatusCommand)

    async def start_cooking(self) -> StartCommand:
        return await self.send_command(StartCommand)

    async def stop_cooking(self) -> StopCommand:
        return await self.send_command(StopCommand)

    async def clear_alarm(self) -> ClearAlarmCommand:
        return await self.send_command(ClearAlarmCommand)

    async def _update_state(self, command_class: Type[AnovaCommand], response: Any) -> None:
        if isinstance(response, StatusCommand):
            self._state.running = response.running
            self._state.temperature = response.temperature
            self._state.unit = response.unit
        elif isinstance(response, ReadTempCommand):
            self._state.temperature = response.temperature
        elif isinstance(response, (SetTempCommand, ReadSetTempCommand)):
            self._state.target_temperature = response.temperature
        elif isinstance(response, ReadUnitCommand):
            self._state.unit = response.unit
        elif isinstance(response, (ReadTimerCommand, SetTimerCommand)):
            self._state.timer_value = response.minutes
        elif isinstance(response, SpeakerStatusCommand):
            self._state.speaker_status = response.is_on

    async def _notify_state_change(self) -> None:
        for callback in self._state_change_callbacks:
            if self.id_card is None:
                logger.warning("Device ID is None when notifying state change")
                return
            await callback(self.id_card, self.state)

    async def close(self) -> None:
        await self.connection.close()