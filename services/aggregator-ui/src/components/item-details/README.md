# Selected Item view

This feature presents ownership, contacts, reported signals, and history for
the selected Item. `data/useSelectedItemData.ts` joins catalog relationships
with backend health facts. It groups and sorts signals without inferring or
overriding Item health, and lists each dependency with unhealthy signals once,
retaining its first tree path for navigation.

`core/ItemDetails.tsx` connects those groups to shared presentation components
and application callbacks. Disclosure state is remembered per Item.

## Timeline integration

`TimelineSection` keeps the Item view independent of Grafana-specific URLs
and messages. The adapter under `timeline/grafana/` hosts a wrapper document
that receives theme and dashboard updates through `postMessage` and forwards
Item links to application navigation.

The wrapper suppresses Grafana history entries and Escape shortcuts where it
can access the embedded document. Link interception and these patches require
same-origin access; they cannot operate inside cross-origin frames.

The live view uses [shared Item components](../shared/item/README.md), also used
by help animations. Review animation alignment when their markup changes.
