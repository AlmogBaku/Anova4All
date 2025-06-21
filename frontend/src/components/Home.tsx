import React from 'react';
import {TbAlertCircle, TbTemperature, TbTemperatureCelsius, TbTemperatureFahrenheit} from 'react-icons/tb';
import {useAnova} from "../contexts/Anova.tsx";
import {DeviceStatus, TemperatureUnit} from "../client";
import TemperatureControl from './TemperatureControl';
import TimerControl from './TimerControl';
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert.tsx";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Button} from "@/components/ui/button.tsx";

const Home: React.FC = () => {
    const {device, state: anovaState} = useAnova();
    const running = anovaState?.status === DeviceStatus.Running

    const handleStartStop = async () => {
        if (!device) return;
        if (running) {
            await device.stopCooking();
            await device.clearAlarm()
        } else {
            await device.startCooking();
        }
    };

    const stateError = anovaState?.status === DeviceStatus.LowWater ||
        anovaState?.status === DeviceStatus.PowerLoss ||
        anovaState?.status === DeviceStatus.HeaterError;

    const unitSymbol = anovaState?.unit === TemperatureUnit.Celsius ? <TbTemperatureCelsius/> :
        <TbTemperatureFahrenheit/>;

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
                            <CardTitle>Current</CardTitle>
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
                    >
                        {running ? 'Stop Cooking' : 'Start Cooking'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};

export default Home;