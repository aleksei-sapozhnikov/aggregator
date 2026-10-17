/**
 * Prepares the selected Item's backend health facts, signals, dependency rows,
 * ownership and contact data for presentation without recalculating health.
 */
import { useMemo } from "react";
import { sortContactsWithPrimaryFirst } from "../../../shared/contacts/contactPresentation";
import {
  compareHealthStatus,
  isUnhealthyHealthStatus,
} from "../../../shared/health/healthPresentation";
import type {
  CatalogActor,
  CatalogActorContact,
  CatalogContact,
  CatalogItem,
  CatalogItemActor,
  CatalogTreeNode,
  FailingDependencyEntry,
  HealthStatus,
  ItemSignal,
} from "../../../shared/types";

type ItemActorsEntry = {
  owner: CatalogActor | null;
  otherActors: CatalogActor[];
};

const compareSignalsByStatusAndTitle = (
  left: ItemSignal,
  right: ItemSignal,
): number => {
  const statusCompare = compareHealthStatus(left.status, right.status);
  if (statusCompare !== 0) {
    return statusCompare;
  }
  return (
    (left.title || left.id).localeCompare(right.title || right.id) ||
    left.id.localeCompare(right.id)
  );
};

type ItemCatalogRelations = {
  contacts: CatalogContact[];
  actors: CatalogActor[];
  actorContacts: CatalogActorContact[];
  itemActors: CatalogItemActor[];
};

type SelectedItemDataOptions = {
  selectedId: string;
  selectedNode: CatalogTreeNode | null;
  itemMap: Map<string, CatalogItem>;
  itemStatuses: Record<string, HealthStatus>;
  itemSignals: Record<string, ItemSignal[]>;
  catalog: ItemCatalogRelations;
  openedActorId: string;
};

