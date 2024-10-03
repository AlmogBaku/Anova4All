import asyncio
import random
import socket
import string
from functools import cache
from typing import List, Optional, AsyncIterator, Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Body, Security
from fastapi.responses import StreamingResponse

from anova_ble.client import AnovaBluetoothClient
from anova_wifi.device import DeviceState, AnovaDevice
from anova_wifi.manager import AnovaManager
from commands import SetWifiCredentials, SetServerInfo, GetIDCard, GetVersion, GetTemperatureUnit, GetSpeakerStatus, \
    SetSecretKey, SetTemperatureUnit, SetTargetTemperature, GetCurrentTemperature, SetTimer, StopTimer, ClearAlarm, \
    GetTimerStatus, GetTargetTemperature, TemperatureUnit, StartTimer
from .deps import get_device_manager, get_sse_manager, get_authenticated_device, get_settings, admin_auth
from .models import DeviceInfo, SetTemperatureResponse, SetTimerResponse, UnitResponse, SpeakerStatusResponse, \
    TimerResponse, BLEDevice, OkResponse, GetTargetTemperatureResponse, TemperatureResponse, NewSecretResponse, \
    BLEDeviceInfo, SSEEvent, SSEEventType, ServerInfo
from .settings import Settings
from .sse import SSEManager, event_stream

router = APIRouter()


@router.get("/devices")
async def get_devices(
        manager: Annotated[AnovaManager, Depends(get_device_manager)],
        admin: Annotated[Optional[bool], Security(admin_auth)],
) -> List[DeviceInfo]:
    """
    Get a list of devices connected to the server
    """
    devices = manager.get_devices()
    return [
        DeviceInfo(
            id=device.id_card,
            version=device.version,
        )
        for device in devices if device.id_card
    ]


@router.get("/devices/{device_id}/state")
async def get_device_state(device: Annotated[AnovaDevice, Security(get_authenticated_device)]) -> DeviceState:
    """
    Get the state of the device
    """
    return device.state


@router.post("/devices/{device_id}/target_temperature")
async def set_temperature(temperature: Annotated[float, Body(embed=True)],
                          device: Annotated[AnovaDevice, Security(get_authenticated_device)]) -> SetTemperatureResponse:
    """
    Set the target temperature of the device
    """
    resp = await device.send_command(SetTargetTemperature(temperature, device.state.unit))
    return SetTemperatureResponse(changed_to=resp)


@router.post("/devices/{device_id}/start")
async def start_cooking(device: Annotated[AnovaDevice, Security(get_authenticated_device)]) -> OkResponse:
    """
    Start the device cooking
    """

    if not await device.start_cooking():
        raise ValueError("Failed to start cooking")
    return "ok"


@router.post("/devices/{device_id}/stop")
async def stop_cooking(device: Annotated[AnovaDevice, Security(get_authenticated_device)]) -> OkResponse:
    """
    Stop the device from cooking
    """
    if not await device.stop_cooking():
        raise ValueError("Failed to stop cooking")
    return "ok"


@router.post("/devices/{device_id}/timer")
async def set_timer(minutes: Annotated[int, Body(embed=True)],
                    device: Annotated[AnovaDevice, Security(get_authenticated_device)]) -> SetTimerResponse:
    """
    Set the timer on the device
    """
    return SetTimerResponse(message="Timer set successfully", minutes=await device.send_command(SetTimer(minutes)))


@router.post("/devices/{device_id}/timer/start")
async def start_timer(device: Annotated[AnovaDevice, Security(get_authenticated_device)]) -> OkResponse:
    """
    Start the timer on the device
    """
    if not await device.send_command(StartTimer()):
        raise ValueError("Failed to start timer")

    return "ok"


@router.post("/devices/{device_id}/timer/stop")
async def stop_timer(device: Annotated[AnovaDevice, Security(get_authenticated_device)]) -> OkResponse:
    """
    Stop the timer on the device
    """
    if not await device.send_command(StopTimer()):
        raise ValueError("Failed to stop timer")

    return "ok"


