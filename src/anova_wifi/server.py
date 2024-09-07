import asyncio
import logging
from typing import Callable, Coroutine

from .connection import AsyncAnovaConnection

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class AsyncTCPServer:
    def __init__(self, host: str = "0.0.0.0", port: int = 8080):
        self.host = host
        self.port = port
        self.server = None
        self.connection_callback = None

    async def start(self):
        self.server = await asyncio.start_server(
            self._handle_connection, self.host, self.port
        )
        logger.info(f'Serving on {self.host}:{self.port}')
        async with self.server:
            await self.server.serve_forever()

    async def stop(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info('Server stopped')

    def on_connection(self, callback: Callable[[AsyncAnovaConnection], Coroutine[None, None, None]]):
        self.connection_callback = callback

    async def _handle_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        connection = AsyncAnovaConnection(reader, writer)
        logger.info(f'New connection from {writer.transport.get_extra_info("peername")}')
        if self.connection_callback:
            await self.connection_callback(connection)
