from typing import AsyncIterator

from pydantic import BaseModel


async def event_stream(resp: AsyncIterator[BaseModel]):
    async for event in resp:
        evnt = event.__class__.__name__
        if hasattr(event, "event_type"):
            evnt = event.event_type
        yield f"event: {evnt}\ndata: {event.model_dump_json()}\n\n"
