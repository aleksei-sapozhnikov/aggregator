# Entity details and contacts

Actor, contact, and signal dialogs are independent of the selected Item panel.
The app owns which entity is open; dialogs present catalog records through the
shared modal shell.

Signal selection also lives in `#signal/<id>`, managed by
`signal/useSignalDetails.ts`. Opening or closing it preserves the Item route.
The signal dialog loads its definition on demand and cancels obsolete requests.

Contact previews simulate channel workflows using catalog metadata. Their
messages, calls, and incident creation must remain local demonstrations.
Example destination URLs are shown as help text and are never opened.
