import {
    BLEDevice,
    BLEDeviceInfo,
    DeviceInfo,
    DeviceState,
    NewSecretResponse,
    ServerInfo,
    SSEEvent,
    TemperatureUnit,
} from './models';
import {AsyncQueue, AsyncQueueImpl} from "./async-queue.ts";
import {EventSourceMessage, fetchEventSource} from "@microsoft/fetch-event-source";

export class Anova4AllError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'Anova4AllError';
    }
}

// noinspection JSUnusedGlobalSymbols
export class Client {
    private static baseUrl: string = '/api';

    public static setBaseUrl(url: string): void {
        this.baseUrl = url;
    }

    private static async request<T>(
        endpoint: string,
        method: string = 'GET',
        options: { headers?: Record<string, string>, secretKey?: string, body?: unknown } = {},
    ): Promise<T> {
        // remove last / if present
        const baseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
        const ep = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
        const url = `${baseUrl}/${ep}`;

        const headers: HeadersInit = options.headers || {
            'Content-Type': 'application/json',
        };
        if (options?.secretKey) {
            headers['Authorization'] = `Bearer ${options.secretKey}`;
        }

        const response = await fetch(url, {
            method,
            headers: headers,
            body: options?.body ? JSON.stringify(options.body) : undefined,
        });

        if (!response.ok) {
            throw new Anova4AllError(response.status, await response.text());
        }

        return response.json();
    }

    public static async getServerInfo(): Promise<ServerInfo> {
        return this.request<ServerInfo>('/server_info');
    }

    // Device Management
    public static async getDevices(): Promise<DeviceInfo[]> {
        return this.request<DeviceInfo[]>('/devices');
    }

    public static async getDeviceState(deviceId: string, secretKey: string): Promise<DeviceState> {
        return this.request<DeviceState>(`/devices/${deviceId}/state`, 'GET', {secretKey});
    }


    public static async setTargetTemperature(deviceId: string, secretKey: string, temperature: number): Promise<{
        changed_to: number
    }> {
        return this.request<{ changed_to: number }>(
            `/devices/${deviceId}/target_temperature`,
            'POST',
            {body: {temperature}, secretKey}
        );
    }

    public static async setTimer(deviceId: string, secretKey: string, minutes: number): Promise<{
        message: string;
        minutes: number
    }> {
        return this.request<{ message: string; minutes: number }>(
            `/devices/${deviceId}/timer`,
            'POST',
            {body: {minutes}, secretKey}
        );
    }

    public static async setUnit(deviceId: string, secretKey: string, unit: TemperatureUnit): Promise<string> {
        return this.request<string>(
            `/devices/${deviceId}/unit`,
            'POST',
            {body: {unit}, secretKey}
        );
    }

    public static async getTemperature(deviceId: string, secretKey: string, fromState: boolean = false): Promise<{
        temperature: number
    }> {
        return this.request<{ temperature: number }>(`/devices/${deviceId}/temperature?from_state=${fromState}`,
            'GET', {secretKey});
    }

    public static async getTargetTemperature(deviceId: string, secretKey: string, fromState: boolean = false): Promise<{
        temperature: number
    }> {
        return this.request<{
            temperature: number
        }>(`/devices/${deviceId}/target_temperature?from_state=${fromState}`
            , 'GET', {secretKey});
    }

    // Cooking Control
    public static async startCooking(deviceId: string, secretKey: string): Promise<string> {
        return this.request<string>(`/devices/${deviceId}/start`, 'POST', {secretKey});
    }

    public static async stopCooking(deviceId: string, secretKey: string): Promise<string> {
        return this.request<string>(`/devices/${deviceId}/stop`, 'POST', {secretKey});
    }

    public static async getTimer(deviceId: string, secretKey: string, fromState: boolean = false): Promise<{
        timer: number
    }> {
        return this.request<{ timer: number }>(`/devices/${deviceId}/timer?from_state=${fromState}`,
            'GET', {secretKey});
    }

