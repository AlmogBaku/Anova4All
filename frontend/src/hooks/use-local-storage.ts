import {Dispatch, SetStateAction, useEffect, useState} from "react";

export const getStorageValue = <T>(key: string, defaultValue: T): T => {
    // getting stored value
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : defaultValue;
}

export const useLocalStorage = <T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] => {
    const [value, setValue] = useState<T>(() => {
        return getStorageValue<T>(key, defaultValue);
    });

    useEffect(() => {
        // storing input name
        localStorage.setItem(key, JSON.stringify(value));
    }, [key, value]);

    return [value, setValue];
};