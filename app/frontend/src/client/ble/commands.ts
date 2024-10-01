export abstract class AnovaCommand {
    abstract encode(): string;

    decode(response: string): unknown {
        return response.trim();
    }
}

export class StartDevice extends AnovaCommand {
    encode(): string {
        return 'start';
    }

    decode(response: string): boolean {
        const trimmed = response.trim().toLowerCase();
        return trimmed === 'ok' || trimmed === 'start';
    }
}

export class StopDevice extends AnovaCommand {
    encode(): string {
        return 'stop';
    }

    decode(response: string): boolean {
        const trimmed = response.trim().toLowerCase();
        return trimmed === 'ok' || trimmed === 'stop';
    }
}

export class GetDeviceStatus extends AnovaCommand {
    encode(): string {
        return 'status';
    }
}

export class SetServerInfo extends AnovaCommand {
    constructor(private serverIp: string, private port: number = 8080) {
        super();
    }

    encode(): string {
        return `server para ${this.serverIp} ${this.port}`;
    }

    decode(response: string): boolean {
        const parts = response.trim().split(" ");
        return parts[0] === this.serverIp && parseInt(parts[1]) === this.port;
    }
}

export class SetSecretKey extends AnovaCommand {
    constructor(private key: string) {
        super();
        if (!/^[a-z0-9]{10}$/.test(key)) {
            throw new Error("Secret key must be 10 lowercase alphanumeric characters");
        }
    }

    encode(): string {
        return `set number ${this.key}`;
    }
}

export class SetWifiCredentials extends AnovaCommand {
    constructor(private ssid: string, private password: string) {
        super();
    }

    encode(): string {
        return `wifi para 2 ${this.ssid} ${this.password} WPA2PSK AES`;
    }
}

export class SetDeviceName extends AnovaCommand {
    constructor(private name: string) {
        super();
    }

    encode(): string {
        return `set name ${this.name}`;
    }
}

export class GetIDCard extends AnovaCommand {
    encode(): string {
        return "get id card";
    }

    decode(response: string): string {
        let id_card = response.trim();
        if (id_card.startsWith("anova ")) {
            id_card = id_card.slice(6);
        }
        return id_card;
    }
}

export class GetVersion extends AnovaCommand {
    encode(): string {
        return "version";
    }
}