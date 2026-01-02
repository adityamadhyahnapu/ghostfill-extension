// Debounce and Throttle Utilities

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
    immediate: boolean = false
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    return function (this: unknown, ...args: Parameters<T>): void {
        const callNow = immediate && !timeout;

        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
            timeout = null;
            if (!immediate) {
                func.apply(this, args);
            }
        }, wait);

        if (callNow) {
            func.apply(this, args);
        }
    };
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let lastTime = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    return function (this: unknown, ...args: Parameters<T>): void {
        const now = Date.now();
        const remaining = wait - (now - lastTime);

        if (remaining <= 0 || remaining > wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            lastTime = now;
            func.apply(this, args);
        } else if (!timeout) {
            timeout = setTimeout(() => {
                lastTime = Date.now();
                timeout = null;
                func.apply(this, args);
            }, remaining);
        }
    };
}

/**
 * Creates a function that is restricted to invoking func once.
 * Repeat calls to the function return the value of the first invocation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function once<T extends (...args: any[]) => any>(
    func: T
): (...args: Parameters<T>) => ReturnType<T> | undefined {
    let called = false;
    let result: ReturnType<T> | undefined;

    return function (this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
        if (!called) {
            called = true;
            result = func.apply(this, args) as ReturnType<T>;
        }
        return result;
    };
}

/**
 * Creates a cancelable debounced function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cancelableDebounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): {
    (...args: Parameters<T>): void;
    cancel: () => void;
    flush: () => void;
} {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let lastArgs: Parameters<T> | null = null;
    let lastThis: unknown = null;

    function invokeFunc(): void {
        if (lastArgs) {
            func.apply(lastThis, lastArgs);
            lastArgs = null;
            lastThis = null;
        }
    }

    const debounced = function (this: unknown, ...args: Parameters<T>): void {
        lastArgs = args;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        lastThis = this;

        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
            timeout = null;
            invokeFunc();
        }, wait);
    };

    debounced.cancel = (): void => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
        lastArgs = null;
        lastThis = null;
    };

    debounced.flush = (): void => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
            invokeFunc();
        }
    };

    return debounced;
}
