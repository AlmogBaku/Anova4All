from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from src.anova_wifi.device import DeviceState
from src.anova_wifi.manager import AsyncAnovaManager

router = APIRouter()


async def get_manager(request: Request):
    if request.app.state.anova_manager is None:
        raise RuntimeError("Manager not initialized. Please wait for application startup to complete.")
    return request.app.state.anova_manager


class DeviceInfo(BaseModel):
    id: str
    version: Optional[str]
    device_number: Optional[str]


class TemperatureCommand(BaseModel):
    temperature: float


class TimerCommand(BaseModel):
    minutes: int


@router.get("/devices", response_model=List[DeviceInfo])
async def get_devices(manager: AsyncAnovaManager = Depends(get_manager)):
    devices = manager.get_devices()
    return [
        DeviceInfo(
            id=device.id_card,
            version=device.version,
            device_number=device.device_number
        )
        for device in devices
    ]


@router.get("/devices/{device_id}/state", response_model=DeviceState)
async def get_device_state(device_id: str, manager: AsyncAnovaManager = Depends(get_manager)):
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device.state


@router.post("/devices/{device_id}/temperature")
async def set_temperature(device_id: str, command: TemperatureCommand,
                          manager: AsyncAnovaManager = Depends(get_manager)):
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.set_temperature(command.temperature)
        return {"message": "Temperature set successfully", "changed_to": resp.temperature}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/devices/{device_id}/start")
async def start_cooking(device_id: str, manager: AsyncAnovaManager = Depends(get_manager)):
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.start_cooking()
        return {"message": "Cooking started successfully", "raw_message": resp.data}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/devices/{device_id}/stop")
async def stop_cooking(device_id: str, manager: AsyncAnovaManager = Depends(get_manager)):
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.stop_cooking()
        return {"message": "Cooking stopped successfully", "raw_message": resp.data}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/devices/{device_id}/timer")
async def set_timer(device_id: str, command: TimerCommand, manager: AsyncAnovaManager = Depends(get_manager)):
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.set_timer(command.minutes)
        return {"message": "Timer set successfully", "changed_to_min": resp.minutes}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/devices/{device_id}/timer/stop")
async def stop_timer(device_id: str, manager: AsyncAnovaManager = Depends(get_manager)):
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.stop_timer()
        return {"message": "Timer stopped successfully", "raw_message": resp.data}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/devices/{device_id}/alarm/clear")
async def clear_alarm(device_id: str, manager: AsyncAnovaManager = Depends(get_manager)):
    try:
        device = manager.get_device(device_id)
        if not device:
            raise HTTPException(status_code=404, detail="Device not found")
        resp = await device.clear_alarm()
        return {"message": "Alarm cleared successfully", "raw_message": resp.data}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/devices/{device_id}/temperature")
async def get_temperature(device_id: str, manager: AsyncAnovaManager = Depends(get_manager)):
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"temperature": device.state.temperature}


@router.get("/devices/{device_id}/set_temperature")
async def get_set_temperature(device_id: str, manager: AsyncAnovaManager = Depends(get_manager)):
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"set_temperature": device.state.target_temperature}


@router.get("/devices/{device_id}/unit")
async def get_unit(device_id: str, manager: AsyncAnovaManager = Depends(get_manager)):
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"unit": device.state.unit}


@router.get("/devices/{device_id}/timer")
async def get_timer(device_id: str, manager: AsyncAnovaManager = Depends(get_manager)):
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"timer": device.state.timer_value}


@router.get("/devices/{device_id}/speaker_status")
async def get_speaker_status(device_id: str, manager: AsyncAnovaManager = Depends(get_manager)):
    device = manager.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"speaker_status": device.state.speaker_status}
