from enum import Enum
from typing import AsyncIterator

from pydantic import BaseModel


async def event_stream(resp: AsyncIterator[BaseModel]) -> AsyncIterator[str]:
    async for event in resp:
        evnt = event.__class__.__name__
        if hasattr(event, "event_type"):
            evnt = event.event_type
            if isinstance(evnt, Enum):
                evnt = evnt.value
        yield f"event: {evnt}\ndata: {event.model_dump_json()}\n\n"
