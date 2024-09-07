import logging
from typing import Callable, Coroutine, List, Optional, Type

from .commands import *
from .connection import AsyncAnovaConnection

logger = logging.getLogger(__name__)


class DeviceState(BaseModel):
    running: bool = False
    temperature: float = 0.0
    target_temperature: float = 0.0
    timer_running: bool = False
    timer_value: int = 0
    unit: str = 'C'
    speaker_status: bool = False


class AsyncAnovaDevice:
    id_card: Optional[str]
    version: Optional[str]
    device_number: Optional[str]
    state: DeviceState

    def __init__(self, connection: AsyncAnovaConnection):
        self.connection = connection
        self._state_change_callbacks: List[Callable[[DeviceState], Coroutine[Any, Any, None]]] = []
        self.state = DeviceState()

    def set_state_change_callback(self, callback: Callable[[DeviceState], Coroutine[Any, Any, None]]):
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

    async def heartbeat(self):
        try:
            await self.get_status()
            await self.get_set_temperature()
            await self.get_current_temperature()
            await self.get_unit()
            await self.get_timer()
            await self.get_speaker_status()
        except Exception as e:
            logger.error(f"Error during heartbeat: {e}")
            raise

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

    async def send_command(self, command_class: Type[AnovaCommand], *args, **kwargs) -> Any:
        command = await command_class.execute(*args, **kwargs)
        logger.info(f"Sending command: {command}")
        await self.connection.send(command)
        response_data = await self.connection.receive()
        logger.info(f"Received response: {response_data}")
        response = command_class.parse_response(response_data)
        await self._update_state(command_class, response)
        await self._notify_state_change()
        return response

    async def _update_state(self, command_class: Type[AnovaCommand], response: Any):
        if isinstance(response, StatusCommand):
            self.state.running = response.running
            self.state.temperature = response.temperature
            self.state.target_temperature = response.target_temperature
            self.state.timer_running = response.timer_running
            self.state.timer_value = response.timer_value
        elif isinstance(response, ReadTempCommand):
            self.state.temperature = response.temperature
        elif isinstance(response, (SetTempCommand, ReadSetTempCommand)):
            self.state.target_temperature = response.temperature
        elif isinstance(response, ReadUnitCommand):
            self.state.unit = response.unit
        elif isinstance(response, (ReadTimerCommand, SetTimerCommand)):
            self.state.timer_value = response.minutes
        elif isinstance(response, SpeakerStatusCommand):
            self.state.speaker_status = response.is_on

    async def _notify_state_change(self):
        for callback in self._state_change_callbacks:
            await callback(self.state)

    async def close(self):
        await self.connection.close()

    def __str__(self):
        return f"AsyncAnovaDevice(id_card={self.id_card}, version={self.version}, device_number={self.device_number})"

    def __repr__(self):
        return self.__str__()
