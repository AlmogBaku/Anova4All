import asyncio
import logging
from typing import Callable, Coroutine

from .connection import AnovaConnection

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class AnovaServer:
    host: str
    port: int
    server: asyncio.Server
    connection_callback: Callable[[AnovaConnection], Coroutine[None, None, None]]

    def __init__(self, host: str = "0.0.0.0", port: int = 8080):
        self.host = host
        self.port = port

    async def start(self) -> None:
        self.server = await asyncio.start_server(
            self._handle_connection, self.host, self.port
        )
        logger.info(f'Serving on {self.host}:{self.port}')
        async with self.server:
            await self.server.serve_forever()

    async def stop(self) -> None:
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info('Server stopped')

    def on_connection(self, callback: Callable[[AnovaConnection], Coroutine[None, None, None]]) -> None:
        self.connection_callback = callback

    async def _handle_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        connection = AnovaConnection(reader, writer)
        logger.info(f'New connection from {writer.transport.get_extra_info("peername")}')
        connection.start_listening()
        if self.connection_callback:  # type: ignore
            await self.connection_callback(connection)
