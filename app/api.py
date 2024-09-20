import asyncio
import socket
from typing import List, Optional, Literal, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from anova_ble.client import AnovaBluetoothClient
from anova_wifi.commands import UnitType
from anova_wifi.device import DeviceState
from anova_wifi.manager import AnovaManager
from .deps import get_device_manager, get_sse_manager
from .sse import SSEManager, SSEEvent, event_stream

router = APIRouter()


class DeviceInfo(BaseModel):
    id: str
    version: Optional[str]
    device_number: Optional[str]


class TemperatureCommand(BaseModel):
    temperature: float


class TimerCommand(BaseModel):
    minutes: int


@router.get("/devices")
async def get_devices(manager: AnovaManager = Depends(get_device_manager)) -> List[DeviceInfo]:
    devices = manager.get_devices()
    return [
        DeviceInfo(
            id=device.id_card,
            version=device.version,
            device_number=device.device_number
        )
        for device in devices if device.id_card
    ]


@router.get("/devices/{device_id}/state")
async def get_device_state(device_id: str, manager: AnovaManager = Depends(get_device_manager)) -> DeviceState:
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device.state


class SetTemperatureResponse(BaseModel):
    changed_to: float


@router.post("/devices/{device_id}/temperature")
async def set_temperature(device_id: str, command: TemperatureCommand,
                          manager: AnovaManager = Depends(get_device_manager)) -> SetTemperatureResponse:
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.set_temperature(command.temperature)
        return SetTemperatureResponse(changed_to=resp.temperature)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/devices/{device_id}/start")
async def start_cooking(device_id: str, manager: AnovaManager = Depends(get_device_manager)) -> Literal['ok']:
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.start_cooking()

        if not resp.success:
            raise ValueError("Failed to start cooking")
        return "ok"
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/devices/{device_id}/stop")
async def stop_cooking(device_id: str, manager: AnovaManager = Depends(get_device_manager)) -> Literal['ok']:
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.stop_cooking()
        if not resp.success:
            raise ValueError("Failed to stop cooking")
        return "ok"
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class SetTimerResponse(BaseModel):
    message: str
    minutes: int


@router.post("/devices/{device_id}/timer")
async def set_timer(device_id: str, command: TimerCommand,
                    manager: AnovaManager = Depends(get_device_manager)) -> SetTimerResponse:
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.set_timer(command.minutes)
        return SetTimerResponse(message="Timer set successfully", minutes=resp.minutes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/devices/{device_id}/timer/stop")
async def stop_timer(device_id: str, manager: AnovaManager = Depends(get_device_manager)) -> Literal['ok']:
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.stop_timer()
        if not resp.success:
            raise ValueError("Failed to stop timer")
        return "ok"
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/devices/{device_id}/alarm/clear")
async def clear_alarm(device_id: str, manager: AnovaManager = Depends(get_device_manager)) -> Literal['ok']:
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.clear_alarm()
        if not resp.success:
            raise ValueError("Failed to clear alarm")
        return "ok"
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class TemperatureResponse(BaseModel):
    temperature: float


@router.get("/devices/{device_id}/temperature")
async def get_temperature(device_id: str, manager: AnovaManager = Depends(get_device_manager)) -> TemperatureResponse:
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return TemperatureResponse(temperature=device.state.temperature)


@router.get("/devices/{device_id}/set_temperature")
async def get_set_temperature(device_id: str, manager: AnovaManager = Depends(get_device_manager)) -> Literal['ok']:
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return "ok"


class UnitResponse(BaseModel):
    unit: UnitType


@router.get("/devices/{device_id}/unit")
async def get_unit(device_id: str, manager: AnovaManager = Depends(get_device_manager)) -> UnitResponse:
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return UnitResponse(unit=device.state.unit)  # type: ignore


class TimerResponse(BaseModel):
    timer: int


@router.get("/devices/{device_id}/timer")
async def get_timer(device_id: str, manager: AnovaManager = Depends(get_device_manager)) -> TimerResponse:
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return TimerResponse(timer=device.state.timer_value)


class SpeakerStatusResponse(BaseModel):
    speaker_status: bool


@router.get("/devices/{device_id}/speaker_status")
async def get_speaker_status(device_id: str,
                             manager: AnovaManager = Depends(get_device_manager)) -> SpeakerStatusResponse:
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return SpeakerStatusResponse(speaker_status=device.state.speaker_status)


@router.get("/devices/{device_id}/sse", response_model=SSEEvent, response_class=StreamingResponse)
async def sse_endpoint(
        request: Request,
        device_id: str,
        manager: AnovaManager = Depends(get_device_manager),
        sse_manager: SSEManager = Depends(get_sse_manager),
) -> StreamingResponse:
    """
    Server-Sent Events route that listens for events from a specific device.
    """
    if manager.get_device(device_id) is None:
        raise HTTPException(status_code=404, detail="Device not found")

    listener_id, queue = await sse_manager.connect(device_id)

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
                    yield SSEEvent(event_type="ping")
        finally:
            await sse_manager.disconnect(device_id, listener_id)

    return StreamingResponse(event_stream(event_generator()), media_type="text/event-stream")


# BLE endpoints

class BLEDevice(BaseModel):
    address: str
    name: str


@router.get("/ble_devices")
async def get_ble_device() -> BLEDevice:
    dev = await AnovaBluetoothClient.scan()
    if not dev:
        raise HTTPException(status_code=404, detail="No BLE device found")
    return BLEDevice(address=dev[0].address, name=dev[1].local_name)


@router.post("/ble/connect_wifi")
async def ble_connect_wifi(ssid: str, password: str) -> Literal['ok']:
    dev = await AnovaBluetoothClient.scan()
    if not dev:
        raise HTTPException(status_code=404, detail="No BLE device found")

    async with AnovaBluetoothClient(dev[0]) as client:
        await client.set_wifi_credentials(ssid, password)
        return 'ok'


@router.patch("/ble/patch_wifi_server")
async def patch_ble_device(host: Optional[str] = None) -> Literal['ok']:
    """
    Patch the Anova Precision Cooker to communicate with our server
    :param host: The IP address of the server. If not provided, the local IP address will be determined automatically
    :return:
    """
    dev = await AnovaBluetoothClient.scan()
    if not dev:
        raise HTTPException(status_code=404, detail="No BLE device found")

    async with AnovaBluetoothClient(dev[0]) as client:
        if not host:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('10.255.255.255', 1))
            host = s.getsockname()[0]
            s.close()
        await client.set_server_info(host, 8080)
        return 'ok'


@router.patch("/ble/restore_wifi_server")
async def patch_ble_device() -> Literal['ok']:
    """
    Restore the Anova Precision Cooker to communicate with the Anova Cloud server
    :return:
    """
    dev = await AnovaBluetoothClient.scan()
    if not dev:
        raise HTTPException(status_code=404, detail="No BLE device found")

    async with AnovaBluetoothClient(dev[0]) as client:
        await client.set_server_info()
        return 'ok'
