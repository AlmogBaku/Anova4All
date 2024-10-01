import asyncio
import logging
from typing import Optional, Callable, Coroutine

from .encoding import Encoder
from .event import AnovaEvent

logger = logging.getLogger(__name__)


class AnovaConnection:
    event_callback: Optional[Callable[[AnovaEvent], Coroutine[None, None, None]]] = None
    listen_task: Optional[asyncio.Task[None]] = None
    response_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1)
    cmd_lock = asyncio.Lock()

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader = reader
        self.writer = writer

    async def send_command(self, message: str) -> str:
        async with self.cmd_lock:
            async with asyncio.timeout(10):
                encoded = Encoder.encode(message)
                self.writer.write(encoded)
                self.writer.write(b'\x16')
                await self.writer.drain()
                logger.debug(f"--> Sent message: {message}")
                resp = await self.response_queue.get()
                logger.debug(f"<-- Received response: {resp}")
                return resp

    def start_listening(self) -> None:
        if not self.listen_task:
            self.listen_task = asyncio.create_task(self._listen())

    async def _listen(self) -> None:
        try:
            while True:
                await self.receive()
        except ConnectionResetError:
            logger.debug("Connection closed by remote host")
        except asyncio.CancelledError:
            logger.debug("Listening task cancelled")
        except Exception as e:
            logger.error(f"Error in listening task: {e}")

    async def receive(self) -> Optional[str]:
        data = await self.reader.read(1024)
        if not data:
            logger.error("Connection closed by remote host")
            raise ConnectionResetError("Connection closed by remote host")

        msg = Encoder.decode(data)

        if "invalid command" in msg.lower():
            logger.error(f"Received invalid command, skipping: {msg}")
            return None

        if AnovaEvent.is_event(msg):
            if self.event_callback:
                await self.event_callback(AnovaEvent.parse_event(msg))
            else:
                logger.warning(f"Received event message but no event callback set: {msg}")
        elif self.cmd_lock.locked():
            await self.response_queue.put(msg)
        else:
            logger.warning(f"Received unexpected message while not locked: {msg}")

        return msg

    def set_event_callback(self, callback: Callable[[AnovaEvent], Coroutine[None, None, None]]) -> None:
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
