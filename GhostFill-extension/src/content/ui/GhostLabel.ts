// Inline CSS for reliability given current webpack config uncertainty
// We use a constant string to define styles for the Shadow DOM
// ULTRA PREMIUM LIQUID GLASS (Mini version for input fields)
const STYLES = `
:host {
    display: block;
    position: absolute;
    z-index: 2147483647; /* Max z-index */
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    pointer-events: auto;
    width: 28px; /* Slightly larger for touch targets */
    height: 28px;
    --glass-bg: rgba(255, 255, 255, 0.6);
    --glass-border: rgba(255, 255, 255, 0.4);
    --primary: #6366F1;
}

.ghost-icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 8px; /* Squircle */
    
    /* LIQUID GLASS MINI */
    background: var(--glass-bg);
    backdrop-filter: blur(12px) saturate(160%);
    -webkit-backdrop-filter: blur(12px) saturate(160%);
    border: 1px solid var(--glass-border);
    box-shadow: 
        0 2px 5px rgba(0, 0, 0, 0.05),
        inset 0 0 0 1px rgba(255, 255, 255, 0.3);

    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); /* Bouncy spring */
    overflow: hidden;
    opacity: 0.6; /* Unobtrusive by default */
}

/* Hover State - Wake up */
.ghost-icon-container:hover {
    transform: scale(1.15) translateY(-1px);
    opacity: 1;
    background: rgba(255, 255, 255, 0.85);
    border-color: rgba(99, 102, 241, 0.3);
    box-shadow: 
        0 8px 16px rgba(99, 102, 241, 0.15),
        0 0 0 2px rgba(99, 102, 241, 0.1);
}

.ghost-icon-container:active {
    transform: scale(0.9);
}

.ghost-svg {
    width: 18px;
    height: 18px;
    color: var(--primary);
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
    transition: transform 0.4s ease;
}

.ghost-icon-container:hover .ghost-svg {
    transform: rotate(10deg) scale(1.1);
}

/* Dark mode support if site is dark */
@media (prefers-color-scheme: dark) {
    :host {
        --glass-bg: rgba(30, 41, 59, 0.6);
        --glass-border: rgba(255, 255, 255, 0.1);
    }
    
    .ghost-icon-container:hover {
        background: rgba(40, 50, 70, 0.9);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
    }
}
`;

export class GhostLabel extends HTMLElement {
    private root: ShadowRoot;
    private container: HTMLElement | null = null;
    private inputElement: HTMLInputElement | null = null;
    private resizeObserver: ResizeObserver | null = null;

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
        this.updatePosition();
    }

    disconnectedCallback() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }

    /**
     * Attach this ghost icon to a specific input element
     */
    attachToAttribute(input: HTMLInputElement, onClick: () => void) {
        this.inputElement = input;

        // Handle click
        this.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault(); // Prevent focus theft issues
            onClick();
        });

        // Observe input resizing/moving
        this.resizeObserver = new ResizeObserver(() => {
            this.updatePosition();
        });
        this.resizeObserver.observe(input);

        // Also listen to window resize
        window.addEventListener('resize', this.updatePosition.bind(this));

        // Initial pos
        this.updatePosition();
    }

    updatePosition() {
        if (!this.inputElement) return;

        const rect = this.inputElement.getBoundingClientRect();

        // Check if input is still visible
        if (rect.width === 0 || rect.height === 0 || this.inputElement.offsetParent === null) {
            this.style.display = 'none';
            return;
        } else {
            this.style.display = 'block';
        }

        // Position inside the input, right side
        // We use absolute positioning relative to the document (or nearest relative parent if we injected there)
        // Best approach: Use fixed or absolute coordinates matching the input's current visual pos + scroll

        // NOTE: We usually inject this into `document.body` or a dedicated wrapper to avoid
        // `overflow: hidden` from the input's parent clipping our cool shadow.

        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;

        const top = rect.top + scrollY + (rect.height / 2) - 12; // Center vertically (24px height)
        const left = rect.right + scrollX - 32; // 32px from right edge

        this.style.top = `${top}px`;
        this.style.left = `${left}px`;
    }

    render() {
        // Create style
        const style = document.createElement('style');
        style.textContent = STYLES;

        // Container
        this.container = document.createElement('div');
        this.container.className = 'ghost-icon-container';

        // Icon (Ghost SVG)
        this.container.innerHTML = `
            <svg class="ghost-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />
            </svg>
        `;

        this.root.appendChild(style);
        this.root.appendChild(this.container);
    }
}

// Register web component (with defensive check for edge cases)
if (typeof customElements !== 'undefined' && customElements && !customElements.get('ghost-label')) {
    try {
        customElements.define('ghost-label', GhostLabel);
    } catch (e) {
        // Ignore if registration fails (e.g., already defined in another context)
        console.debug('[GhostFill] GhostLabel registration skipped:', e);
    }
}
