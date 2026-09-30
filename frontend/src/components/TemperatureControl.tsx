import React, {useEffect, useState} from 'react';
import {TbTargetArrow, TbTemperatureCelsius, TbTemperatureFahrenheit} from 'react-icons/tb';
import {TemperatureUnit} from "../client";
import {InputControl} from './InputControl';
import AutoWidthInput from "./AutoWidthInput.tsx";
import {useDebounce} from "../hooks/useDebounce.ts";
import {useAnova} from "../contexts/Anova.tsx";

const TemperatureControl: React.FC = () => {
    const {device, state: anovaState} = useAnova();
    const unit = anovaState?.unit;

    const [localTemp, setLocalTemp] = useState<string>("");
    const [editing, setEditing] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);

    // Don't overwrite what the user is typing with incoming device state.
    useEffect(() => {
        if (!editing) {
            setLocalTemp(anovaState?.target_temperature?.toFixed(1) || "");
        }
    }, [anovaState?.target_temperature, editing]);

    const debouncedSetTemp = useDebounce(async (value: number) => {
        const error = validateTemperature(value);
        if (error) {
            setError(error);
            return;
        }
        setError(undefined);
        try {
            await device!.setTargetTemperature(value);
        } catch (e) {
            console.error('Error setting temperature:', e);
            setError("Failed to set temperature");
        }
    }, 1000);

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
        >
            <AutoWidthInput
                value={localTemp}
                className="text-4xl"
                onChange={handleTempChange}
                onFocus={() => setEditing(true)}
                onBlur={() => setEditing(false)}
            />
            <span className="input-hint">{unitSymbol}</span>
        </InputControl>
    );
};

export default TemperatureControl;