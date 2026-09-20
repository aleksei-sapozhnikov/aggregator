import {
  resolveContactIconId,
  resolveContactLabel,
  resolveContactTypeClass,
  resolveContactTypeDisplayName,
} from "../shared/contactUtils";
import type { CatalogContact } from "../shared/types";

type ContactChipContentProps = {
  contact: CatalogContact;
  iconSpriteHref: string;
  prefix?: string;
  valueClassName?: string;
};

export default function ContactChipContent({
  contact,
  iconSpriteHref,
  prefix,
  valueClassName = "contact-chip-text",
}: ContactChipContentProps) {
  const typeDisplayName = resolveContactTypeDisplayName(contact.type);

  return (
    <span className="chip-entry">
      <span className="chip-icon-block">
        <span
          className="contact-type-icon-wrap"
          title={typeDisplayName}
          aria-label={typeDisplayName}
        >
          <svg
            className={`contact-type-icon ${resolveContactTypeClass(contact.type)}`}
            viewBox="0 0 24 24"
            focusable="false"
            aria-hidden="true"
          >
            <use
              href={`${iconSpriteHref}#${resolveContactIconId(contact.type)}`}
            />
          </svg>
        </span>
      </span>
      <span className="chip-text-block">
        {prefix && <span className="chip-prefix">{prefix}</span>}
        <span className={valueClassName}>{resolveContactLabel(contact)}</span>
      </span>
    </span>
  );
}
