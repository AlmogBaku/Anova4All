import asyncio
import uuid
from typing import Dict, AsyncIterator

from pydantic import BaseModel

from anova_wifi.device import AnovaDevice, DeviceState
from anova_wifi.event import AnovaEvent
from anova_wifi.manager import AnovaManager
from .models import SSEEvent, SSEEventType


async def event_stream(resp: AsyncIterator[BaseModel]) -> AsyncIterator[str]:
    async for event in resp:
        evnt = event.__class__.__name__
        if hasattr(event, "event_type"):
            evnt = event.event_type
        yield f"event: {evnt}\ndata: {event.model_dump_json()}\n\n"


class SSEManager:
    _listeners: Dict[str, Dict[str, asyncio.Queue[SSEEvent]]] = {}

    def __init__(self, device_manager: AnovaManager):
        self.device_manager = device_manager

    async def connect(self, device_id: str) -> tuple[str, asyncio.Queue[SSEEvent]]:
        if device_id not in self._listeners:
            self._listeners[device_id] = {}

        listener_id = str(uuid.uuid4())
        queue: asyncio.Queue[SSEEvent] = asyncio.Queue()
        self._listeners[device_id][listener_id] = queue
        return listener_id, queue

    async def disconnect(self, device_id: str, listener_id: str) -> None:
        if device_id in self._listeners and listener_id in self._listeners[device_id]:
            del self._listeners[device_id][listener_id]
            if not self._listeners[device_id]:
                del self._listeners[device_id]

    async def broadcast(self, event: SSEEvent) -> None:
        device_id = event.device_id
        if device_id in self._listeners:
            for queue in self._listeners[device_id].values():
                await queue.put(event)

    async def device_connected_callback(self, device: AnovaDevice) -> None:
        event = SSEEvent(
            device_id=device.id_card,
            event_type=SSEEventType.device_connected,
        )
        await self.broadcast(event)

    async def device_disconnected_callback(self, device_id: str) -> None:
        event = SSEEvent(
            device_id=device_id,
            event_type=SSEEventType.device_disconnected,
        )
        await self.broadcast(event)

    async def device_state_change_callback(self, device_id: str, state: DeviceState) -> None:
        event = SSEEvent(
            device_id=device_id,
            event_type=SSEEventType.state_changed,
            payload=state
        )
        await self.broadcast(event)

    async def device_event_callback(self, device_id: str, event: AnovaEvent) -> None:
        await self.broadcast(SSEEvent(
            device_id=device_id,
            event_type=SSEEventType.event,
            payload=event
        ))

    def register_callbacks(self) -> None:
        self.device_manager.on_device_connected(self.device_connected_callback)
        self.device_manager.on_device_disconnected("*", self.device_disconnected_callback)
        self.device_manager.on_device_state_change("*", self.device_state_change_callback)
        self.device_manager.on_device_event("*", self.device_event_callback)
