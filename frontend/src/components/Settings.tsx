import React from 'react';
import {useAnova, useTemperatureControl} from "../contexts/Anova.tsx";
import {TemperatureUnit} from "../client";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Switch} from "@/components/ui/switch.tsx";

const Settings: React.FC = () => {
    const {
        remoteServer,
        deviceCreds,
        configureDevice,
        configureRemoteServer,
        isConfigured,
        state: anovaState,
        apiURL,
        setApiURL,
    } = useAnova();
    const tempCtrl = useTemperatureControl();

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Settings</h1>

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>App Settings</CardTitle>
                        <CardDescription>General settings for the application and server connections.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6">
                        <div className="grid gap-3">
                            <Label htmlFor="api-url">API Server URL</Label>
                            <Input id="api-url" placeholder="http://localhost:8080" value={apiURL}
                                   onChange={(e) => setApiURL(e.target.value)}/>
                            <p className="text-sm text-muted-foreground">The base URL of the Anova4All API server.</p>
                        </div>
                        <div className="grid gap-3">
                            <Label htmlFor="remote-host">Remote Server Host</Label>
                            <Input id="remote-host" placeholder="Remote host" value={remoteServer.host}
                                   onChange={(e) => configureRemoteServer((prev) => ({...prev, host: e.target.value}))}/>
                            <p className="text-sm text-muted-foreground">The remote host for the device to connect to.</p>
                        </div>
                        <div className="grid gap-3">
                            <Label htmlFor="remote-port">Remote Server Port</Label>
                            <Input id="remote-port" type="number" placeholder="Remote port" value={remoteServer.port}
                                   onChange={(e) => configureRemoteServer((prev) => ({
                                       ...prev,
                                       port: parseInt(e.target.value)
                                   }))}/>
                            <p className="text-sm text-muted-foreground">The remote port for the device to connect to.</p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Device Credentials</CardTitle>
                        <CardDescription>Credentials for connecting to your Anova device.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6">
                        <div className="grid gap-3">
                            <Label htmlFor="device-id">Device ID</Label>
                            <Input id="device-id" placeholder="Device ID" value={deviceCreds?.id || ''}
                                   onChange={(e) => configureDevice((prev) => ({...prev, id: e.target.value}))}/>
                        </div>
                        <div className="grid gap-3">
                            <Label htmlFor="secret-key">Secret Key</Label>
                            <Input id="secret-key" placeholder="Secret Key" value={deviceCreds?.secretKey || ''}
                                   onChange={(e) => configureDevice((prev) => ({...prev, secretKey: e.target.value}))}/>
                        </div>
                    </CardContent>
                </Card>

                {isConfigured && anovaState && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Device Settings</CardTitle>
                            <CardDescription>Settings for the connected device.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <Label htmlFor="temp-unit" className="flex flex-col space-y-1">
                                    <span>Temperature Unit</span>
                                    <span className="font-normal leading-snug text-muted-foreground">
                                        Switch between Fahrenheit and Celsius.
                                    </span>
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="temp-unit">Fahrenheit</Label>
                                    <Switch
                                        id="temp-unit"
                                        checked={anovaState.unit === TemperatureUnit.Celsius}
                                        onCheckedChange={(checked) => tempCtrl.setUnit(checked ? 'c' : 'f')}
                                    />
                                    <Label htmlFor="temp-unit">Celsius</Label>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default Settings;