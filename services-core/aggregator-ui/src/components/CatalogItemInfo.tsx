import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { CatalogItem } from "../shared/types";
import CloseButton from "./CloseButton";

type CatalogItemInfoProps = {
  item: CatalogItem;
};

const missingTooltip = "No description in catalog";
const viewDescriptionTooltip = "View item description";
const missingDetailNotice = "No detailed description in catalog.";
const tooltipGap = 6;
const viewportPadding = 8;

const normalizeDescription = (value: string | undefined): string =>
  typeof value === "string" ? value.trim() : "";

const splitParagraphs = (value: string): string[] =>
  value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

export default function CatalogItemInfo({ item }: CatalogItemInfoProps) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const shortDescription = normalizeDescription(item.shortDescription);
  const fullDescription = normalizeDescription(item.fullDescription);
  const hasShortDescription = Boolean(shortDescription);
  const hasFullDescription = Boolean(fullDescription);
  const isEnabled = hasShortDescription || hasFullDescription;
  const tooltip = hasShortDescription
    ? shortDescription
    : hasFullDescription
      ? viewDescriptionTooltip
      : missingTooltip;
  const modalText = hasFullDescription ? fullDescription : shortDescription;
  const paragraphs = useMemo(() => splitParagraphs(modalText), [modalText]);

  const showTooltip = () => {
    if (!isTooltipVisible) {
      setTooltipPosition(null);
    }
    setIsTooltipVisible(true);
  };

  useLayoutEffect(() => {
    if (!isTooltipVisible) {
      return undefined;
    }

    const updateTooltipPosition = () => {
      const button = buttonRef.current;
      const tooltipElement = tooltipRef.current;
      if (!button || !tooltipElement) {
        return;
      }

      const anchor = button.getBoundingClientRect();
      const tooltipRect = tooltipElement.getBoundingClientRect();
      const spaceAbove = anchor.top - tooltipGap - viewportPadding;
      const spaceBelow =
        window.innerHeight - anchor.bottom - tooltipGap - viewportPadding;
      const placeBelow =
        tooltipRect.height > spaceAbove && spaceBelow > spaceAbove;

      const preferredTop = placeBelow
        ? anchor.bottom + tooltipGap
        : anchor.top - tooltipRect.height - tooltipGap;
      const preferredLeft =
        anchor.left + anchor.width / 2 - tooltipRect.width / 2;

      const top = Math.max(
        viewportPadding,
        Math.min(
          preferredTop,
          window.innerHeight - tooltipRect.height - viewportPadding,
        ),
      );
      const left = Math.max(
        viewportPadding,
        Math.min(
          preferredLeft,
          window.innerWidth - tooltipRect.width - viewportPadding,
        ),
      );

      setTooltipPosition((current) =>
        current?.left === left && current.top === top ? current : { left, top },
      );
    };

    updateTooltipPosition();
    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);
    return () => {
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [isTooltipVisible, tooltip]);

  useEffect(() => {
    if (!isModalOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen]);

  return (
    <span className="catalog-item-info">
      <button
        ref={buttonRef}
        type="button"
        className={`catalog-item-info-button ${isEnabled ? "is-enabled" : "is-disabled"}`}
        aria-label={`Catalog information for ${item.title || item.id}`}
        aria-describedby={isTooltipVisible ? tooltipId : undefined}
        aria-disabled={!isEnabled}
        onClick={(event) => {
          event.stopPropagation();
          setIsTooltipVisible(false);
          if (isEnabled) {
            setIsModalOpen(true);
          }
        }}
        onFocus={showTooltip}
        onBlur={() => setIsTooltipVisible(false)}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setIsTooltipVisible(false)}
      >
        ⓘ
      </button>
      {isTooltipVisible &&
        createPortal(
          <span
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className="info-help-tooltip"
            style={{
              left: `${tooltipPosition?.left ?? 0}px`,
              top: `${tooltipPosition?.top ?? 0}px`,
              transform: "none",
              visibility: tooltipPosition ? "visible" : "hidden",
            }}
          >
            {tooltip}
          </span>,
          document.body,
        )}
      {isModalOpen &&
        isEnabled &&
        createPortal(
          <div
            className="about-overlay info-help-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={`Catalog information for ${item.title || item.id}`}
            onClick={() => setIsModalOpen(false)}
          >
            <article
              className="about-modal info-help-modal catalog-item-info-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <CloseButton
                ariaLabel="Close catalog information"
                onClick={() => setIsModalOpen(false)}
              />
              <header className="info-help-modal-header">
                <h2>{item.title || item.id}</h2>
              </header>
              <div className="catalog-item-info-content">
                {paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {!hasFullDescription && hasShortDescription && (
                  <p className="catalog-item-info-missing-detail">
                    <em>{missingDetailNotice}</em>
                  </p>
                )}
              </div>
            </article>
          </div>,
          document.body,
        )}
    </span>
  );
}
