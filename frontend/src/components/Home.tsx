import React from 'react';
import {TbAlertCircle, TbTemperature, TbTemperatureCelsius, TbTemperatureFahrenheit} from 'react-icons/tb';
import {useAnova} from "../contexts/Anova.tsx";
import {DeviceStatus, TemperatureUnit} from "../client";
import TemperatureControl from './TemperatureControl';
import TimerControl from './TimerControl';

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
        <div className="flex flex-col items-center justify-center min-h-screen">
            {stateError && (
                <div className="alert alert-warning mb-2">
                    <TbAlertCircle className="text-2xl mr-2"/>
                    {`Device is in ${anovaState?.status} state`}
                </div>
            )}
            <div className="bg-base-100 shadow-xl rounded-lg p-8 m-4 w-full max-w-md">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-2xl font-bold">Current</h2>
                        <p className="text-4xl">
                            {anovaState?.current_temperature?.toFixed(1)}
                            <span className="inline-block">{unitSymbol}</span>
                        </p>
                    </div>
                    <TbTemperature className="text-6xl text-primary"/>
                </div>
                <TemperatureControl/>
                <TimerControl/>
                <button
                    className={`btn btn-lg w-full ${running ? 'btn-error' : 'btn-success'}`}
                    onClick={handleStartStop}
                >
                    {running ? 'Stop Cooking' : 'Start Cooking'}
                </button>
            </div>
        </div>
    );
};

export default Home;