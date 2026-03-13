import type {CatalogContact} from '../shared/types';

const contactTypeDisplayNameById: Record<string, string> = {
    email: 'Email',
    phone: 'Phone',
    sms: 'SMS',
    slack: 'Slack',
    teams: 'MS Teams',
    telegram: 'Telegram',
    discord: 'Discord',
    mattermost: 'Mattermost',
    pagerduty: 'PagerDuty',
    opsgenie: 'Opsgenie',
    other: 'Other',
};

const resolveContactTypeDisplayName = (contactType?: string): string => {
    if (!contactType) {
        return contactTypeDisplayNameById.other;
    }
    return contactTypeDisplayNameById[contactType] || contactTypeDisplayNameById.other;
};

const resolveContactLabel = (contact?: CatalogContact | null): string => {
    if (!contact) {
        return 'Unknown contact';
    }
    const title = String(contact.title || '').trim();
    if (title) {
        return title;
    }
    return 'Unnamed contact';
};

type ContactModalProps = {
    isOpen: boolean;
    contact: CatalogContact | null;
    onClose: () => void;
};

export default function ContactModal({isOpen, contact, onClose}: ContactModalProps) {
    if (!isOpen || !contact) {
        return null;
    }

    return (
        <div
            className="about-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Contact details"
            onClick={onClose}
        >
            <article className="about-modal contact-modal" onClick={(event) => event.stopPropagation()}>
                <button
                    type="button"
                    className="about-close"
                    aria-label="Close contact details"
                    onClick={onClose}
                >
                    ×
                </button>
                <header className="contact-modal-header">
                    <h2>{resolveContactLabel(contact)}</h2>
                    <p>This is a demo contact placeholder.</p>
                </header>
                <div className="contact-modal-body">
                    <dl>
                        <dt>Type</dt>
                        <dd>{resolveContactTypeDisplayName(contact.type)}</dd>
                        <dt>Value</dt>
                        <dd>{resolveContactLabel(contact)}</dd>
                        {contact.href && (
                            <>
                                <dt>Link</dt>
                                <dd className="contact-modal-link">{contact.href}</dd>
                            </>
                        )}
                    </dl>
                    <p>
                        In a real setup, this could open a phonebook entry, Slack/Teams channel,
                        on-call profile, or any other quick communication destination.
                    </p>
                </div>
            </article>
        </div>
    );
}
