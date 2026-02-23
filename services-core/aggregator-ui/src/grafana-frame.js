const params = new URLSearchParams(window.location.search);
const srcParam = params.get('src');
const initialTarget = srcParam ? decodeURIComponent(srcParam) : '';
const themeParam = params.get('theme');
const iframe = document.getElementById('grafana-embed');

let detachEscHandlers = [];

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

    const stopEsc = (event) => {
        if (event.key === 'Escape' || event.keyCode === 27) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
                event.stopImmediatePropagation();
            }
        }
    };

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
            if (windowRef.MutationObserver && doc.documentElement) {
                const observer = new windowRef.MutationObserver(attachNestedFrames);
                observer.observe(doc.documentElement, {childList: true, subtree: true});
                detachEscHandlers.push(() => observer.disconnect());
            }
        } catch (error) {
            // Ignore cross-origin errors if Grafana embeds third-party frames.
        }
    };

    bindWindow(targetWindow);
};

const applyTheme = (value) => {
    const nextTheme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;
    document.body.dataset.theme = nextTheme;
};

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

iframe.addEventListener('load', () => {
    try {
        const innerWindow = iframe.contentWindow;
        if (!innerWindow?.history) {
            return;
        }
        bindEscGuard(innerWindow);
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
        const mousetrap = innerWindow.Mousetrap;
        if (mousetrap) {
            mousetrap.unbindGlobal?.('esc');
            mousetrap.unbind?.('esc');
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
