import {DeviceState, DeviceStatus, SSEEventType, TemperatureUnit} from "./models.ts";
import {Client} from "./client.ts";

export interface State extends DeviceState {
    connected: boolean,
}

// noinspection JSUnusedGlobalSymbols
export class Device {
    private _state: State = {} as State;
    private _stop: boolean = false;
    private _onStateChange: (state: State) => void = () => {
    }

    constructor(public readonly deviceId: string, private readonly secretKey: string) {
        this.getDeviceState().then(() => {
        });
        this.subscribeToEvents().then(() => {
        });
    }

    public get state() {
        return this._state;
    }

    private set state(state: State) {
        if (
            (state.status !== this._state.status) ||
            (state.current_temperature !== this._state.current_temperature) ||
            (state.target_temperature !== this._state.target_temperature) ||
            (state.timer_running !== this._state.timer_running) ||
            (state.timer_value !== this._state.timer_value) ||
            (state.unit !== this._state.unit) ||
            (state.speaker_status !== this._state.speaker_status)
        ) {
            this._onStateChange(state);
        }
        this._state = state;
    }

    public stop() {
        this._stop = true;
    }

    public onStateChange(callback: (state: State) => void) {
        this._onStateChange = callback;
    }


    private async subscribeToEvents(): Promise<void> {
        const eventStream = Client.SubscribeToSSE(
            this.deviceId,
            this.secretKey,
        );
        for await (const event of eventStream) {
            switch (event.event_type) {
                case SSEEventType.StateChanged:
                    this.state = {...this._state, ...(event.payload as DeviceState)};
                    break;
                case SSEEventType.DeviceDisconnected:
                    this._state.connected = false;
                    break;
                case SSEEventType.DeviceConnected:
                    this._state.connected = true;
                    break;
                case SSEEventType.Event:
                    console.log('Anova event:', event.payload);
                    break;
                case SSEEventType.Ping:
                    break
            }

            if (this._stop) {
                break;
            }
        }
        if (this._stop) {
            return;
        }

        return await this.subscribeToEvents()
    }

    // implement methods to interact with the device
    public async getDeviceState() {
        const resp = await Client.getDeviceState(this.deviceId, this.secretKey);
        this.state = {...this._state, ...resp};
        return resp;
    }

    public async setTargetTemperature(temperature: number) {
        const resp = await Client.setTargetTemperature(this.deviceId, this.secretKey, temperature);
        this.state = {...this._state, target_temperature: resp.changed_to};
        return resp;
    }

    public async setTimer(minutes: number) {
        const resp = await Client.setTimer(this.deviceId, this.secretKey, minutes);
        this.state = {...this._state, timer_value: resp.minutes};
    }

    public async setUnit(unit: 'c' | 'f') {
        const tu = unit === 'c' ? TemperatureUnit.Celsius : TemperatureUnit.Fahrenheit;
        const resp = await Client.setUnit(this.deviceId, this.secretKey, tu);
        this.state = {...this._state, unit: tu};
        return resp;
    }

    public async getTemperature(fromState: boolean = false) {
        const resp = await Client.getTemperature(this.deviceId, this.secretKey, fromState);
        this.state = {...this._state, current_temperature: resp.temperature};
        return resp;
    }

    public async getTargetTemperature(fromState: boolean = false) {
        return await Client.getTargetTemperature(this.deviceId, this.secretKey, fromState);
    }

    public async startCooking() {
        const resp = await Client.startCooking(this.deviceId, this.secretKey);
        this.state = {...this._state, status: DeviceStatus.Running};
        return resp
    }

    public async stopCooking() {
        const resp = await Client.stopCooking(this.deviceId, this.secretKey);
        this.state = {...this._state, status: DeviceStatus.Stopped};
        return resp
    }

    public async startTimer() {
        const resp = await Client.startTimer(this.deviceId, this.secretKey);
        this.state = {...this._state, timer_running: true};
        return resp;
    }

    public async stopTimer() {
        const resp = await Client.stopTimer(this.deviceId, this.secretKey);
        this.state = {...this._state, timer_running: true};
        return resp;
    }

    public async clearAlarm() {
        return await Client.clearAlarm(this.deviceId, this.secretKey);
    }

    public async getSpeakerStatus() {
        return await Client.getSpeakerStatus(this.deviceId, this.secretKey);
    }
}
