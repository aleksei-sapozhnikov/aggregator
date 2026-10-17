/**
 * @file Composes the selected Item's ownership, signals, and Timeline with navigation and dialog actions.
 * Remembers disclosure state for each Item.
 */

import ItemOwnership, {
  type ActorSummaryRow,
} from "../../shared/item/ItemOwnership";
import {
  HealthySignals,
  UnhealthySignals,
  type UnhealthyDependencyRow,
} from "../../shared/item/ItemSignals";
import TimelineSection from "../timeline/TimelineSection";
import InfoHelp from "../../shared/help/InfoHelp";
import { isPlainLeftClick } from "../../../shared/ui/pointerUtils";
import type {
  CatalogActor,
  CatalogContact,
  CatalogItem,
  FailingDependencyEntry,
  ItemSignal,
} from "../../../shared/types";
import type { MouseEvent, RefObject } from "react";
import { useEffect, useMemo, useState } from "react";

export type ItemDetailsProps = {
  contentRef: RefObject<HTMLElement | null>;
  headerRef: RefObject<HTMLElement | null>;
  iconSpriteHref: string;
  selectedItem: CatalogItem | undefined;
  isLastKnownHealth?: boolean;
  selectedFailingSignals: ItemSignal[];
  failingDependencies: FailingDependencyEntry[];
  selectedItemActors: {
    owner: CatalogActor | null;
    otherActors: CatalogActor[];
  } | null;
  actorContactsByActorId: Map<
    string,
    { contacts: CatalogContact[]; primaryContact: CatalogContact | null }
  >;
  buildItemLink: (itemId: string, pathIds?: string[]) => string;
  onOpenSignal: (signal: ItemSignal) => void;
  onSelectItemByPath: (pathIds: string[]) => void;
  onOpenActor: (actor: CatalogActor) => void;
  passingSignalsCount: number;
  selectedPassingSignals: ItemSignal[];
  onOpenContact: (contact: CatalogContact) => void;
  isTimelineOpen: boolean;
  onToggleTimeline: () => void;
  onNavigateToTimelineItem: (itemId: string, href: string) => void;
};

const buildSignalLink = (id: string): string =>
  `#signal/${encodeURIComponent(id)}`;

type DetailsDisclosureState = {
  isHealthyOpen: boolean;
  isContactsExtraOpen: boolean;
  isAffectingOpen: boolean;
};

const emptyDisclosureState: DetailsDisclosureState = {
  isHealthyOpen: false,
  isContactsExtraOpen: false,
  isAffectingOpen: true,
};

const buildExtraActorRows = (actors: CatalogActor[]): ActorSummaryRow[] =>
  [...actors]
    .sort((left, right) => {
      const rankByType: Record<string, number> = {
        owner: 0,
        user: 1,
        other: 2,
      };
      const leftRank = rankByType[String(left.type || "other")] ?? 99;
      const rightRank = rankByType[String(right.type || "other")] ?? 99;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return (left.title || left.id).localeCompare(right.title || right.id);
    })
    .map((actor) => ({
      key: actor.id,
      actor,
      typeLabel: String(actor.type || "other")
        .toLowerCase()
        .replace(/^./, (firstLetter) => firstLetter.toUpperCase()),
    }));

