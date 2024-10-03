/// <reference types="web-bluetooth" />
import {
    AnovaCommand,
    GetDeviceStatus,
    GetIDCard,
    GetVersion,
    SetDeviceName,
    SetSecretKey,
    SetServerInfo,
    SetWifiCredentials,
    StartDevice,
    StopDevice,
} from './commands.ts';

const ANOVA_SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const ANOVA_CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';
const ANOVA_DEVICE_NAME = 'Anova';

export class BluetoothClient {
    private server?: BluetoothRemoteGATTServer;
    private characteristic?: BluetoothRemoteGATTCharacteristic;
    private commandLock: Promise<void> = Promise.resolve();
    private _idCard?: string;

    static async scan(): Promise<BluetoothDevice> {
        const options: RequestDeviceOptions = {
            filters: [
                {namePrefix: ANOVA_DEVICE_NAME},
                {services: [ANOVA_SERVICE_UUID]}
            ],
            optionalServices: [ANOVA_SERVICE_UUID]
        };

        return await navigator.bluetooth.requestDevice(options);
    }

    get idCard(): string {
        if (!this._idCard) {
            this.getIDCard().then(() => {
            });
        }
        return this._idCard!;
    }

    constructor(private device: BluetoothDevice) {
    }

    async connect(): Promise<void> {
        try {
            this.server = await this.device.gatt?.connect();
            if (!this.server) {
                throw new Error('Failed to connect to GATT server');
            }

            const service = await this.server.getPrimaryService(ANOVA_SERVICE_UUID);
            this.characteristic = await service.getCharacteristic(ANOVA_CHARACTERISTIC_UUID);

            await this.getIDCard();
        } catch (error) {
            console.error('Error connecting to Anova device:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        try {
            if (this.characteristic) {
                await this.characteristic.stopNotifications();
            }

            if (this.server && this.server.connected) {
                await this.server.disconnect();
            }
        } catch (error) {
            console.error('Error during disconnect:', error);
        } finally {
            // Clear all references regardless of whether disconnect succeeded or failed
            this.characteristic = undefined;
            this.server = undefined;
            await this.device.forget();
        }
    }

    async sendCommand<T>(command: AnovaCommand, timeout: number = 5000): Promise<T> {
        if (!this.characteristic) {
            throw new Error('Not connected to Anova device');
        }

        // Ensure only one command is sent at a time
        await this.commandLock;

        let unlockCommand: () => void;
        this.commandLock = new Promise(resolve => {
            unlockCommand = resolve;
        });

        try {
            const encoder = new TextEncoder();
            const commandString = `${command.encode()}\r`;
            await this.characteristic.writeValue(encoder.encode(commandString));

            const response = await this.readResponseWithTimeout(timeout);
            return command.decode(response) as T;
        } finally {
            unlockCommand!();
        }
    }

    private readResponseWithTimeout(timeout: number): Promise<string> {
        return Promise.race([
            this.readResponse(),
            new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Command timed out')), timeout);
            })
        ]);
    }

    private async readResponse(): Promise<string> {
        if (!this.characteristic) {
            throw new Error('Not connected to Anova device');
        }

        return new Promise<string>((resolve, reject) => {
            let buffer = '';

            const onCharacteristicValueChanged = (event: Event) => {
                const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
                if (value) {
                    const chunk = new TextDecoder().decode(value);
                    buffer += chunk;
                    if (buffer.includes('\r')) {
                        cleanup();
                        resolve(buffer.trim());
                    }
                }
            };

            const cleanup = () => {
                this.characteristic?.removeEventListener('characteristicvaluechanged', onCharacteristicValueChanged);
            };

            this.characteristic!.addEventListener('characteristicvaluechanged', onCharacteristicValueChanged);
            this.characteristic!.startNotifications().catch(error => {
                cleanup();
                reject(error);
            });
        });
    }

    async startDevice(): Promise<boolean> {
        return this.sendCommand<boolean>(new StartDevice());
    }

    async stopDevice(): Promise<boolean> {
        return this.sendCommand<boolean>(new StopDevice());
    }

    async getDeviceStatus(): Promise<string> {
        return this.sendCommand<string>(new GetDeviceStatus());
    }

    async setServerInfo(serverIp: string, port: number = 8080): Promise<boolean> {
        return this.sendCommand(new SetServerInfo(serverIp, port));
    }

    async setSecretKey(key: string): Promise<void> {
        await this.sendCommand(new SetSecretKey(key));
    }

    async setWifiCredentials(ssid: string, password: string): Promise<void> {
        await this.sendCommand(new SetWifiCredentials(ssid, password));
    }

    async setDeviceName(name: string): Promise<void> {
        await this.sendCommand(new SetDeviceName(name));
    }

    async getIDCard(): Promise<string> {
        if (!this._idCard) {
            this._idCard = await this.sendCommand(new GetIDCard());
        }
        this._idCard = await this.sendCommand(new GetIDCard());
        return this._idCard;
    }

    async getVersion(): Promise<string> {
        return this.sendCommand(new GetVersion());
    }
}