    public static async startTimer(deviceId: string, secretKey: string): Promise<string> {
        return this.request<string>(`/devices/${deviceId}/timer/start`, 'POST', {secretKey});
    }

    public static async stopTimer(deviceId: string, secretKey: string): Promise<string> {
        return this.request<string>(`/devices/${deviceId}/timer/stop`, 'POST', {secretKey});
    }

    // Alarm Control
    public static async clearAlarm(deviceId: string, secretKey: string): Promise<string> {
        return this.request<string>(`/devices/${deviceId}/alarm/clear`, 'POST', {secretKey});
    }

    // Unit Control
    public static async getUnit(deviceId: string, secretKey: string, fromState: boolean = false): Promise<{
        unit: TemperatureUnit
    }> {
        return this.request<{
            unit: TemperatureUnit
        }>(`/devices/${deviceId}/unit?from_state=${fromState}`, 'GET', {secretKey});
    }

    // Speaker Status
    public static async getSpeakerStatus(deviceId: string, secretKey: string, fromState: boolean = false): Promise<{
        speaker_status: boolean
    }> {
        return this.request<{
            speaker_status: boolean
        }>(`/devices/${deviceId}/speaker_status?from_state=${fromState}`, 'GET', {secretKey});
    }


    // BLE

    public static async ble_getDevice(): Promise<BLEDevice> {
        return this.request<BLEDevice>(`/ble/device`, 'Get')
    }

    public static async ble_connectToWiFi(ssid: string, password: string): Promise<string> {
        return this.request<string>(`/ble/connect_wifi`, 'POST',
            {body: {ssid, password}});
    }

    public static async ble_getInfo(): Promise<BLEDeviceInfo> {
        return this.request<BLEDeviceInfo>('/ble/', 'GET');
    }

    public static async ble_setNewSecretKey(): Promise<NewSecretResponse> {
        return this.request<NewSecretResponse>('/ble/secret_key', 'POST');
    }

    public static async ble_configureWiFiServer(host?: string, port?: number): Promise<string> {
        return this.request<string>(
            '/ble/config_wifi_server',
            'POST',
            {body: {host, port}},
        );
    }

    // SSE

    /**
     * Subscribe to SSE events for a device
     * @param device_id
     * @param secretKey
     * @returns AsyncGenerator<SSEEvent>
     *
     * @example
     * ```typescript
     * for await (const event of Client.SubscribeToSSE(deviceId, secretKey)) {
     *    console.log('Received SSE event:', event);
     * }
     * ```
     */
    public static SubscribeToSSE(device_id: string, secretKey: string): AsyncGenerator<SSEEvent> {
        const baseUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
        const url = `${baseUrl}/devices/${device_id}/sse`;
        const headers: HeadersInit = {
            'Authorization': `Bearer ${secretKey}`,
            'Accept': 'text/event-stream'
        };

        const queue: AsyncQueue<SSEEvent> = new AsyncQueueImpl<SSEEvent>();
        const controller = new AbortController();

        fetchEventSource(url, {
            method: 'GET',
            headers: headers,
            signal: controller.signal,
            async onopen(response) {
                if (response.ok) {
                    return;
                }
                console.error(`Failed to open SSE stream: ${response.status} ${response.statusText}`);
                // throw new Error(`Failed to open SSE stream: ${response.status} ${response.statusText}`);
            },
            onmessage(event: EventSourceMessage) {
                if (event.data) {
                    const parsedData = JSON.parse(event.data) as SSEEvent;
                    if (!queue.closed) {
                        queue.push(parsedData);
                    }
                }
            },
            onerror(err) {
                console.error('SSE Error:', err);
                controller.abort();
                queue.close();
            },
            onclose() {
                queue.close();
            },
        }).catch(error => {
            console.error('SSE connection error:', error);
            queue.close();
        });

        return queue.consume();
    }
}