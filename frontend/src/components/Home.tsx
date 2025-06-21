import React from 'react';
import {
    TbAlertCircle,
    TbPlus,
    TbTemperature,
    TbTemperatureCelsius,
    TbTemperatureFahrenheit,
    TbTrash
} from 'react-icons/tb';
import {useAnova} from "@/contexts/anova.tsx";
import {DeviceStatus, TemperatureUnit} from "@/lib/client";
import TemperatureControl from '@/components/temperature-control.tsx';
import TimerControl from '@/components/timer-control.tsx';
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Button} from "@/components/ui/button.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectSeparator,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select.tsx";
import {useNavigate} from "react-router-dom";
import Welcome from "@/components/welcome.tsx";

const Home: React.FC = () => {
    const {selectedDevice, state: anovaState, devices, selectDevice, isLoading, unpairDevice} = useAnova();
    const navigate = useNavigate();
    const running = anovaState?.status === DeviceStatus.Running

    const handleStartStop = async () => {
        if (!selectedDevice) return;
        if (running) {
            await selectedDevice.stopCooking();
            await selectedDevice.clearAlarm()
        } else {
            await selectedDevice.startCooking();
        }
    };

    const handleSelectChange = (value: string) => {
        if (value === 'add-new-device') {
            navigate('/setup');
        } else {
            selectDevice(value);
        }
    };

    const handleUnpair = async (e: React.MouseEvent, deviceId: string) => {
        e.stopPropagation();
        try {
            await unpairDevice(deviceId);
        } catch (error) {
            console.error("Failed to unpair device", error);
        }
    };

    const stateError = anovaState?.status === DeviceStatus.LowWater ||
        anovaState?.status === DeviceStatus.PowerLoss ||
        anovaState?.status === DeviceStatus.HeaterError;

    const unitSymbol = anovaState?.unit === TemperatureUnit.Celsius ? <TbTemperatureCelsius/> :
        <TbTemperatureFahrenheit/>;

    if (isLoading) {
        return <div>Loading...</div>
    }

    if (devices.length === 0) {
        return <Welcome/>
    }

    return (
        <div className="flex flex-col items-center justify-center p-4">
            {stateError && (
                <Alert variant="destructive" className="mb-4 max-w-md w-full">
                    <TbAlertCircle className="h-4 w-4"/>
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                        {`Device is in ${anovaState?.status} state`}
                    </AlertDescription>
                </Alert>
            )}
            <Card className="w-full max-w-md">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>
                                <Select onValueChange={handleSelectChange} value={selectedDevice?.deviceId}>
                                    <SelectTrigger className="w-[220px]">
                                        <SelectValue placeholder="Select a device"/>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {devices.map(d => (
                                            <SelectItem key={d.id} value={d.id}>
                                                <div className="flex items-center justify-between w-full">
                                                    <span>{d.id}</span>
                                                    <TbTrash
                                                        className="h-4 w-4 text-muted-foreground hover:text-destructive"
                                                        onClick={(e) => handleUnpair(e, d.id)}
                                                    />
                                                </div>
                                            </SelectItem>
                                        ))}
                                        <SelectSeparator/>
                                        <SelectItem value="add-new-device">
                                            <div className="flex items-center">
                                                <TbPlus className="mr-2 h-4 w-4"/>
                                                <span>Add new device</span>
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </CardTitle>
                            <p className="text-4xl font-bold">
                                {anovaState?.current_temperature?.toFixed(1)}
                                <span className="inline-block ml-1">{unitSymbol}</span>
                            </p>
                        </div>
                        <TbTemperature className="text-6xl text-primary"/>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <TemperatureControl/>
                    <TimerControl/>
                    <Button
                        size="lg"
                        className="w-full"
                        variant={running ? 'destructive' : 'default'}
                        onClick={handleStartStop}
                        disabled={!selectedDevice}
                    >
                        {running ? 'Stop Cooking' : 'Start Cooking'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};

export default Home;