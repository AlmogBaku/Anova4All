import React, {useEffect, useState} from 'react';
import {TbClock} from 'react-icons/tb';
import DurationInput from "@/components/duration-input.tsx";
import {InputControl} from "@/components/input-control.tsx";
import {useDebounce} from "@/hooks/use-debounce.ts";
import {useAnova} from "@/contexts/anova.tsx";
import {DeviceStatus} from "@/lib/client";

const TimerControl: React.FC = () => {
    const {selectedDevice, state: anovaState} = useAnova();
    const [localTimer, setLocalTimer] = useState<number>(0);
    const [error, setError] = useState<string | undefined>(undefined);

    useEffect(() => {
        setLocalTimer(anovaState?.timer_value || 0);
    }, [anovaState?.timer_value]);

    const debouncedSetTimer = useDebounce(async (value: number) => {
        if (value < 0 || value > 6000) {
            setError("Timer must be between 0 and 6000 minutes");
            return;
        }
        setError(undefined);
        await selectedDevice!.setTimer(value);
        if (value === 0) {
            await selectedDevice!.stopTimer();
            await selectedDevice!.clearAlarm();
        } else {
            await selectedDevice!.startTimer();
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
            htmlFor="timer-input"
        >
            <DurationInput
                id="timer-input"
                value={localTimer}
                className="text-4xl w-32"
                onChange={handleTimerChange}
                readOnly={anovaState?.status !== DeviceStatus.Running}
            />
        </InputControl>
    );
};

export default TimerControl;