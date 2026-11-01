/** @file Shows catalog descriptions as a short tooltip and a detailed Item modal. */

import { useId, useMemo, useRef, useState } from "react";
import type { CatalogItem } from "../../../shared/types";
import ModalWindow from "../ui/ModalWindow";
import HelpTooltip from "../help/HelpTooltip";

type CatalogItemInfoProps = {
  item: CatalogItem;
  interactive?: boolean;
};

const missingTooltip = "No description in catalog";
const missingDetailNotice = "No detailed description in catalog.";

const normalizeDescription = (value: string | undefined): string =>
  typeof value === "string" ? value.trim() : "";

const splitParagraphs = (value: string): string[] =>
  value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

export default function CatalogItemInfo({
  item,
  interactive = true,
}: CatalogItemInfoProps) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const shortDescription = normalizeDescription(item.shortDescription);
  const fullDescription = normalizeDescription(item.fullDescription);
  const hasShortDescription = Boolean(shortDescription);
  const hasFullDescription = Boolean(fullDescription);
  const isEnabled = hasShortDescription || hasFullDescription;
  const tooltip = hasShortDescription
    ? shortDescription
    : hasFullDescription
      ? "Click for details"
      : missingTooltip;
  const paragraphs = useMemo(
    () => splitParagraphs(fullDescription),
    [fullDescription],
  );

  const showTooltip = () => {
    if (!interactive || isModalOpen) {
      return;
    }

    setIsTooltipVisible(true);
  };

  return (
    <span className="catalog-item-info">
      <button
        ref={buttonRef}
        type="button"
        className={`catalog-item-info-button ${isEnabled ? "is-enabled" : "is-disabled"}`}
        aria-label={`Catalog information for ${item.title || item.id}`}
        aria-describedby={isTooltipVisible ? tooltipId : undefined}
        aria-disabled={!isEnabled}
        disabled={!interactive}
        onClick={(event) => {
          if (!interactive) return;
          event.stopPropagation();
          setIsTooltipVisible(false);
          if (isEnabled) {
            setIsModalOpen(true);
          }
        }}
        onBlur={() => setIsTooltipVisible(false)}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setIsTooltipVisible(false)}
      >
        ⓘ
      </button>
      <HelpTooltip
        id={tooltipId}
        anchorRef={buttonRef}
        visible={isTooltipVisible}
        content={tooltip}
        action={hasShortDescription ? "Click for details" : undefined}
      />
      {isEnabled && (
        <ModalWindow
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          ariaLabel={`Catalog information for ${item.title || item.id}`}
          closeLabel="Close catalog information"
          header={<h2>{item.title || item.id}</h2>}
        >
          <div className="info-help-modal catalog-item-info-modal">
            <div className="catalog-item-info-content modal-text-flow">
              {hasShortDescription && (
                <p>
                  <strong>{shortDescription}</strong>
                </p>
              )}
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {!hasFullDescription && hasShortDescription && (
                <p className="catalog-item-info-missing-detail">
                  <em>{missingDetailNotice}</em>
                </p>
              )}
            </div>
          </div>
        </ModalWindow>
      )}
    </span>
  );
}
