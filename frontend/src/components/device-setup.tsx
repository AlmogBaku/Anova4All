import React, {useState} from 'react';
import {useNavigate} from "react-router-dom";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {useAuth} from "@/contexts/auth";
import {Client} from "@/lib/client";
import {useAnova} from "@/contexts/anova";

const DeviceSetup: React.FC = () => {
    const [deviceId, setDeviceId] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPairing, setIsPairing] = useState(false);
    const {session} = useAuth();
    const {refreshDevices} = useAnova();
    const navigate = useNavigate();

    const handlePairDevice = async () => {
        if (!session?.access_token) {
            setError("You must be logged in to pair a device.");
            return;
        }

        setError(null);
        setIsPairing(true);

        try {
            await Client.pairDevice(session.access_token, deviceId, secretKey);
            await refreshDevices();
            navigate('/');
        } catch (e: any) {
            setError(e.message || 'Failed to pair device. Please check the ID and secret key.');
        } finally {
            setIsPairing(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle className="text-3xl font-bold">Pair New Device</CardTitle>
                    <CardDescription>Enter the Device ID and Secret Key to pair it with your account.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="deviceId">Device ID</Label>
                        <Input id="deviceId" placeholder="Device ID" value={deviceId}
                               onChange={(e) => setDeviceId(e.target.value)}/>
                    </div>
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="secretKey">Secret Key</Label>
                        <Input id="secretKey" type="password" placeholder="Secret Key" value={secretKey}
                               onChange={(e) => setSecretKey(e.target.value)}/>
                    </div>
                    <Button
                        size="lg"
                        onClick={handlePairDevice}
                        disabled={isPairing || !deviceId || !secretKey}
                    >
                        {isPairing ? 'Pairing...' : 'Pair Device'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};

export default DeviceSetup;