import React, {useEffect, useRef, useState} from 'react';
import {cn} from "@/lib/utils.ts";

export type AutoWidthInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
    onChange?: (value: string) => void;
    type?: string;
};

const AutoWidthInput: React.FC<AutoWidthInputProps> = ({
                                                           className = "",
                                                           value: propValue,
                                                           onChange,
                                                           ...props
                                                       }) => {
    const [inputValue, setInputValue] = useState(propValue?.toString() || '');
    const [inputWidth, setInputWidth] = useState(0);
    const measureRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (measureRef.current) {
            setInputWidth(measureRef.current.offsetWidth + 2);
        }
    }, [inputValue, className]);

    useEffect(() => {
        if (propValue !== undefined) {
            setInputValue(propValue.toString());
        }
    }, [propValue]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        onChange?.(newValue);
    };

    return <div className="relative inline-block">
        <input
            type={props.type || 'text'}
            value={inputValue}
            onChange={handleInputChange}
            className={cn(
                "h-auto border-0 bg-transparent p-0 shadow-none focus:outline-none",
                className
            )}
            style={{width: `${inputWidth}px`}}
            placeholder={props.placeholder}
            {...props}
        />
        <span
            ref={measureRef}
            className={cn("absolute invisible whitespace-pre", className)}
        >
        {inputValue || props.placeholder || ' '}
      </span>
    </div>;
};

export default AutoWidthInput;