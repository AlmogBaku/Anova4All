import React, {useEffect, useState} from 'react';
import {TbTargetArrow, TbTemperatureCelsius, TbTemperatureFahrenheit} from 'react-icons/tb';
import {TemperatureUnit} from "@/lib/client";
import {InputControl} from "@/components/input-control.tsx";
import AutoWidthInput from "@/components/auto-width-input.tsx";
import {useDebounce} from "@/hooks/use-debounce.ts";
import {useAnova} from "@/contexts/anova.tsx";

const TemperatureControl: React.FC = () => {
    const {selectedDevice, state: anovaState} = useAnova();
    const unit = anovaState?.unit;

    const [localTemp, setLocalTemp] = useState<string>("");
    const [error, setError] = useState<string | undefined>(undefined);

    useEffect(() => {
        setLocalTemp(anovaState?.target_temperature?.toFixed(1) || "");
    }, [setLocalTemp, anovaState?.target_temperature]);

    const debouncedSetTemp = useDebounce(async (value: number) => {
        const error = validateTemperature(value);
        if (error) {
            setError(error);
            return;
        }
        await selectedDevice!.setTargetTemperature(value);
    }, 500);

    const handleTempChange = (value: string) => {
        setLocalTemp(value);
        const numValue = parseFloat(value.trim());
        if (!isNaN(numValue)) {
            debouncedSetTemp(numValue);
        }
    };

    const validateTemperature = (value: number): string | null => {
        const isValid = unit === TemperatureUnit.Fahrenheit
            ? value >= 77 && value <= 211
            : value >= 25 && value <= 100;

        if (!isValid) {
            return `Temperature must be between ${unit === TemperatureUnit.Fahrenheit ? '77°F and 211°F' : '25°C and 100°C'}`;
        }

        return null;
    };

    const unitSymbol = unit === TemperatureUnit.Celsius ? <TbTemperatureCelsius/> : <TbTemperatureFahrenheit/>;

    return (
        <InputControl
            title="Set"
            icon={<TbTargetArrow className="text-6xl text-primary"/>}
            error={error}
            htmlFor="temperature-input"
        >
            <AutoWidthInput
                id="temperature-input"
                value={localTemp}
                className="text-4xl"
                onChange={handleTempChange}
            />
            <span className="text-4xl text-muted-foreground">{unitSymbol}</span>
        </InputControl>
    );
};

export default TemperatureControl;