export default function ItemDetails({
  contentRef,
  headerRef,
  iconSpriteHref,
  selectedItem,
  isLastKnownHealth = false,
  selectedFailingSignals,
  failingDependencies,
  selectedItemActors,
  actorContactsByActorId,
  buildItemLink,
  onOpenSignal,
  onSelectItemByPath,
  onOpenActor,
  passingSignalsCount,
  selectedPassingSignals,
  onOpenContact,
  isTimelineOpen,
  onToggleTimeline,
  onNavigateToTimelineItem,
}: ItemDetailsProps) {
  const selectedItemId = selectedItem?.id || "";
  const [disclosureByItemId, setDisclosureByItemId] = useState<
    Record<string, DetailsDisclosureState>
  >({});

  const handleSignalClick = (
    event: MouseEvent<HTMLAnchorElement>,
    signal: ItemSignal,
  ) => {
    if (!isPlainLeftClick(event)) {
      return;
    }
    event.preventDefault();
    onOpenSignal(signal);
  };

  const ownerActorForContacts =
    selectedItemActors?.owner || selectedItemActors?.otherActors?.[0] || null;
  const ownerContactsEntry = ownerActorForContacts
    ? actorContactsByActorId.get(ownerActorForContacts.id) || null
    : null;
  const primaryContact =
    ownerContactsEntry?.primaryContact ||
    ownerContactsEntry?.contacts[0] ||
    null;
  const actorsForContacts = selectedItemActors
    ? selectedItemActors.owner
      ? [selectedItemActors.owner, ...selectedItemActors.otherActors]
      : selectedItemActors.otherActors
    : [];
  const actorRowsForContacts = useMemo(
    () => buildExtraActorRows(actorsForContacts),
    [actorsForContacts],
  );

  const unhealthyDependencyRows = useMemo<UnhealthyDependencyRow[]>(
    () =>
      failingDependencies.map((entry) => ({
        id: `dep:${entry.id}`,
        title: entry.name,
        signals: entry.failingSignals,
        href: buildItemLink(entry.id, entry.path),
        onClick: (event) => {
          if (!isPlainLeftClick(event)) {
            return;
          }
          event.preventDefault();
          onSelectItemByPath(entry.path);
        },
      })),
    [buildItemLink, failingDependencies, onSelectItemByPath],
  );

  const affectingCount =
    selectedFailingSignals.length +
    unhealthyDependencyRows.reduce(
      (total, row) => total + row.signals.length,
      0,
    );
  const hasAffectingSignals = affectingCount > 0;

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }
    setDisclosureByItemId((prev) => {
      if (prev[selectedItemId]) {
        return prev;
      }
      return {
        ...prev,
        [selectedItemId]: {
          ...emptyDisclosureState,
        },
      };
    });
  }, [selectedItemId]);

  const itemDisclosureState = selectedItemId
    ? disclosureByItemId[selectedItemId] || {
        ...emptyDisclosureState,
      }
    : { ...emptyDisclosureState };

  const updateDisclosureState = (patch: Partial<DetailsDisclosureState>) => {
    if (!selectedItemId) {
      return;
    }
    setDisclosureByItemId((prev) => {
      const current = prev[selectedItemId] || {
        ...emptyDisclosureState,
      };
      return {
        ...prev,
        [selectedItemId]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const toggleContactsExtra = () =>
    updateDisclosureState({
      isContactsExtraOpen: !itemDisclosureState.isContactsExtraOpen,
    });
  const toggleAffectingSignals = () =>
    updateDisclosureState({
      isAffectingOpen: !itemDisclosureState.isAffectingOpen,
    });
  const toggleHealthySignals = () =>
    updateDisclosureState({
      isHealthyOpen: !itemDisclosureState.isHealthyOpen,
    });

  return (
    <>
      {!selectedItem ? (
        <div className="empty">Select a catalog item to view dashboards.</div>
      ) : (
        <>
          <section className="details-summary-block">
            <ItemOwnership
              primaryContact={primaryContact}
              actorRows={actorRowsForContacts}
              expanded={itemDisclosureState.isContactsExtraOpen}
              onToggleActors={toggleContactsExtra}
              onOpenContact={onOpenContact}
              onOpenActor={onOpenActor}
              iconSpriteHref={iconSpriteHref}
              primaryHelp={<InfoHelp topicId="primary-contact" />}
              actorsHelp={<InfoHelp topicId="actors" />}
            />
            {isLastKnownHealth && (
              <p className="health-snapshot-note">
                Last known signals. Current health is unavailable.
              </p>
            )}
            {hasAffectingSignals && (
              <UnhealthySignals
                signals={selectedFailingSignals}
                dependencies={unhealthyDependencyRows}
                expanded={itemDisclosureState.isAffectingOpen}
                onToggle={toggleAffectingSignals}
                buildSignalLink={buildSignalLink}
                onSignalClick={handleSignalClick}
                help={<InfoHelp topicId="unhealthy-signals" />}
              />
            )}
            {passingSignalsCount > 0 && (
              <HealthySignals
                signals={selectedPassingSignals}
                count={passingSignalsCount}
                expanded={itemDisclosureState.isHealthyOpen}
                onToggle={toggleHealthySignals}
                buildSignalLink={buildSignalLink}
                onSignalClick={handleSignalClick}
                help={<InfoHelp topicId="healthy-signals" />}
              />
            )}
          </section>

          <TimelineSection
            itemId={selectedItem.id}
            expanded={isTimelineOpen}
            onToggle={onToggleTimeline}
            onNavigateToItem={onNavigateToTimelineItem}
            contentRef={contentRef}
            headerRef={headerRef}
          />
        </>
      )}
    </>
  );
}
