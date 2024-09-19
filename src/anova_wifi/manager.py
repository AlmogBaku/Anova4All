import asyncio
import logging
from typing import Dict, List, Callable, Coroutine, Any, Optional

from .connection import AnovaConnection
from .device import AnovaDevice, DeviceState
from .server import AsyncTCPServer

logger = logging.getLogger(__name__)

HEARTBEAT_INTERVAL = 1  # seconds


class AnovaManager:
    server: AsyncTCPServer
    devices: Dict[str, AnovaDevice] = {}
    _monitoring_tasks: Dict[str, asyncio.Task[None]] = {}

    device_connected_callbacks: List[Callable[[AnovaDevice], Coroutine[None, None, None]]] = []
    device_disconnected_callbacks: Dict[str, Callable[[str], Coroutine[None, None, None]]] = {}
    device_state_change_callbacks: Dict[str, Callable[[str, DeviceState], Coroutine[None, None, None]]] = {}

    def __init__(self, host: str = "0.0.0.0", port: int = 8080):
        self.server = AsyncTCPServer(host, port)

    async def start(self) -> None:
        self.server.on_connection(self._handle_new_connection)
        await self.server.start()
        logger.info(f"AsyncAnovaManager started on {self.server.host}:{self.server.port}")

    async def stop(self) -> None:
        await self.server.stop()
        await self._stop_all_monitoring_tasks()
        await self._close_all_devices()
        logger.info("AsyncAnovaManager stopped")

    async def _stop_all_monitoring_tasks(self) -> None:
        for device_id, task in self._monitoring_tasks.items():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._monitoring_tasks.clear()

    async def _close_all_devices(self) -> None:
        for device in self.devices.values():
            await device.close()
        self.devices.clear()

    def get_devices(self) -> List[AnovaDevice]:
        return list(self.devices.values())

    def get_device(self, device_id: str) -> Optional[AnovaDevice]:
        return self.devices.get(device_id)

    def on_device_connected(self, callback: Callable[[AnovaDevice], Coroutine[Any, Any, None]]) -> None:
        self.device_connected_callbacks.append(callback)

    def on_device_disconnected(self, device_id: str, callback: Callable[[str], Coroutine[Any, Any, None]]) -> None:
        self.device_disconnected_callbacks[device_id] = callback

    def on_device_state_change(self, device_id: str, callback: Callable[[str, DeviceState], Coroutine[Any, Any, None]]) -> None:
        self.device_state_change_callbacks[device_id] = callback

    async def _handle_new_connection(self, connection: AnovaConnection) -> None:
        device = AnovaDevice(connection)
        await device.perform_handshake()

        device_id = device.id_card
        if device_id is None:
            raise ValueError("Device ID is None after handshake")

        if device_id in self.devices:
            logger.warning(f"Device with ID {device_id} is already connected. Closing old connection.")
            await self._handle_device_disconnection(device_id)

        self.devices[device_id] = device
        device.set_state_change_callback(self._handle_device_state_change)

        self._monitoring_tasks[device_id] = asyncio.create_task(self._monitor_device(device))

        logger.info(f"New device connected: {device}")

        for callback in self.device_connected_callbacks:
            await callback(device)

    async def _monitor_device(self, device: AnovaDevice) -> None:
        while True:
            try:
                await device.heartbeat()
                await asyncio.sleep(HEARTBEAT_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                if device.id_card is None:
                    logger.error(f"Device ID is None, closing connection: {e}")
                    await device.close()
                    break
                logger.error(f"Error monitoring device {device.id_card}: {e}")
                await self._handle_device_disconnection(device.id_card)
                raise

    async def _handle_device_disconnection(self, device_id: str) -> None:
        if device_id in self.devices:
            device = self.devices.pop(device_id)
            logger.info(f"Device disconnected: {device}")

            if device_id in self._monitoring_tasks:
                self._monitoring_tasks[device_id].cancel()
                del self._monitoring_tasks[device_id]

            await device.close()

            if device_id in self.device_disconnected_callbacks:
                await self.device_disconnected_callbacks[device_id](device_id)

    async def _handle_device_state_change(self, device_id: str, state: DeviceState) -> None:
        if device_id in self.device_state_change_callbacks:
            await self.device_state_change_callbacks[device_id](device_id, state)