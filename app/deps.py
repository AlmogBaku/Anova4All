from fastapi import Request

from anova_wifi.manager import AnovaManager
from .sse import SSEManager


async def get_device_manager(request: Request) -> AnovaManager:
    if request.app.state.anova_manager is None:
        raise RuntimeError("Manager not initialized. Please wait for application startup to complete.")
    return request.app.state.anova_manager


def get_sse_manager(request: Request) -> SSEManager:
    if request.app.state.sse_manager is None:
        raise RuntimeError("SSE Manager not initialized. Please wait for application startup to complete.")
    return request.app.state.sse_manager