@router.post("/devices/{device_id}/alarm/clear")
async def clear_alarm(device: Annotated[AnovaDevice, Security(get_authenticated_device)]) -> OkResponse:
    """
    Clear the alarm on the device
    """
    if not await device.send_command(ClearAlarm()):
        raise ValueError("Failed to clear alarm")

    return "ok"


@router.get("/devices/{device_id}/temperature")
async def get_temperature(device: Annotated[AnovaDevice, Security(get_authenticated_device)],
                          from_state: bool = True) -> TemperatureResponse:
    """
    Get the current temperature of the device
    """
    if from_state:
        return TemperatureResponse(temperature=device.state.current_temperature)

    return TemperatureResponse(temperature=await device.send_command(GetCurrentTemperature()))


@router.get("/devices/{device_id}/target_temperature")
async def get_target_temperature(device: Annotated[AnovaDevice, Security(get_authenticated_device)],
                                 from_state: bool = True) -> GetTargetTemperatureResponse:
    """
    Get the target temperature of the device
    """
    if from_state:
        return GetTargetTemperatureResponse(temperature=device.state.target_temperature)
    return GetTargetTemperatureResponse(temperature=await device.send_command(GetTargetTemperature()))


@router.get("/devices/{device_id}/unit")
async def get_unit(device: Annotated[AnovaDevice, Security(get_authenticated_device)],
                   from_state: bool = True) -> UnitResponse:
    """
    Get the temperature unit of the device - either Celsius(c) or Fahrenheit(f)
    """
    if from_state:
        return UnitResponse(unit=device.state.unit)
    return UnitResponse(unit=await device.send_command(GetTemperatureUnit()))


@router.post("/devices/{device_id}/unit")
async def set_unit(unit: Annotated[TemperatureUnit, Body(embed=True)],
                   device: Annotated[AnovaDevice, Security(get_authenticated_device)]) -> OkResponse:
    """
    Set the temperature unit of the device
    """
    await device.send_command(SetTemperatureUnit(unit))
    return "ok"


@router.get("/devices/{device_id}/timer")
async def get_timer(device: Annotated[AnovaDevice, Security(get_authenticated_device)],
                    from_state: bool = True) -> TimerResponse:
    """
    Get the timer value of the device
    """
    if from_state:
        return TimerResponse(timer=device.state.timer_value)

    return TimerResponse(timer=await device.send_command(GetTimerStatus()))


@router.get("/devices/{device_id}/speaker_status")
async def get_speaker_status(device: Annotated[AnovaDevice, Security(get_authenticated_device)],
                             from_state: bool = True) -> SpeakerStatusResponse:
    """
    Get the speaker status of the device
    """
    return SpeakerStatusResponse(speaker_status=await device.send_command(GetSpeakerStatus()))


@router.get("/devices/{device_id}/sse", response_model=SSEEvent, response_class=StreamingResponse)
async def sse_endpoint(
        request: Request,
        device: Annotated[AnovaDevice, Security(get_authenticated_device)],
        sse_manager: Annotated[SSEManager, Depends(get_sse_manager)],
) -> StreamingResponse:
    """
    Server-Sent Events route that listens for events from a specific device.
    """
    listener_id, queue = await sse_manager.connect(device.id_card)  # type: ignore

    async def event_generator() -> AsyncIterator[SSEEvent]:
        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    async with asyncio.timeout(1.0):
                        event = await queue.get()
                        yield event
                except asyncio.TimeoutError:
                    yield SSEEvent(event_type=SSEEventType.ping)
        finally:
            await sse_manager.disconnect(device.id_card, listener_id)  # type: ignore

    return StreamingResponse(event_stream(event_generator()), media_type="text/event-stream")


@cache
def get_local_host() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('10.255.255.255', 1))
    host = s.getsockname()[0]
    s.close()
    return host


@router.get("/server_info")
async def get_server_info(
        manager: Annotated[AnovaManager, Depends(get_device_manager)],
        settings: Annotated[Settings, Depends(get_settings)],
) -> ServerInfo:
    """
    Get the server info
    """
    host = settings.server_host or get_local_host()
    port = manager.server.port
    return ServerInfo(host=host, port=port)


# BLE endpoints


