import asyncio
import logging
from typing import Optional, Callable, Coroutine

from .encoding import Encoder

logger = logging.getLogger(__name__)


class AnovaConnection:
    response_future: Optional[asyncio.Future[str]] = None
    event_callback: Optional[Callable[[str], Coroutine[None, None, None]]] = None
    listen_task: Optional[asyncio.Task] = None

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
            return await asyncio.wait_for(self.response_future, timeout=5)
        except asyncio.TimeoutError:
            logger.warning(f"No response received within timeout for command: {message}")
            # Continue waiting for the response
            return await self.response_future
        finally:
            self.response_future = None

    def start_listening(self):
        if not self.listen_task:
            self.listen_task = asyncio.create_task(self._listen())

    async def _listen(self):
        try:
            while True:
                await self.receive()
        except ConnectionResetError:
            logger.info("Connection closed by remote host")
        except asyncio.CancelledError:
            logger.info("Listening task cancelled")
        except Exception as e:
            logger.error(f"Error in listening task: {e}")

    async def receive(self) -> str:
        data = await self.reader.read(1024)
        if not data:
            logger.error("Connection closed by remote host")
            raise ConnectionResetError("Connection closed by remote host")

        msg = Encoder.decode(data)
        logger.info(f"Received message: {msg}")

        if "invalid command" in msg.lower():
            logger.error(f"Received invalid command, skipping: {msg}")
            return

        if self.is_event(msg):
            if self.event_callback:
                await self.event_callback(msg)
        elif self.response_future and not self.response_future.done():
            self.response_future.set_result(msg)
        else:
            logger.warning(f"Received unexpected message: {msg}")

        return msg

    @staticmethod
    def is_event(message: str) -> bool:
        return message.startswith("event")

    def set_event_callback(self, callback: Callable[[str], Coroutine[None, None, None]]) -> None:
        self.event_callback = callback

    async def close(self) -> None:
        if self.listen_task:
            self.listen_task.cancel()
            try:
                await self.listen_task
            except asyncio.CancelledError:
                pass

        self.writer.close()
        await self.writer.wait_closed()
        logger.info("Connection closed")
