# Publisher

Publisher executes a reviewed publication schedule for the Aggregator repository.
It uses one AWS EventBridge watchdog, a Lambda worker, and durable S3/DynamoDB
state. Scheduled operations include GitHub pull requests, squash merges,
releases, and project metadata. The system verifies source branches and enforces
publication constraints before changing GitHub state.

## Preparation and operations

Planning permits PR open/merge times from **09:00 through 20:30** local
(`Europe/Belgrade`). The watchdog may execute overdue events until **22:00**
on an eligible day, including delayed operations scheduled at 20:30.
After 22:00 it defers pending events to the next day; after the final
day's 22:00 cutoff it pauses an incomplete queue and reports a missed
deadline. The prior window remains in effect for snapshots staged before
this setting was introduced. Updating the Lambda runtime in AWS is required
to activate this behavior; a Git commit by itself does not redeploy Lambda.

The input is a JSON plan. See [`examples/plan.json`](examples/plan.json) for an
empty plan and [`examples/demo-plan.json`](examples/demo-plan.json) for a local
preview example (its branches are not real). The plan references existing
source branches and includes PR descriptions, release notes, and local times.

From `tools/publisher`:

```powershell
python publisher.py validate ../../.local/plan.json
python publisher.py preview ../../.local/plan.json --html ../../.local/calendar-preview.html
```

Only an operator with the `aggregator-admin` AWS profile should stage or
activate a reviewed plan:

```powershell
python publisher.py pause  # Only if an existing queue is running
python publisher.py apply ../../.local/plan.json
python publisher.py calendar --live --output ../../.local/calendar-live.html
python publisher.py resume # Only after reviewing the staged plan
```

`apply` stages an immutable S3 snapshot and leaves publication paused.
`resume` explicitly enables scheduled processing. The worker runs every
15 minutes; due times are targets, not hard execution guarantees. Existing
completed events and started publication metadata cannot be rewritten by a
new plan. Review the CLI and `plan.py` for the enforced contract.

## Private Codex preparation guidance

Codex instructions, PR templates/examples, and release-note templates/examples
are stored outside Git in the private versioned Publisher S3 bucket.
The local directory is **`<repository-root>/.local/codex-publication-preparation/`**.
It is already covered by `.gitignore`.

The seven required Markdown files are:

- `codex-instructions.md` — publication preparation procedure
- `pull-request-template.md` — PR body format
- `pull-request-example.md` — example based on a merged repository PR
- `release-notes-template.md` — release note format
- `release-notes-example.md` — previous release notes example
- `publication-task-template.md` — reusable Codex request with baseline, versions, and schedule inputs
- `publication-task-example.md` — sample requests for a new series and continuation

For each Codex request, provide the actual path to `codex-instructions.md`
in the chosen checkout, then set source/baseline refs, version numbering,
queue status, and either a deadline or PR merge pace in
`publication-task-template.md`. Codex resolves the other guidance files
relative to that explicitly supplied instruction path, not from a fixed
working directory. The examples are illustrative and must be verified.

After the initial download of the guidance ZIP, extract those files directly
into the directory above. From `tools/publisher`, select `aggregator-admin`:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
python notes.py push         # Upload all seven files as one versioned S3 ZIP
python notes.py pull         # Download when the local directory does not exist
python notes.py pull --force # Replace a local directory deliberately
```

The remote object is `s3://aggregator-publisher-data-905418096305-eu-central-1/operator/codex-publication-preparation.zip`.
An older single-file `operator/codex-publication-preparation.md` object is not
used by this bundle workflow and is not deleted automatically.

Each `push` packages the seven expected files; unrelated files in the local
directory are not uploaded. On first upload the S3 ZIP must not yet exist.
Later uploads use the stored `.remote-etag` for conditional writes.
Run `pull` before modifying a copy on a second machine; use `push --force`
only when explicitly overriding the remote version is intended. S3 object
versioning retains previous revisions. Both `push` and `pull` (including
`--force`) display the target and require entering exactly `yes` before
any AWS request or local changes. Any other response or missing interactive
input cancels the operation. Codex itself must never call AWS.

To edit publication material or the publication schedule, use the Publisher
CLI and the JSON plan. `notes.py` is for private preparation guidance only.

## Infrastructure and safety

See [`infra/README.md`](infra/README.md) for the independent IAM
administration and workload roots. Infrastructure is deployed separately
from publication plans; updating a plan does not require OpenTofu or rebuilding
Lambda. Build the Lambda artifact with `python publisher.py build` only for
runtime code deployment.

Until the one-time handover condition is recorded, the worker waits for the
preceding queue to finish; it also enforces the configured activation date.
Do not remove that gate without reviewing the corresponding AWS state.

Use `python -m unittest discover -s tests -v` for offline checks. Code QA
includes this Publisher and excludes the frozen predecessor.
