/**
 * @file Dedicated Grafana iframe wrapper page script.
 * Intercepts selected keyboard/history behaviors and proxies item-link clicks
 * back to the parent aggregator UI via postMessage.
 */

type GrafanaInnerWindow = Window & {
    MutationObserver?: typeof MutationObserver;
    Mousetrap?: {
        unbind?: (shortcut: string) => void;
        unbindGlobal?: (shortcut: string) => void;
    };
};
type PatchedHistory = History & {
    __disableHistory?: () => void;
};

const params = new URLSearchParams(window.location.search);
const srcParam = params.get('src');
const initialTarget = srcParam ? decodeURIComponent(srcParam) : '';
const themeParam = params.get('theme') || '';
const iframe = document.getElementById('grafana-embed') as HTMLIFrameElement | null;

let detachEscHandlers: Array<() => void> = [];
let detachItemLinkHandlers: Array<() => void> = [];

/**
 * Renders a blank themed document inside the inner iframe so the browser does not
 * flash the default white `about:blank` page before Grafana is loaded.
 *
 */
const applyPlaceholder = (theme: 'dark' | 'light') => {
    if (!iframe) {
        return;
    }
    const background = getComputedStyle(document.documentElement)
        .getPropertyValue('--frame-background')
        .trim();
    const colorScheme = theme === 'dark' ? 'dark' : 'light';
    iframe.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:${background};color-scheme:${colorScheme};overflow:hidden;}</style></head><body></body></html>`;
};

/**
 * Prevents Escape key handling inside Grafana and nested same-origin frames
 * so parent UI dialogs/search state are not unintentionally affected.
 *
 */
const bindEscGuard = (targetWindow: GrafanaInnerWindow | null | undefined) => {
    detachEscHandlers.forEach((detach) => {
        try {
            detach();
        } catch (error) {
            // Ignore stale handlers.
        }
    });
    detachEscHandlers = [];
    if (!targetWindow) {
        return;
    }

    const boundWindows = new WeakSet<GrafanaInnerWindow>();
    const trackedFrames = new WeakSet<HTMLIFrameElement>();

    /**
     * Captures Escape to prevent Grafana shortcuts/dialogs from leaking outside the wrapper.
     */
    const stopEsc = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        }
    };

    /**
     * Recursively binds Escape interception to a same-origin window and nested iframes.
     *
     */
    const bindWindow = (windowRef: GrafanaInnerWindow | null | undefined) => {
        if (!windowRef?.addEventListener || boundWindows.has(windowRef)) {
            return;
        }
        boundWindows.add(windowRef);

        windowRef.addEventListener('keydown', stopEsc, true);
        windowRef.addEventListener('keyup', stopEsc, true);
        detachEscHandlers.push(() => {
            windowRef.removeEventListener('keydown', stopEsc, true);
            windowRef.removeEventListener('keyup', stopEsc, true);
        });

        try {
            const doc = windowRef.document;
            if (!doc?.querySelectorAll) {
                return;
            }
            const attachNestedFrames = () => {
                doc.querySelectorAll('iframe').forEach((childFrameEl) => {
                    const childFrame = childFrameEl as HTMLIFrameElement;
                    if (trackedFrames.has(childFrame)) {
                        return;
                    }
                    trackedFrames.add(childFrame);
                    const bindChild = () => {
                        try {
                            bindWindow(childFrame.contentWindow);
                        } catch (error) {
                            // Ignore cross-origin child frames.
                        }
                    };
                    childFrame.addEventListener('load', bindChild, true);
                    detachEscHandlers.push(() => {
                        childFrame.removeEventListener('load', bindChild, true);
                    });
                    bindChild();
                });
            };
            attachNestedFrames();
            const MutationObserverCtor = windowRef.MutationObserver;
            if (typeof MutationObserverCtor === 'function' && doc.documentElement) {
                const observer = new MutationObserverCtor(attachNestedFrames);
                observer.observe(doc.documentElement, {childList: true, subtree: true});
                detachEscHandlers.push(() => observer.disconnect());
            }
        } catch (error) {
            // Ignore cross-origin errors if Grafana embeds third-party frames.
        }
    };

    bindWindow(targetWindow);
};

/**
 * Intercepts item links rendered inside Grafana and forwards them to the parent app.
 *
 */
const bindItemLinkInterceptor = (targetWindow: GrafanaInnerWindow | null | undefined) => {
    detachItemLinkHandlers.forEach((detach) => {
        try {
            detach();
        } catch (error) {
            // Ignore stale handlers.
        }
    });
    detachItemLinkHandlers = [];
    if (!targetWindow) {
        return;
    }

    const boundWindows = new WeakSet<GrafanaInnerWindow>();
    const trackedFrames = new WeakSet<HTMLIFrameElement>();

    /**
     * Emits a normalized item-link click event to the parent aggregator application.
     */
    const emitItemLinkClick = (href: string) => {
        if (href.trim() === '') {
            return;
        }
        let parsed: URL;
        try {
            parsed = new URL(href, window.location.href);
        } catch (error) {
            return;
        }
        const match = parsed.pathname.match(/\/item\/([^/]+)\/?$/);
        if (!match) {
            return;
        }
        const itemId = decodeURIComponent(match[1]);
        window.parent?.postMessage(
            {
                type: 'grafana-item-link-click',
                href: parsed.toString(),
                itemId,
            },
            window.location.origin,
        );
    };

    /**
     * Recursively binds click interception to a same-origin window and nested iframes.
     *
     */
    const bindWindow = (windowRef: GrafanaInnerWindow | null | undefined) => {
        if (!windowRef?.addEventListener || boundWindows.has(windowRef)) {
            return;
        }
        boundWindows.add(windowRef);

        /**
         * Captures anchor clicks to rewrite Grafana item links into parent app navigation.
         */
        const onClickCapture = (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (!target?.closest) {
                return;
            }
            const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
            if (!anchor) {
                return;
            }
            const href = anchor.getAttribute('href') || anchor.href;
            if (href.trim() === '') {
                return;
            }
            let parsed: URL;
            try {
                parsed = new URL(href, windowRef.location.href);
            } catch (error) {
                return;
            }
            if (!/\/item\/[^/]+\/?$/.test(parsed.pathname)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
            emitItemLinkClick(parsed.toString());
        };

        windowRef.addEventListener('click', onClickCapture, true);
        detachItemLinkHandlers.push(() => {
            windowRef.removeEventListener('click', onClickCapture, true);
        });

        try {
            const doc = windowRef.document;
            if (!doc?.querySelectorAll) {
                return;
            }
            const attachNestedFrames = () => {
                doc.querySelectorAll('iframe').forEach((childFrameEl) => {
                    const childFrame = childFrameEl as HTMLIFrameElement;
                    if (trackedFrames.has(childFrame)) {
                        return;
                    }
                    trackedFrames.add(childFrame);
                    const bindChild = () => {
                        try {
                            bindWindow(childFrame.contentWindow);
                        } catch (error) {
                            // Ignore cross-origin child frames.
                        }
                    };
                    childFrame.addEventListener('load', bindChild, true);
                    detachItemLinkHandlers.push(() => {
                        childFrame.removeEventListener('load', bindChild, true);
                    });
                    bindChild();
                });
            };
            attachNestedFrames();
            const MutationObserverCtor = windowRef.MutationObserver;
            if (typeof MutationObserverCtor === 'function' && doc.documentElement) {
                const observer = new MutationObserverCtor(attachNestedFrames);
                observer.observe(doc.documentElement, {childList: true, subtree: true});
                detachItemLinkHandlers.push(() => observer.disconnect());
            }
        } catch (error) {
            // Ignore cross-origin errors if Grafana embeds third-party frames.
        }
    };

    bindWindow(targetWindow);
};

/**
 * Applies wrapper background theme so Grafana transitions look consistent.
 */
const applyTheme = (value: string) => {
    const nextTheme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;
    document.body.dataset.theme = nextTheme;
    applyPlaceholder(nextTheme);
};

/**
 * Navigates the inner iframe to a Grafana URL while preserving wrapper lifecycle.
 */
const applyTarget = (target: string) => {
    if (!iframe) {
        return;
    }
    if (!target) {
        return;
    }
    try {
        if (iframe.contentWindow?.location?.replace) {
            iframe.contentWindow.location.replace(target);
        } else {
            iframe.src = target;
        }
    } catch (error) {
        iframe.src = target;
    }
};

/**
 * Initializes history/keyboard patches each time the inner Grafana iframe navigates.
 */
if (iframe) {
    iframe.addEventListener('load', () => {
        try {

        const innerWindow = iframe.contentWindow as GrafanaInnerWindow | null;
        if (!innerWindow?.history) {
            return;
        }
        bindEscGuard(innerWindow);
        bindItemLinkInterceptor(innerWindow);
        const history = innerWindow.history as PatchedHistory;
        if (history.__disableHistory) {
            return;
        }
        const originalPushState = history.pushState.bind(history);
        const originalReplaceState = history.replaceState.bind(history);
        history.pushState = (...args) => originalReplaceState(...args);
        history.replaceState = (...args) => originalReplaceState(...args);
        history.__disableHistory = () => {
            history.pushState = originalPushState;
            history.replaceState = originalReplaceState;
        };
        const mousetrap = innerWindow.Mousetrap;
        if (mousetrap) {
            if (typeof mousetrap.unbindGlobal === 'function') {
                mousetrap.unbindGlobal('esc');
            }
            if (typeof mousetrap.unbind === 'function') {
                mousetrap.unbind('esc');
            }
        }
        } catch (error) {
            // Ignore cross-origin errors if Grafana is hosted elsewhere.
        }
    });
}

applyTheme(themeParam);
if (initialTarget) {
    applyTarget(initialTarget);
}

/**
 * Receives commands from the parent app to update theme or target Grafana URL.
 */
window.addEventListener('message', (event: MessageEvent) => {
    if (!event.data) {
        return;
    }
    if (event.data.type === 'set-frame-theme') {
        applyTheme(event.data.theme);
        return;
    }
    if (event.data.type !== 'set-grafana-src') {
        return;
    }
    const nextSrc = event.data.src;
    if (typeof nextSrc !== 'string' || nextSrc.trim() === '') {
        return;
    }
    applyTarget(nextSrc);
});
