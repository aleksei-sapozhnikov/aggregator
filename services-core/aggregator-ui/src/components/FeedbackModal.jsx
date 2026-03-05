/**
 * @file Feedback modal with draft text editing and explicit send action.
 */

/**
 * @typedef {Object} FeedbackModalProps
 * @property {boolean} isOpen
 * @property {string} value
 * @property {boolean} isSending
 * @property {string} error
 * @property {() => void} onClose
 * @property {(value: string) => void} onChange
 * @property {() => void} onSend
 */

/**
 * Renders feedback dialog body and controls.
 *
 * @param {FeedbackModalProps} props
 */
export default function FeedbackModal({
    isOpen,
    value,
    isSending,
    error,
    onClose,
    onChange,
    onSend,
}) {
    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="about-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Send feedback"
            onClick={onClose}
        >
            <article className="about-modal feedback-modal" onClick={(event) => event.stopPropagation()}>
                <button
                    type="button"
                    className="about-close"
                    aria-label="Close feedback dialog"
                    onClick={onClose}
                >
                    ×
                </button>
                <header className="feedback-header">
                    <h2>Feedback</h2>
                </header>
                <p className="feedback-note">
                    Your message is stored as-is so I can read it later. I cannot reply directly, but your
                    feedback helps a lot. Thank you for taking the time.
                </p>
                <label className="feedback-label" htmlFor="feedback-textarea">Your message</label>
                <textarea
                    id="feedback-textarea"
                    className="feedback-textarea"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder="Type your feedback here..."
                    rows={8}
                />
                {error && <p className="feedback-error">{error}</p>}
                <div className="feedback-actions">
                    <button
                        type="button"
                        className="feedback-send top-control-button top-control-surface"
                        disabled={isSending}
                        onClick={onSend}
                    >
                        {isSending ? 'Sending...' : 'Send'}
                    </button>
                </div>
            </article>
        </div>
    );
}
