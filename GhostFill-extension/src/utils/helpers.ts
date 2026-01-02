// Utility Helpers

/**
 * Generate a unique ID
 */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a random string of specified length
 */
export function generateRandomString(length: number, charset: string): string {
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);

    let result = '';
    for (let i = 0; i < length; i++) {
        result += charset[array[i] % charset.length];
    }
    return result;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Merge objects deeply
 */
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const targetValue = result[key as keyof T];
            const sourceValue = source[key as keyof T];

            if (isObject(targetValue) && isObject(sourceValue)) {
                result[key as keyof T] = deepMerge(targetValue as object, sourceValue as object) as T[keyof T];
            } else if (sourceValue !== undefined) {
                result[key as keyof T] = sourceValue as T[keyof T];
            }
        }
    }

    return result;
}

/**
 * Check if value is a plain object
 */
export function isObject(value: unknown): value is object {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxAttempts - 1) {
                await sleep(baseDelay * Math.pow(2, attempt));
            }
        }
    }

    throw lastError;
}

/**
 * Format relative time
 */
export function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (seconds > 10) return `${seconds}s ago`;
    return 'just now';
}

/**
 * Format date/time
 */
export function formatDateTime(timestamp: number | string): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Strip HTML tags from string
 */
export function stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Fallback for content scripts
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            return true;
        } finally {
            document.body.removeChild(textArea);
        }
    }
}

/**
 * Parse email address
 */
export function parseEmail(email: string): { login: string; domain: string } | null {
    const match = email.match(/^([^@]+)@(.+)$/);
    if (!match) return null;
    return { login: match[1], domain: match[2] };
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Get domain from URL
 */
export function getDomain(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return '';
    }
}

/**
 * Generate unique CSS selector for element
 */
export function getUniqueSelector(element: Element): string {
    if (element.id) {
        return `#${CSS.escape(element.id)}`;
    }

    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();

        if (current.className) {
            const classes = current.className.split(/\s+/).filter(Boolean).slice(0, 2);
            selector += classes.map(c => `.${CSS.escape(c)}`).join('');
        }

        const siblings = current.parentElement?.children;
        if (siblings && siblings.length > 1) {
            const index = Array.from(siblings).indexOf(current) + 1;
            selector += `:nth-child(${index})`;
        }

        path.unshift(selector);
        current = current.parentElement;
    }

    return path.join(' > ');
}

/**
 * Check if element is visible
 */
export function isElementVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
    );
}

/**
 * Get element's computed label
 */
export function getElementLabel(input: HTMLInputElement | HTMLTextAreaElement): string {
    // Check for explicit label
    if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) return label.textContent?.trim() || '';
    }

    // Check for implicit label (wrapped)
    const parentLabel = input.closest('label');
    if (parentLabel) {
        return parentLabel.textContent?.replace(input.value, '').trim() || '';
    }

    // Check for aria-label
    if (input.ariaLabel) return input.ariaLabel;

    // Check for aria-labelledby
    const labelledBy = input.getAttribute('aria-labelledby');
    if (labelledBy) {
        const labelElement = document.getElementById(labelledBy);
        if (labelElement) return labelElement.textContent?.trim() || '';
    }

    // Check for placeholder
    if (input.placeholder) return input.placeholder;

    // Check for nearby text
    const prevSibling = input.previousElementSibling;
    if (prevSibling && prevSibling.textContent) {
        return prevSibling.textContent.trim();
    }

    return '';
}
