import asyncio
import logging
from typing import Optional, Callable, Coroutine

from .encoding import Encoder

logger = logging.getLogger(__name__)


class AnovaConnection:
    response_future: Optional[asyncio.Future[str]] = None
    event_callback: Optional[Callable[[str], Coroutine[None, None, None]]] = None

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader = reader
        self.writer = writer

    async def send_command(self, message: str) -> str:
        encoded = Encoder.encode(message)
        self.writer.write(encoded)
        self.writer.write(b'\x16')
        await self.writer.drain()
        logger.info(f"Sent message: {message}")

        self.response_future = asyncio.Future()
        try:
            # Wait for up to 1 second
            return await asyncio.wait_for(self.response_future, timeout=1.5)
        except asyncio.TimeoutError:
            logger.warning(f"No response received within timeout for command: {message}")
            # Continue waiting for the response
            return await self.response_future
        finally:
            self.response_future = None

    async def receive(self) -> str:
        while True:
            data = await self.reader.read(1024)
            if not data:
                logger.error("Connection closed by remote host")
                raise ConnectionResetError("Connection closed by remote host")

            msg = Encoder.decode(data)
            logger.info(f"Received message: {msg}")

            if "invalid command" in msg.lower():
                logger.error(f"Received invalid command, skipping: {msg}")
                continue

            if self.is_event(msg):
                if self.event_callback:
                    await self.event_callback(msg)
            elif self.response_future and not self.response_future.done():
                self.response_future.set_result(msg)
                return msg
            else:
                logger.warning(f"Received unexpected message: {msg}")

    @staticmethod
    def is_event(message: str) -> bool:
        return message.startswith("event")

    def set_event_callback(self, callback: Callable[[str], Coroutine[None, None, None]]) -> None:
        self.event_callback = callback

    async def close(self) -> None:
        self.writer.close()
        await self.writer.wait_closed()
        logger.info("Connection closed")
