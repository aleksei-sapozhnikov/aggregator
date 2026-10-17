# Entity details and contacts

Actor, contact, and health-signal dialogs are independent of the selected
Item panel. They use the shared modal shell and the catalog's typed records.

`actor/ActorModal.tsx` presents people/teams and available channels.
`contact/ContactModal.tsx` presents contact information and illustrative
channel demos; previews must not send real messages or place calls.
`signal/HealthSignalModal.tsx` loads details for an individual health check.
`signal/useSignalDetails.ts` owns `#signal/<id>` deep links and modal state.

This separation allows catalog rows and Grafana Item links to open the same
entity details without duplicating dialog behavior.
