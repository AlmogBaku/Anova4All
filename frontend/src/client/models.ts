// src/models.ts

export interface DeviceInfo {
    id: string;
    version: string | null;
    device_number: string | null;
}

export interface DeviceState {
    status: DeviceStatus;
    current_temperature: number;
    target_temperature: number;
    timer_running: boolean;
    timer_value: number;
    unit: TemperatureUnit | null;
    speaker_status: boolean;
}

export enum DeviceStatus {
    Running = 'running',
    Stopped = 'stopped',
    LowWater = 'low water',
    HeaterError = 'heater error',
    PowerLoss = 'power_loss',
    UserChangeParameter = 'user change parameter',
}

export enum TemperatureUnit {
    Celsius = 'c',
    Fahrenheit = 'f',
}

export enum EventType {
    TempReached = 'temp_reached',
    LowWater = 'low_water',
    Start = 'start',
    Stop = 'stop',
    ChangeTemp = 'change_temp',
    TimeStart = 'time_start',
    TimeStop = 'time_stop',
    TimeFinish = 'time_finish',
    ChangeParam = 'change_param',
}

export enum EventOriginator {
    Wifi = 'wifi',
    BLE = 'ble',
    Device = 'device',
}

export interface ServerInfo {
    host: string;
    port: number;
}

export interface AnovaEvent {
    type: EventType;
    originator?: EventOriginator;
}

export enum SSEEventType {
    DeviceConnected = 'device_connected',
    DeviceDisconnected = 'device_disconnected',
    StateChanged = 'state_changed',
    Event = 'event',
    Ping = 'ping',
}

export interface SSEEvent {
    event_type: SSEEventType;
    device_id: string | null;
    payload: AnovaEvent | DeviceState | null;
}

export interface BLEDevice {
    address: string;
    name: string;
}

export interface BLEDeviceInfo {
    ble_address: string;
    ble_name: string;
    version: string;
    id_card: string;
    temperature_unit: TemperatureUnit;
    speaker_status: boolean;
}

export interface NewSecretResponse {
    secret_key: string;
}