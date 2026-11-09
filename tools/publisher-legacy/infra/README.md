# Legacy Publisher infrastructure retirement root

This root retains the legacy backend and AWS provider configuration so its
existing OpenTofu state can be reviewed for retirement. The resource
definitions and deployment code have been removed.

Initialize and validate without applying:

```powershell
tofu init -input=false -lockfile=readonly
tofu validate
tofu plan -destroy
```

The destroy plan includes legacy data storage. Do not apply it until the new
Publisher has recorded `legacy_handoff_complete: true` and the legacy
DynamoDB table has been exported and verified as documented in
[`docs/legacy-publisher-retirement.md`](../../../docs/legacy-publisher-retirement.md).
Regenerate the plan after those conditions are met. OpenTofu plan output and
saved plan files may contain sensitive state; keep them out of Git.