export default function useSelectedItemData({
  selectedId,
  selectedNode,
  itemMap,
  itemStatuses,
  itemSignals,
  catalog,
  openedActorId,
}: SelectedItemDataOptions) {
  const selectedItem = selectedNode?.item || itemMap.get(selectedId);
  const selectedStatus = selectedItem
    ? itemStatuses[selectedItem.id] || "unknown"
    : "unknown";
  const selectedTitleText = selectedItem
    ? selectedItem.title || selectedItem.id
    : "Select an item";
  const selectedTitleMatch = selectedTitleText.match(/^(\S+)([\s\S]*)$/);
  const selectedTitleFirstWord = selectedTitleMatch?.[1] || selectedTitleText;
  const selectedTitleRest = selectedTitleMatch?.[2] || "";

  const selectedSignals = useMemo(() => {
    if (!selectedItem) {
      return [];
    }
    const signals = itemSignals[selectedItem.id] || [];
    return [...signals].sort(compareSignalsByStatusAndTitle);
  }, [itemSignals, selectedItem]);

  const selectedFailingSignals = useMemo(
    () =>
      selectedSignals.filter((signal) =>
        isUnhealthyHealthStatus(signal.status),
      ),
    [selectedSignals],
  );
  const selectedPassingSignals = useMemo(
    () => selectedSignals.filter((signal) => signal.status === "up"),
    [selectedSignals],
  );
  const contactsById = useMemo(
    () => new Map(catalog.contacts.map((contact) => [contact.id, contact])),
    [catalog.contacts],
  );
  const actorsById = useMemo(
    () => new Map(catalog.actors.map((actor) => [actor.id, actor])),
    [catalog.actors],
  );
  const actorContactsByActorId = useMemo(() => {
    const grouped = new Map<
      string,
      { contacts: Map<string, CatalogContact>; primaryContactId: string }
    >();
    catalog.actorContacts.forEach((entry) => {
      const contact = contactsById.get(entry.contactId);
      if (!contact) {
        return;
      }
      if (!grouped.has(entry.actorId)) {
        grouped.set(entry.actorId, {
          contacts: new Map<string, CatalogContact>(),
          primaryContactId: "",
        });
      }
      const actorContacts = grouped.get(entry.actorId);
      if (!actorContacts) {
        return;
      }
      actorContacts.contacts.set(contact.id, contact);
      if (entry.isPrimary && !actorContacts.primaryContactId) {
        actorContacts.primaryContactId = contact.id;
      }
    });
    const result = new Map<
      string,
      { contacts: CatalogContact[]; primaryContact: CatalogContact | null }
    >();
    grouped.forEach((value, actorId) => {
      const sortedContacts = sortContactsWithPrimaryFirst(
        [...value.contacts.values()],
        value.primaryContactId,
      );
      const primaryContact = value.primaryContactId
        ? sortedContacts.find(
            (contact) => contact.id === value.primaryContactId,
          ) ||
          sortedContacts[0] ||
          null
        : sortedContacts[0] || null;
      result.set(actorId, { contacts: sortedContacts, primaryContact });
    });
    return result;
  }, [catalog.actorContacts, contactsById]);
  const actorsByItemId = useMemo(() => {
    const grouped = new Map<string, CatalogItemActor[]>();
    catalog.itemActors.forEach((entry) => {
      if (!grouped.has(entry.itemId)) {
        grouped.set(entry.itemId, []);
      }
      grouped.get(entry.itemId)?.push(entry);
    });
    const result = new Map<string, ItemActorsEntry>();
    grouped.forEach((relations, itemId) => {
      const actorMap = new Map<string, CatalogActor>();
      relations.forEach((relation) => {
        const actor = actorsById.get(relation.actorId);
        if (actor) {
          actorMap.set(actor.id, actor);
        }
      });
      const resolvedActors = [...actorMap.values()];
      if (resolvedActors.length === 0) {
        return;
      }
      const typedOwner =
        resolvedActors.find((actor) => actor.type === "owner") || null;
      const primaryRelation = relations.find((relation) => relation.isPrimary);
      const relationPrimary = primaryRelation
        ? actorsById.get(primaryRelation.actorId) || null
        : null;
      const owner = typedOwner || relationPrimary || null;
      result.set(itemId, {
        owner,
        otherActors: resolvedActors.filter((actor) => actor.id !== owner?.id),
      });
    });
    return result;
  }, [actorsById, catalog.itemActors]);
  const selectedItemActors = useMemo(
    () => (selectedItem ? actorsByItemId.get(selectedItem.id) || null : null),
    [actorsByItemId, selectedItem],
  );
  const failingDependencies = useMemo(() => {
    if (!selectedNode) {
      return [];
    }

    const result: FailingDependencyEntry[] = [];
    const displayedItemIds = new Set<string>();

    const visit = (children: CatalogTreeNode[]) => {
      children.forEach((node) => {
        const failingSignals = (itemSignals[node.item.id] || [])
          .filter((signal) => isUnhealthyHealthStatus(signal.status))
          .sort(compareSignalsByStatusAndTitle);

        if (failingSignals.length > 0 && !displayedItemIds.has(node.item.id)) {
          displayedItemIds.add(node.item.id);
          result.push({
            id: node.item.id,
            name: node.item.title || node.item.id,
            path: node.path || [node.item.id],
            status: failingSignals[0]?.status || "unknown",
            failingSignals,
            failingCountContribution: 1,
          });
        }

        visit(node.children);
      });
    };

    visit(selectedNode.children);

    return result.sort(
      (left, right) =>
        left.path.length - right.path.length ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id),
    );
  }, [itemSignals, selectedNode]);
  const openedActor = useMemo(
    () => (openedActorId ? actorsById.get(openedActorId) || null : null),
    [actorsById, openedActorId],
  );
  const openedActorContacts = useMemo(
    () =>
      openedActor
        ? actorContactsByActorId.get(openedActor.id)?.contacts || []
        : [],
    [actorContactsByActorId, openedActor],
  );
  const passingSignalsCount = selectedPassingSignals.length;
  return {
    selectedItem,
    selectedStatus,
    selectedTitleFirstWord,
    selectedTitleRest,
    selectedFailingSignals,
    selectedPassingSignals,
    passingSignalsCount,
    failingDependencies,
    selectedItemActors,
    actorContactsByActorId,
    openedActor,
    openedActorContacts,
  };
}
