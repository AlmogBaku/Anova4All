import ipaddress
import secrets
from typing import Annotated, Optional

from fastapi import Request, Depends, Security, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyQuery, HTTPBasic, HTTPBasicCredentials

from anova_wifi.device import AnovaDevice
from anova_wifi.manager import AnovaManager
from .settings import Settings
from .sse import SSEManager


async def get_device_manager(request: Request) -> AnovaManager:
    if request.app.state.anova_manager is None:
        raise RuntimeError("Manager not initialized. Please wait for application startup to complete.")
    return request.app.state.anova_manager


def get_sse_manager(request: Request) -> SSEManager:
    if request.app.state.sse_manager is None:
        raise RuntimeError("SSE Manager not initialized. Please wait for application startup to complete.")
    return request.app.state.sse_manager


def get_settings(request: Request) -> Settings:
    if request.app.state.settings is None:
        raise RuntimeError("Settings not initialized. Please wait for application startup to complete.")
    return request.app.state.settings


# Define security schemes
secret_key_query = APIKeyQuery(name="secret_key", auto_error=False, description="Secret key for device authentication")
secret_key_bearer_scheme = HTTPBearer(auto_error=False, description="Bearer token for device authentication")
basic_auth_scheme = HTTPBasic(auto_error=False, description="Basic authentication for admin endpoints", realm="Admin")


def get_secret_key(
        query_key: Annotated[str, Depends(secret_key_query)],
        bearer_auth: Annotated[Optional[HTTPAuthorizationCredentials], Security(secret_key_bearer_scheme)]
) -> str:
    if query_key:
        return query_key
    elif bearer_auth:
        return bearer_auth.credentials
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


async def get_authenticated_device(
        device_id: str,
        secret_key: Annotated[str, Security(get_secret_key)],
        manager: Annotated[AnovaManager, Depends(get_device_manager)]
) -> AnovaDevice:
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    if not secrets.compare_digest(device.secret_key.encode("utf8"), secret_key.encode("utf8")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    return device


async def admin_auth(
        request: Request,
        credentials: Annotated[HTTPBasicCredentials|None, Security(basic_auth_scheme)],
        settings: Annotated[Settings, Depends(get_settings)]
) -> str:
    if request.client:
        ip = ipaddress.ip_address(request.client.host)
        if ip.is_loopback:
            return "localhost_admin"
        elif ip.is_private:
            return "local_admin"

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Basic"},
        )

    if not (settings.admin_username and settings.admin_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin credentials not set")
    current_username_bytes = credentials.username.encode("utf8")
    current_password_bytes = credentials.password.encode("utf8")

    if not (
            secrets.compare_digest(current_username_bytes, settings.admin_username.encode("utf8")) and
            secrets.compare_digest(current_password_bytes, settings.admin_password.encode("utf8"))
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )

    return credentials.username