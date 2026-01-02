import { createLogger } from '../utils/logger';

const log = createLogger('Offscreen');

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'VERIFY_LINK') {
        handleVerification(message.payload)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
    }
});

async function handleVerification(payload: { url: string; timeout?: number }): Promise<{ success: boolean; cookies?: any[] }> {
    const { url, timeout = 30000 } = payload;
    log.info('Starting telepathic verification', { url });

    return new Promise((resolve, reject) => {
        // Create an iframe to load the URL
        // We use an iframe so we can tear it down easily and it effectively "isolates" the navigation
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        let resolved = false;

        // Set safety timeout
        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error('Verification timed out'));
            }
        }, timeout);

        function cleanup() {
            if (iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
            }
            clearTimeout(timer);
        }

        // We can't access the iframe's content directly if it's cross-origin (which it will be).
        // However, we can monitor cookies or wait for a specific duration.
        // For magic links, usually loading the page is enough to set the cookie.

        // Strategy: Wait for the iframe to load, then wait a bit more for JS execution,
        // then define success.

        iframe.onload = async () => {
            log.debug('Verification page loaded, waiting for JS execution...');

            // Wait for JS to run (e.g., 5 seconds)
            setTimeout(async () => {
                if (resolved) return;

                // Success! We assume if it loaded without erroring out, it worked.
                // The main purpose is to let the browser hit the endpoint and run scripts.

                // We just return success. The background script can handle state updates.

                log.info('Telepathic verification successful');
                resolved = true;
                cleanup();
                resolve({ success: true });
            }, 5000); // 5 seconds wait for hydration/redirects
        };


        iframe.onerror = () => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error('Failed to load verification URL'));
            }
        };
    });
}
