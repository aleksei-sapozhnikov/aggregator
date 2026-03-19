import type {CatalogContact} from './types';

const contactTypeIconById: Record<string, string> = {
    email: 'icon-contact-email',
    phone: 'icon-contact-phone',
    sms: 'icon-contact-sms',
    slack: 'icon-contact-slack',
    teams: 'icon-contact-teams',
    telegram: 'icon-contact-telegram',
    discord: 'icon-contact-discord',
    mattermost: 'icon-contact-mattermost',
    pagerduty: 'icon-contact-pagerduty',
    opsgenie: 'icon-contact-opsgenie',
    other: 'icon-contact-other',
};

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

export const resolveContactIconId = (contactType?: string): string => {
    if (!contactType) {
        return contactTypeIconById.other;
    }
    return contactTypeIconById[contactType] || contactTypeIconById.other;
};

export const resolveContactTypeDisplayName = (contactType?: string): string => {
    if (!contactType) {
        return contactTypeDisplayNameById.other;
    }
    return contactTypeDisplayNameById[contactType] || contactTypeDisplayNameById.other;
};

export const resolveContactTypeClass = (contactType?: string): string => {
    if (!contactType || !(contactType in contactTypeIconById)) {
        return 'contact-type-other';
    }
    return `contact-type-${contactType}`;
};

export const resolveContactLabel = (contact?: CatalogContact | null): string => {
    if (!contact) {
        return 'Unknown contact';
    }
    const title = String(contact.title || '').trim();
    if (title) {
        return title;
    }
    return 'Unnamed contact';
};

export const sortContactsWithPrimaryFirst = (
    contacts: CatalogContact[],
    primaryContactId: string | null | undefined,
): CatalogContact[] => [...contacts].sort((left, right) => {
    const leftPrimary = left.id === primaryContactId ? 1 : 0;
    const rightPrimary = right.id === primaryContactId ? 1 : 0;
    if (leftPrimary !== rightPrimary) {
        return rightPrimary - leftPrimary;
    }
    const leftLabel = resolveContactLabel(left);
    const rightLabel = resolveContactLabel(right);
    return leftLabel.localeCompare(rightLabel) || left.id.localeCompare(right.id);
});
