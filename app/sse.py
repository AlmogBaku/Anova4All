import asyncio
import uuid
from typing import Dict, Optional, Union, AsyncIterator
from pydantic import BaseModel

from anova_wifi.commands import AnovaEvent
from anova_wifi.device import AnovaDevice, DeviceState


class SSEEvent(BaseModel):
    event_type: str
    device_id: Optional[str]
    payload: Optional[Union[AnovaEvent, DeviceState]]


async def event_stream(resp: AsyncIterator[BaseModel]):
    async for event in resp:
        evnt = event.__class__.__name__
        if hasattr(event, "event_type"):
            evnt = event.event_type
        yield f"event: {evnt}\ndata: {event.model_dump_json()}\n\n"


class SSEManager:
    def __init__(self, device_manager):
        self.device_manager = device_manager
        self.listeners: Dict[str, Dict[str, asyncio.Queue]] = {}

    async def connect(self, device_id: str) -> tuple[str, asyncio.Queue[SSEEvent]]:
        if device_id not in self.listeners:
            self.listeners[device_id] = {}

        listener_id = str(uuid.uuid4())
        queue = asyncio.Queue()
        self.listeners[device_id][listener_id] = queue
        return listener_id, queue

    async def disconnect(self, device_id: str, listener_id: str):
        if device_id in self.listeners and listener_id in self.listeners[device_id]:
            del self.listeners[device_id][listener_id]
            if not self.listeners[device_id]:
                del self.listeners[device_id]

    async def broadcast(self, event: SSEEvent):
        device_id = event.device_id
        if device_id in self.listeners:
            for queue in self.listeners[device_id].values():
                await queue.put(event)

    async def device_connected_callback(self, device: AnovaDevice):
        event = SSEEvent(
            device_id=device.id_card,
            event_type="device_connected",
        )
        await self.broadcast(event)

    async def device_disconnected_callback(self, device_id: str):
        event = SSEEvent(
            device_id=device_id,
            event_type="device_disconnected",
        )
        await self.broadcast(event)

    async def device_state_change_callback(self, device_id: str, state: DeviceState):
        event = SSEEvent(
            device_id=device_id,
            event_type="state_change",
            payload=state
        )
        await self.broadcast(event)

    async def device_event_callback(self, device_id: str, event: AnovaEvent):
        await self.broadcast(SSEEvent(
            device_id=device_id,
            event_type="event",
            payload=event
        ))

    def register_callbacks(self):
        self.device_manager.on_device_connected(self.device_connected_callback)
        self.device_manager.on_device_disconnected("*", self.device_disconnected_callback)
        self.device_manager.on_device_state_change("*", self.device_state_change_callback)
        self.device_manager.on_device_event("*", self.device_event_callback)