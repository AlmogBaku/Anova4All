import asyncio
import logging
from typing import Dict, List, Callable, Coroutine, Any, Optional

from .connection import AnovaConnection
from .device import AnovaDevice, DeviceState
from .event import AnovaEvent
from .server import AnovaServer

logger = logging.getLogger(__name__)

HEARTBEAT_INTERVAL = 3  # seconds


class AnovaManager:
    server: AnovaServer
    devices: Dict[str, AnovaDevice] = {}
    _monitoring_tasks: Dict[str, asyncio.Task[None]] = {}

    device_connected_callbacks: List[Optional[Callable[[AnovaDevice], Coroutine[None, None, None]]]] = []
    device_disconnected_callbacks: Dict[str, Optional[Callable[[str], Coroutine[None, None, None]]]] = {}
    device_state_change_callbacks: Dict[str, Optional[Callable[[str, DeviceState], Coroutine[None, None, None]]]] = {}
    device_event_callbacks: Dict[str, Optional[Callable[[str, AnovaEvent], Coroutine[None, None, None]]]] = {}

    def __init__(self, host: str = "0.0.0.0", port: int = 8080):
        self.server = AnovaServer(host, port)

    async def start(self) -> None:
        """
        Start the AnovaManager
        :return:
        """
        self.server.on_connection(self._handle_new_connection)
        await self.server.start()
        logger.info(f"AsyncAnovaManager started on {self.server.host}:{self.server.port}")

    async def stop(self) -> None:
        """
        Stop the AnovaManager and close all devices
        :return:
        """
        await self._stop_all_monitoring_tasks()
        await self._close_all_devices()
        await self.server.stop()

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
        """
        Get a list of all connected devices
        :return: List of AnovaDevice objects
        """
        return list(self.devices.values())

    def get_device(self, device_id: str) -> Optional[AnovaDevice]:
        """
        Get a device by its ID
        :param device_id: The device ID
        :return: AnovaDevice object or None if not found
        """
        return self.devices.get(device_id)

    def on_device_connected(self, callback: Callable[[AnovaDevice], Coroutine[Any, Any, None]]) -> int:
        """
        Register a callback for when a new device is connected
        :param callback: The callback function of the form `async def callback(device: AnovaDevice)`
        :return: The callback ID
        """
        self.device_connected_callbacks.append(callback)
        return len(self.device_connected_callbacks) - 1

    def remove_device_connected_callback(self, callback_id: int) -> None:
        """
        Remove a device connected callback
        :param callback_id: The callback ID returned by `on_device_connected`
        :return: None
        """
        self.device_connected_callbacks[callback_id] = None

    def on_device_disconnected(self, device_id: str, callback: Callable[[str], Coroutine[Any, Any, None]]) -> None:
        """
        Register a callback for when a device is disconnected
        :param device_id: The device ID (use "*" for all devices)
        :param callback: The callback function of the form `async def callback(device_id: str)`
        :return:
        """
        self.device_disconnected_callbacks[device_id] = callback

    def remove_device_disconnected_callback(self, device_id: str) -> None:
        """
        Remove a device disconnected callback
        :param device_id:
        :return:
        """
        self.device_disconnected_callbacks[device_id] = None

    def on_device_state_change(self, device_id: str,
                               callback: Callable[[str, DeviceState], Coroutine[Any, Any, None]]) -> None:
        """
        Register a callback for when a device's state changes
        :param device_id: The device ID (use "*" for all devices)
        :param callback: The callback function of the form `async def callback(device_id: str, state: DeviceState)`
        :return:
        """
        self.device_state_change_callbacks[device_id] = callback

    def remove_device_state_change_callback(self, device_id: str) -> None:
        """
        Remove a device state change callback
        :param device_id: The device ID (use "*" for all devices)
        :return:
        """
        self.device_state_change_callbacks[device_id] = None

    def on_device_event(self, device_id: str, callback: Callable[[str, AnovaEvent], Coroutine[Any, Any, None]]) -> None:
        """
        Register a callback for when a device sends an event
        :param device_id: The device ID (use "*" for all devices)
        :param callback: The callback function of the form `async def callback(device_id: str, event: AnovaEvent)`
        :return:
        """
        self.device_event_callbacks[device_id] = callback

    def remove_device_event_callback(self, device_id: str) -> None:
        """
        Remove a device event callback
        :param device_id: The device ID (use "*" for all devices)
        :return:
        """
        self.device_event_callbacks[device_id] = None

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
        device.add_state_change_callback(self._handle_device_state_change)
        device.add_event_callback(self._handle_device_event)

        self._monitoring_tasks[device_id] = asyncio.create_task(self._monitor_device(device))

        logger.info(f"New device connected: {device}")

        for callback in self.device_connected_callbacks:
            if callback:
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
            await self._handle_callback(device_id, self.device_disconnected_callbacks, device_id)

            if device_id in self.device_disconnected_callbacks:
                del self.device_disconnected_callbacks[device_id]
            if device_id in self.device_state_change_callbacks:
                del self.device_state_change_callbacks[device_id]
            if device_id in self.device_event_callbacks:
                del self.device_event_callbacks[device_id]

    async def _handle_device_state_change(self, device_id: str, state: DeviceState) -> None:
        await self._handle_callback(device_id, self.device_state_change_callbacks, device_id, state)

    async def _handle_device_event(self, device_id: str, event: AnovaEvent) -> None:
        await self._handle_callback(device_id, self.device_event_callbacks, device_id, event)

    @staticmethod
    async def _handle_callback(device_id: str, callback_dict: Dict[str, Optional[Callable]], *args,  # type: ignore
                               **kwargs) -> None:
        if "*" in callback_dict:
            cb = callback_dict["*"]
            if cb:
                await cb(*args, **kwargs)
        if device_id in callback_dict:
            cb = callback_dict[device_id]
            if cb:
                await cb(*args, **kwargs)
