import asyncio
import logging
from typing import Dict, List, Callable, Coroutine, Any, Optional

from .connection import AsyncAnovaConnection
from .device import AsyncAnovaDevice
from .server import AsyncTCPServer

logger = logging.getLogger(__name__)


class AsyncAnovaManager:
    def __init__(self, host: str = "0.0.0.0", port: int = 8080):
        self.server = AsyncTCPServer(host, port)
        self.devices: Dict[str, AsyncAnovaDevice] = {}
        self.device_connected_callbacks: List[Callable[[AsyncAnovaDevice], Coroutine[Any, Any, None]]] = []
        self.device_disconnected_callbacks: List[Callable[[AsyncAnovaDevice], Coroutine[Any, Any, None]]] = []
        self.device_state_change_callbacks: List[Callable[[AsyncAnovaDevice, Any], Coroutine[Any, Any, None]]] = []
        self._monitoring_tasks: Dict[str, asyncio.Task] = {}
        self._heartbeat_interval: int = 1  # seconds

    async def start(self):
        self.server.on_connection(self._handle_new_connection)
        await self.server.start()
        logger.info(f"AsyncAnovaManager started on {self.server.host}:{self.server.port}")

    async def stop(self):
        await self.server.stop()
        await self._stop_all_monitoring_tasks()
        await self._close_all_devices()
        logger.info("AsyncAnovaManager stopped")

    async def _stop_all_monitoring_tasks(self):
        for device_id, task in self._monitoring_tasks.items():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._monitoring_tasks.clear()

    async def _close_all_devices(self):
        for device in self.devices.values():
            await device.close()
        self.devices.clear()

    def get_devices(self) -> List[AsyncAnovaDevice]:
        return list(self.devices.values())

    def get_device(self, device_id: str) -> Optional[AsyncAnovaDevice]:
        return self.devices.get(device_id)

    def on_device_connected(self, callback: Callable[[AsyncAnovaDevice], Coroutine[Any, Any, None]]):
        self.device_connected_callbacks.append(callback)

    def on_device_disconnected(self, callback: Callable[[AsyncAnovaDevice], Coroutine[Any, Any, None]]):
        self.device_disconnected_callbacks.append(callback)

    def on_device_state_change(self, callback: Callable[[AsyncAnovaDevice, Any], Coroutine[Any, Any, None]]):
        self.device_state_change_callbacks.append(callback)

    async def _handle_new_connection(self, connection: AsyncAnovaConnection):
        try:
            device = AsyncAnovaDevice(connection)
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

        except Exception as e:
            logger.error(f"Error handling new connection: {e}")
            await connection.close()
            raise

    async def _monitor_device(self, device: AsyncAnovaDevice):
        while True:
            try:
                await device.heartbeat()
                await asyncio.sleep(self._heartbeat_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error monitoring device {device.id_card}: {e}")
                await self._handle_device_disconnection(device.id_card)
                raise

    async def _handle_device_disconnection(self, device_id: str):
        if device_id in self.devices:
            device = self.devices.pop(device_id)
            logger.info(f"Device disconnected: {device}")

            if device_id in self._monitoring_tasks:
                self._monitoring_tasks[device_id].cancel()
                del self._monitoring_tasks[device_id]

            await device.close()

            for callback in self.device_disconnected_callbacks:
                await callback(device)

    async def _handle_device_state_change(self, state: Any):
        for device_id, device in self.devices.items():
            for callback in self.device_state_change_callbacks:
                await callback(device, state)

    def __str__(self):
        return f"AsyncAnovaManager(devices={len(self.devices)})"

    def __repr__(self):
        return self.__str__()