@router.get("/ble/device")
async def get_ble_device(admin: Annotated[Optional[bool], Security(admin_auth)]) -> BLEDevice:
    """
    Get the BLE device
    """
    dev, adv = await AnovaBluetoothClient.scan()
    if not dev:
        raise HTTPException(status_code=404, detail="No BLE device found")

    return BLEDevice(address=dev.address, name=adv.local_name)  # type: ignore


@router.post("/ble/connect_wifi")
async def ble_connect_wifi(
        ssid: Annotated[str, Body(embed=True)],
        password: Annotated[str, Body(embed=True)]
) -> OkResponse:
    """
    Connect the Anova Precision Cooker to a Wi-Fi network
    """
    dev, adv = await AnovaBluetoothClient.scan()
    if not dev:
        raise HTTPException(status_code=404, detail="No BLE device found")

    async with AnovaBluetoothClient(dev) as client:
        await client.send_command(SetWifiCredentials(ssid, password))
        return 'ok'


@router.post("/ble/config_wifi_server")
async def patch_ble_device(
        admin: Annotated[Optional[bool], Security(admin_auth)],
        manager: Annotated[AnovaManager, Depends(get_device_manager)],
        settings: Annotated[Settings, Depends(get_settings)],
        host: Annotated[Optional[str], Body(
            embed=True,
            description="The IP address of the server."
                        "If not provided, the local IP address will be determined automatically"
        )] = None,
        port: Annotated[Optional[int], Body(
            embed=True,
            description="The port of the server. If not provided, port of the server will be used"
        )] = None
) -> OkResponse:
    """
    Patch the Anova Precision Cooker to communicate with our server
    """
    dev, adv = await AnovaBluetoothClient.scan()
    if not dev:
        raise HTTPException(status_code=404, detail="No BLE device found")

    async with AnovaBluetoothClient(dev) as client:
        host = host or settings.server_host or get_local_host()
        port = port or manager.server.port
        if not await client.send_command(SetServerInfo(host, port)):
            raise ValueError("Failed to set server info")
        return 'ok'


@router.post("/ble/restore_wifi_server")
async def restore_ble_device(admin: Annotated[Optional[bool], Security(admin_auth)]) -> OkResponse:
    """
    Restore the Anova Precision Cooker to communicate with the Anova Cloud server
    """
    dev, adv = await AnovaBluetoothClient.scan()
    if not dev:
        raise HTTPException(status_code=404, detail="No BLE device found")

    async with AnovaBluetoothClient(dev) as client:
        if not await client.send_command(SetServerInfo()):
            raise ValueError("Failed to restore server info")
        return 'ok'


@router.get("/ble/")
async def ble_get_info(admin: Annotated[Optional[bool], Security(admin_auth)]) -> BLEDeviceInfo:
    """
    Get the number on the Anova Precision Cooker
    """
    dev, adv = await AnovaBluetoothClient.scan()
    if not dev:
        raise HTTPException(status_code=404, detail="No BLE device found")

    async with AnovaBluetoothClient(dev) as client:
        id_card = await client.send_command(GetIDCard())
        ver = await client.send_command(GetVersion())
        unit = await client.send_command(GetTemperatureUnit())
        speaker = await client.send_command(GetSpeakerStatus())
        return BLEDeviceInfo(
            ble_address=dev.address,
            ble_name=adv.local_name,  # type: ignore
            version=ver,
            id_card=id_card,
            temperature_unit=unit,
            speaker_status=speaker
        )


@router.post("/ble/secret_key")
async def ble_new_secret_key(admin: Annotated[Optional[bool], Security(admin_auth)]) -> NewSecretResponse:
    """
    Set a new secret key on the Anova Precision Cooker
    """
    dev, adv = await AnovaBluetoothClient.scan()
    if not dev:
        raise HTTPException(status_code=404, detail="No BLE device found")

    characters = string.ascii_lowercase + string.digits
    secret_key = ''.join(random.choice(characters) for _ in range(10))

    async with AnovaBluetoothClient(dev) as client:
        await client.send_command(SetSecretKey(secret_key))
        return NewSecretResponse(secret_key=secret_key)
