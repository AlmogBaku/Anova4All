import React, {useEffect, useState} from 'react';
import {cn} from "@/lib/utils.ts";

interface DurationInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    onChange?: (minutes: number) => void;
    value?: number;
}

const DurationInput: React.FC<DurationInputProps> = ({
                                                         onChange,
                                                         value,
                                                         className,
                                                         ...props
                                                     }) => {
    const [digits, setDigits] = useState<string>(value ? value.toString() : '');

    useEffect(() => {
        if (value !== undefined) {
            setDigits(value.toString().padStart(4, '0'));
        }
    }, [value]);

    const formatDuration = (rawDigits: string): string => {
        // Remove non-digit characters
        const cleanedDigits = rawDigits.replace(/\D/g, '');

        // Limit to max 4 digits
        const limitedDigits = cleanedDigits.slice(-4);

        // Pad with zeros on the left if less than 4 digits
        const paddedDigits = limitedDigits.padStart(4, '0');

        // Split into hours and minutes
        const hours = paddedDigits.slice(0, 2);
        const minutes = paddedDigits.slice(2);

        return `${hours}:${minutes}`;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const input = e.target.value
            .replace(':', '')
            .replace(/\D/g, '')
            .slice(-4)
            .padStart(4, '0');

        // Update the digits state
        setDigits(input);

        if (onChange) {
            // Parse the input as an integer
            const [hours, minutes] = [input.slice(0, 2), input.slice(2)];
            const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
            onChange(totalMinutes);
        }
    };
    const displayedValue = formatDuration(digits);

    return <input
        type="tel"
        value={displayedValue}
        onChange={handleInputChange}
        inputMode="numeric"
        className={cn(
            "h-auto border-0 bg-transparent p-0 shadow-none focus:outline-none",
            className
        )}
        {...props}
    />;
}
export default DurationInput;
