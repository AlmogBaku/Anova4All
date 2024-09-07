import asyncio
import logging

from .encoding import Encoder

logger = logging.getLogger(__name__)


class AsyncAnovaConnection:
    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader = reader
        self.writer = writer

    async def send(self, message: str) -> None:
        encoded = Encoder.encode(message)
        self.writer.write(encoded)
        self.writer.write(b'\x16')
        await self.writer.drain()
        logger.info(f"Sent message: {message}")

    async def receive(self) -> str:
        data = await self.reader.read(1024)  # Adjust buffer size as needed
        decoded = Encoder.decode(data)
        logger.info(f"Received message: {decoded}")

        if decoded.lower() == "WIFI Invalid Command".lower():
            logger.error(f"Received invalid command, skipping: {decoded}")
            return await self.receive()

        return decoded

    async def close(self) -> None:
        self.writer.close()
        await self.writer.wait_closed()
        logger.info("Connection closed")
