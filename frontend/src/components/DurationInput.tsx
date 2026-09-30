import React, {useEffect, useState} from 'react';

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
    // `value` is total minutes; `digits` is the HHMM representation shown in the input.
    const minutesToDigits = (minutes: number): string => {
        const hours = Math.min(Math.floor(minutes / 60), 99);
        return `${hours.toString().padStart(2, '0')}${(minutes % 60).toString().padStart(2, '0')}`;
    };

    const [digits, setDigits] = useState<string>(minutesToDigits(value || 0));

    useEffect(() => {
        if (value !== undefined) {
            setDigits(minutesToDigits(value));
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
        className={`py-1 px-0 focus:outline-none focus:ring-blue-500 ${className}`}
        {...props}
    />;
}
export default DurationInput;
