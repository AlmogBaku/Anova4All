import React, {useEffect, useState} from 'react';
import {TbClock} from 'react-icons/tb';
import DurationInput from "./DurationInput.tsx";
import {InputControl} from './InputControl';
import {useDebounce} from "../hooks/useDebounce.ts";
import {useAnova} from "../contexts/Anova.tsx";
import {DeviceStatus} from "../client";

const TimerControl: React.FC = () => {
    const {device, state: state} = useAnova();
    const [localTimer, setLocalTimer] = useState<number>(0);
    const [error, setError] = useState<string | undefined>(undefined);

    useEffect(() => {
        setLocalTimer(state?.timer_value || 0);
    }, [state?.timer_value]);

    const debouncedSetTimer = useDebounce(async (value: number) => {
        if (value < 0 || value > 6000) {
            setError("Timer must be between 0 and 6000 seconds");
            return;
        }
        setError(undefined);
        await device!.setTimer(value);
        if (value === 0) {
            await device!.stopTimer();
        } else {
            await device!.startTimer();
        }
    }, 500);

    const handleTimerChange = (value: number) => {
        setLocalTimer(value);
        debouncedSetTimer(value).then(() => {
        });
    };

    return (
        <InputControl
            title="Timer"
            icon={<TbClock className="text-6xl text-primary"/>}
            error={error}
        >
            <DurationInput
                value={localTimer}
                className="text-4xl w-32"
                onChange={handleTimerChange}
                readOnly={state?.status !== DeviceStatus.Running}
            />
        </InputControl>
    );
};

export default TimerControl;