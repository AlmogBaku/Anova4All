import React, {useEffect, useState} from 'react';
import {useAnova} from "@/contexts/anova";
import {TbBluetooth, TbLoader, TbWifi} from "react-icons/tb";
import {useNavigate} from "react-router-dom";
import {BluetoothClient} from "@/lib/client/ble/client";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {Checkbox} from "@/components/ui/checkbox";
import {useAuth} from "@/contexts/auth";
import {Client} from "@/lib/client";

type SetupStep = 'welcome' | 'configure' | 'finishing';

const useDeviceSetup = () => {
    const [step, setStep] = useState<SetupStep>('welcome');
    const [statusText, setStatusText] = useState('');
    const [isConnecting, setIsConnecting] = useState<boolean>(false);
    const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null);
    const [client, setClient] = useState<BluetoothClient | null>(null);
    const [idCard, setIDCard] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const {refreshDevices, remoteServer} = useAnova();
    const {session} = useAuth();
    const [resetSecretKey, setResetSecretKey] = useState<boolean>(true);
    const [ssid, setSSID] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const navigate = useNavigate();

    const handleScan = async () => {
        setError(null);
        try {
            const dev = await BluetoothClient.scan();
            setSelectedDevice(dev);
            setStep('configure');
        } catch (e: unknown) {
            console.error('Error scanning for device:', e);
        }
    };

    useEffect(() => {
        if (step !== 'configure' || !selectedDevice) return;

        const connectToDevice = async () => {
            setIsConnecting(true);
            setError(null);
            try {
                const cli = new BluetoothClient(selectedDevice);
                await cli.connect();
                setClient(cli);
                setIDCard(cli.idCard);
            } catch (e: unknown) {
                console.error('Error connecting to device:', e);
                const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
                setError(`Connection failed: ${errorMessage}`);
                setStep('welcome');
            } finally {
                setIsConnecting(false);
            }
        };

        connectToDevice();
    }, [step, selectedDevice]);

    const handleSetup = async () => {
        setError(null);
        if (!idCard || !client || !session?.access_token) {
            setError('Missing required information to complete setup.');
            return;
        }

        setStep('finishing');
        setStatusText('Configuring device...');

        try {
            await client.setServerInfo(remoteServer.host, remoteServer.port);
            if (ssid && password) {
                setStatusText('Sending Wi-Fi credentials...');
                await client.setWifiCredentials(ssid, password);
            }
            if (resetSecretKey) {
                setStatusText('Generating and setting new secret key...');
                const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
                const array = new Uint8Array(10);
                crypto.getRandomValues(array);
                const secretKey = Array.from(array, byte => characters[byte % characters.length]).join('');
                await client.setSecretKey(secretKey);
                setStatusText('Pairing device with your account...');
                await Client.pairDevice(session.access_token, idCard, secretKey);
                await refreshDevices();
            }
            setStatusText('Setup complete!');
            navigate('/');
        } catch (e: any) {
            console.error('Error during setup:', e);
            setError(e.message || 'An unknown error occurred during setup.');
            setStep('configure');
        }
    };

    const backToWelcome = () => setStep('welcome');

    return {
        step, statusText, isConnecting, selectedDevice, error, ssid, password, resetSecretKey,
        setSSID, setPassword, setResetSecretKey, handleScan, handleSetup, backToWelcome
    };
};

const WelcomeStep = ({onScan}: { onScan: () => void }) => (
    <div className="text-center">
        <Button size="lg" onClick={onScan}>
            <TbBluetooth className="mr-2 h-4 w-4"/> Scan for Device
        </Button>
    </div>
);

const FinishingStep = ({statusText}: { statusText: string }) => (
    <div className="flex flex-col items-center gap-4">
        <TbLoader className="h-8 w-8 animate-spin text-primary"/>
        <p className="text-muted-foreground">{statusText}</p>
    </div>
);

const ConfigureStep = (props: {
    isConnecting: boolean;
    deviceName: string | null | undefined;
    ssid: string;
    password: string;
    resetSecretKey: boolean;
    onSsidChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onResetKeyChange: (value: boolean) => void;
    onSetup: () => void;
    onBack: () => void;
}) => {
    if (props.isConnecting) {
        return (
            <div className="flex flex-col items-center gap-4">
                <TbLoader className="h-8 w-8 animate-spin text-primary"/>
                <p className="text-muted-foreground">Connecting to {props.deviceName}...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="text-sm text-muted-foreground">
                <p>Device <span className="font-semibold">{props.deviceName}</span> is connected.</p>
                <p className="mt-2">Optionally, enter your Wi-Fi credentials. If left blank, the device will use its
                    previously saved network.</p>
            </div>
            <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="ssid">SSID</Label>
                <Input id="ssid" placeholder="Your Wi-Fi Name" value={props.ssid}
                       onChange={(e) => props.onSsidChange(e.target.value)}/>
            </div>
            <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="Your Wi-Fi Password" value={props.password}
                       onChange={(e) => props.onPasswordChange(e.target.value)}/>
            </div>
            <div className="items-top flex space-x-2">
                <Checkbox id="resetSecretKey" checked={props.resetSecretKey}
                          onCheckedChange={(checked) => props.onResetKeyChange(!!checked)}/>
                <div className="grid gap-1.5 leading-none">
                    <label htmlFor="resetSecretKey"
                           className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Reset Secret Key
                    </label>
                    <p className="text-sm text-muted-foreground">
                        A new secret key will be generated for your device to ensure a secure connection.
                    </p>
                </div>
            </div>
            <div className="flex justify-between">
                <Button variant="outline" onClick={props.onBack}>Back</Button>
                <Button onClick={props.onSetup}><TbWifi className="mr-2 h-4 w-4"/> Finish Setup</Button>
            </div>
        </div>
    );
};

const DeviceSetup: React.FC = () => {
    const {
        step, statusText, isConnecting, selectedDevice, error, ssid, password, resetSecretKey,
        setSSID, setPassword, setResetSecretKey, handleScan, handleSetup, backToWelcome
    } = useDeviceSetup();

    const renderContent = () => {
        switch (step) {
            case 'welcome':
                return <WelcomeStep onScan={handleScan}/>;
            case 'finishing':
                return <FinishingStep statusText={statusText}/>;
            case 'configure':
                return <ConfigureStep
                    isConnecting={isConnecting}
                    deviceName={selectedDevice?.name}
                    ssid={ssid}
                    password={password}
                    resetSecretKey={resetSecretKey}
                    onSsidChange={setSSID}
                    onPasswordChange={setPassword}
                    onResetKeyChange={setResetSecretKey}
                    onSetup={handleSetup}
                    onBack={backToWelcome}
                />;
        }
    };

    const descriptions: Record<SetupStep, string> = {
        welcome: 'Start by scanning for your device.',
        configure: 'Connect your device to the internet and finish setup.',
        finishing: 'Finalizing setup...'
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle className="text-3xl font-bold">Set Up New Device</CardTitle>
                    <CardDescription>{descriptions[step]}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {renderContent()}
                </CardContent>
            </Card>
        </div>
    );
};

export default DeviceSetup;