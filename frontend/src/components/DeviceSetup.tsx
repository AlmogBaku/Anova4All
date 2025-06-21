import React, {useEffect, useState} from 'react';
import {useAnova} from "../contexts/Anova.tsx";
import {TbBluetooth, TbPassword, TbWifi} from "react-icons/tb";
import {Link, useNavigate} from "react-router-dom";
import {BluetoothClient} from "../client/ble/client.ts";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Input} from "@/components/ui/input.tsx";
import {Checkbox} from "@/components/ui/checkbox.tsx";

const DeviceSetup: React.FC = () => {
    const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
    const [client, setClient] = useState<BluetoothClient | null>(null);
    const [idCard, setIDCard] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const {configureDevice, remoteServer} = useAnova();

    const [resetSecretKey, setResetSecretKey] = useState<boolean>(true);
    const [ssid, setSSID] = useState<string>('');
    const [password, setPassword] = useState<string>('');

    const navigate = useNavigate();


    const scanForDevice = async () => {
        try {
            setError(null);
            setSelectedDevice(null);
            const dev = await BluetoothClient.scan();
            setSelectedDevice(dev);
        } catch (e: unknown) {
            console.error('Error scanning for device:', e);
            setError('Error scanning for device');
            return;
        }
    }

    const handleSetup = async () => {
        setError(null);
        if (!selectedDevice) {
            setError('No device selected');
            return;
        }
        if (idCard === null) {
            setError('Error getting device info');
            return;
        }
        if (!client) {
            setError('Error connecting to device');
            return;
        }

        await client!.setServerInfo(remoteServer.host, remoteServer.port);
        if (ssid && password) {
            await client!.setWifiCredentials(ssid, password);
        }
        if (resetSecretKey) {
            const characters: string = 'abcdefghijklmnopqrstuvwxyz0123456789';
            const array = new Uint8Array(10);
            crypto.getRandomValues(array);
            const secretKey: string = Array.from(array, byte => characters[byte % characters.length]).join('');

            await client!.setSecretKey(secretKey);
            configureDevice({id: idCard, secretKey});
        } else {
            configureDevice((prev) => ({...prev, id: idCard}));
        }
        navigate('/');
    };

    useEffect(() => {
        if (!selectedDevice) return;
        const getInfo = async () => {
            try {
                const cli = new BluetoothClient(selectedDevice!)
                setClient(cli);
                await cli.connect();
                setIDCard(cli.idCard);
            } catch (e: unknown) {
                console.error('Error getting device info:', e);
                setError('Error getting device info');
            }
        }
        getInfo();
    }, [selectedDevice]);


    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle className="text-3xl font-bold">Set Up New Device</CardTitle>
                    <CardDescription>Please make sure your device is powered on and in setup mode</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {!selectedDevice ? (
                        <Button size="lg" onClick={scanForDevice}>
                            <TbBluetooth className="mr-2 h-4 w-4"/> Scan for device
                        </Button>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div>
                                <p>Found device: {selectedDevice.name}</p>
                                {idCard && <p>ID Card: {idCard}</p>}
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => scanForDevice()}
                                    className="mt-2"
                                >
                                    <TbBluetooth className="mr-2 h-4 w-4"/>
                                    Rescan
                                </Button>
                            </div>

                            <Accordion type="single" collapsible className="w-full">
                                <AccordionItem value="item-1">
                                    <AccordionTrigger>Configure Wifi</AccordionTrigger>
                                    <AccordionContent className="flex flex-col gap-4">
                                        <div className="text-sm text-muted-foreground">
                                            <p>Enter your wifi credentials to connect the device to your network.</p>
                                            <p>If credentials are not provided, the device will connect to the previously
                                                configured network.</p>
                                        </div>
                                        <div className="grid w-full max-w-sm items-center gap-1.5">
                                            <Label htmlFor="ssid">SSID</Label>
                                            <div className="relative">
                                                <TbWifi
                                                    className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
                                                <Input id="ssid" placeholder="SSID" value={ssid}
                                                       onChange={(e) => setSSID(e.target.value)} className="pl-8"/>
                                            </div>
                                        </div>
                                        <div className="grid w-full max-w-sm items-center gap-1.5">
                                            <Label htmlFor="password">Password</Label>
                                            <div className="relative">
                                                <TbPassword
                                                    className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/>
                                                <Input id="password" type="password" placeholder="Password"
                                                       value={password}
                                                       onChange={(e) => setPassword(e.target.value)} className="pl-8"/>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>

                            <div className="items-top flex space-x-2">
                                <Checkbox id="terms1" checked={resetSecretKey}
                                          onCheckedChange={() => setResetSecretKey(!resetSecretKey)}/>
                                <div className="grid gap-1.5 leading-none">
                                    <label
                                        htmlFor="terms1"
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        Regenerate secret key
                                    </label>
                                    <div className="text-sm text-muted-foreground">
                                        <p>Regenerating the secret key will invalidate the previous one and require
                                            reconfiguration of the device</p>
                                        <p>If you choose not to generate a new secret key, you <strong>must</strong> configure
                                            manually on the <Link
                                                to="/settings" className="underline">settings page</Link>.</p>
                                    </div>
                                </div>
                            </div>

                            <Button
                                size="lg"
                                onClick={handleSetup}
                                disabled={!selectedDevice}
                            >
                                <TbWifi className="mr-2 h-4 w-4"/>
                                Setup your device
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default DeviceSetup;