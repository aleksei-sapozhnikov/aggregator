/**
 * @file Dedicated Grafana iframe wrapper page script.
 * Intercepts selected keyboard/history behaviors and proxies item-link clicks
 * back to the parent aggregator UI via postMessage.
 */

/**
 * @typedef {Window & {
 *   Mousetrap?: {
 *     unbind?: (shortcut: string) => void,
 *     unbindGlobal?: (shortcut: string) => void
 *   }
 * }} GrafanaInnerWindow
 */

const params = new URLSearchParams(window.location.search);
const srcParam = params.get('src');
const initialTarget = srcParam ? decodeURIComponent(srcParam) : '';
const themeParam = params.get('theme');
const iframe = document.getElementById('grafana-embed');

let detachEscHandlers = [];
let detachItemLinkHandlers = [];

/**
 * Prevents Escape key handling inside Grafana and nested same-origin frames
 * so parent UI dialogs/search state are not unintentionally affected.
 *
 * @param {GrafanaInnerWindow | null | undefined} targetWindow
 */
const bindEscGuard = (targetWindow) => {
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

    const boundWindows = new WeakSet();
    const trackedFrames = new WeakSet();

    /**
     * Captures Escape to prevent Grafana shortcuts/dialogs from leaking outside the wrapper.
     */
    const stopEsc = (event) => {
        if (event.key === 'Escape' || event.keyCode === 27) {
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
     * @param {GrafanaInnerWindow | null | undefined} windowRef
     */
    const bindWindow = (windowRef) => {
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
                doc.querySelectorAll('iframe').forEach((childFrame) => {
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
            const MutationObserverCtor = windowRef['MutationObserver'];
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
 * @param {GrafanaInnerWindow | null | undefined} targetWindow
 */
const bindItemLinkInterceptor = (targetWindow) => {
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

    const boundWindows = new WeakSet();
    const trackedFrames = new WeakSet();

    /**
     * Emits a normalized item-link click event to the parent aggregator application.
     */
    const emitItemLinkClick = (href) => {
        if (typeof href !== 'string' || href.trim() === '') {
            return;
        }
        let parsed;
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
     * @param {GrafanaInnerWindow | null | undefined} windowRef
     */
    const bindWindow = (windowRef) => {
        if (!windowRef?.addEventListener || boundWindows.has(windowRef)) {
            return;
        }
        boundWindows.add(windowRef);

        /**
         * Captures anchor clicks to rewrite Grafana item links into parent app navigation.
         */
        const onClickCapture = (event) => {
            const target = event.target;
            if (!target?.closest) {
                return;
            }
            const anchor = target.closest('a[href]');
            if (!anchor) {
                return;
            }
            const href = anchor.getAttribute('href') || anchor.href;
            if (typeof href !== 'string' || href.trim() === '') {
                return;
            }
            let parsed;
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
                doc.querySelectorAll('iframe').forEach((childFrame) => {
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
            const MutationObserverCtor = windowRef['MutationObserver'];
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
const applyTheme = (value) => {
    const nextTheme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;
    document.body.dataset.theme = nextTheme;
};

/**
 * Navigates the inner iframe to a Grafana URL while preserving wrapper lifecycle.
 */
const applyTarget = (target) => {
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
iframe.addEventListener('load', () => {
    try {
        /** @type {GrafanaInnerWindow | null} */
        const innerWindow = iframe.contentWindow;
        if (!innerWindow?.history) {
            return;
        }
        bindEscGuard(innerWindow);
        bindItemLinkInterceptor(innerWindow);
        const history = innerWindow.history;
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
        const mousetrap = innerWindow['Mousetrap'];
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

iframe.src = 'about:blank';
applyTheme(themeParam);
if (initialTarget) {
    applyTarget(initialTarget);
}

/**
 * Receives commands from the parent app to update theme or target Grafana URL.
 */
window.addEventListener('message', (event) => {
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
