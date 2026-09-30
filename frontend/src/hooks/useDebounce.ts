import {useEffect, useMemo, useRef} from 'react';

// Returns a debounced version of `func` that stays stable across renders, so frequent
// re-renders (e.g. SSE state updates) don't reset the timer and fire every keystroke.
// eslint-disable-next-line
export const useDebounce = <F extends (...args: any[]) => any>(
    func: F,
    wait: number
) => {
    const funcRef = useRef(func);
    useEffect(() => {
        funcRef.current = func;
    }, [func]);

    return useMemo(() => {
        let timeout: ReturnType<typeof setTimeout> | null = null;

        return (...args: Parameters<F>): Promise<ReturnType<F>> => {
            return new Promise((resolve) => {
                if (timeout) {
                    clearTimeout(timeout);
                }

                timeout = setTimeout(() => {
                    resolve(funcRef.current(...args));
                }, wait);
            });
        };
    }, [wait]);
};
