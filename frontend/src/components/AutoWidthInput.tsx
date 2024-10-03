import React, {useEffect, useRef, useState} from 'react';

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
            setInputWidth(measureRef.current.offsetWidth);
        }
    }, [inputValue]);

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
            className={`py-1 px-0 focus:outline-none focus:ring-blue-500 ${className}`}
            style={{width: `${inputWidth}px`}}
            placeholder={props.placeholder}
            {...props}
        />
        <span
            ref={measureRef}
            className="absolute invisible whitespace-pre py-1"
        >
        {inputValue || props.placeholder || ''}
      </span>
    </div>;
};

export default AutoWidthInput;