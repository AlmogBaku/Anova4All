import {useMemo} from 'react';

// eslint-disable-next-line
export const useDebounce = <F extends (...args: any[]) => any>(
    func: F,
    wait: number
) => {
    return useMemo(() => {
        let timeout: ReturnType<typeof setTimeout> | null = null;

        return (...args: Parameters<F>): Promise<ReturnType<F>> => {
            return new Promise((resolve) => {
                if (timeout) {
                    clearTimeout(timeout);
                }

                timeout = setTimeout(() => {
                    resolve(func(...args));
                }, wait);
            });
        };
    }, [func, wait]);
};