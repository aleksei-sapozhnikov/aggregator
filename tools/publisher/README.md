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
python publisher.py validate ../../.local/publisher/publisher_plan/plan.json
python publisher.py preview ../../.local/publisher/publisher_plan/plan.json --html ../../.local/publisher/publisher_plan/calendar-preview.html
```

Only an operator with the `aggregator-admin` AWS profile should stage or
activate a reviewed plan:

```powershell
python publisher.py pause  # Only if an existing queue is running
python publisher.py apply ../../.local/publisher/publisher_plan/plan.json
python publisher.py calendar --live --output ../../.local/publisher/publisher_plan/calendar-live.html
python publisher.py resume # Only after reviewing the staged plan
```

`apply` stages an immutable S3 snapshot and leaves publication paused.
`resume` explicitly enables scheduled processing. The worker runs every
15 minutes; due times are targets, not hard execution guarantees. Existing
completed events and started publication metadata cannot be rewritten by a
new plan. Review the CLI and `plan.py` for the enforced contract.

## Private Codex preparation guidance

Codex instructions, PR templates/examples, publication task templates and
release-note templates/examples are stored outside Git in the private
versioned Publisher S3 bucket.
The local directory is **`<repository-root>/.local/publisher/codex-publication-preparation/`**.
It is already covered by `.gitignore`.

The only intended preparation workspace is `<repository-root>/.local/publisher/`.
Create a **pinned, detached reference worktree** at
`.local/publisher/reference-dev/` from the verified GitHub `origin/dev`
commit before reconstructing publication branches. It preserves the current
`AGENTS.md`, Makefile, Publisher implementation and QA guidance while Codex
works in older branch worktrees; it does not replace or move the private
Markdown bundle in `.local/publisher/codex-publication-preparation/`.
Record the pinned SHA and do not silently move the reference after beginning
preparation. If a reference worktree already exists, inspect its SHA and
working-tree status before deciding whether to reuse or replace it.
Do not use the primary checkout for release branch checkouts.

The JSON plan and outputs go under `.local/publisher/publisher_plan/`, and
isolated preparation worktrees under `.local/publisher/worktrees/`.
Do not use the old Legacy Publisher working directory for these outputs.

The seven required Markdown files are:

- `codex-instructions.md` — publication preparation procedure
- `pull-request-template.md` — PR body format
- `pull-request-example.md` — example based on a merged repository PR
- `release-notes-template.md` — release note format
- `release-notes-example.md` — previous release notes example
- `publication-task-template.md` — reusable Codex request with baseline, versions, and schedule inputs
- `publication-task-example.md` — sample requests for a new series and continuation

For each Codex request, provide the path to `codex-instructions.md`
relative to the active repository root, then set source/baseline refs,
version numbering, and either a deadline or PR merge pace in
`publication-task-template.md`. Codex resolves the other guidance files
relative to that explicitly supplied instruction path, not from a fixed
working directory. The examples are illustrative and must be verified.

For an existing checkout with guidance in the old location, move the entire
directory (including `.remote-etag`) once, from `tools/publisher`:

```powershell
New-Item -ItemType Directory -Force ..\\..\\.local\\publisher | Out-Null
Move-Item ..\\..\\.local\\codex-publication-preparation ..\\..\\.local\\publisher\\codex-publication-preparation
```

After the initial download of the guidance ZIP, extract those files directly
into the new directory above. From `tools/publisher`, select `aggregator-admin`:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
python notes.py push         # Upload all seven files as one versioned S3 ZIP
python notes.py pull         # Download when the local directory does not exist
python notes.py pull --force # Replace a local directory deliberately
```

The remote object is `s3://aggregator-publisher-data-905418096305-eu-central-1/operator/codex-publication-preparation.zip`.
An older single-file `operator/codex-publication-preparation.md` object is not
used by this bundle workflow and is not deleted automatically.

The preparation request is a short parameter list. `From` and `To` are
authoritative; an unpublished baseline such as `version/v0.7.13` must not be
silently replaced by the latest published tag. Complex initiatives should
be broken into focused multi-PR patch releases, not one giant PR or release.
Each publication branch requires explicit, branch-specific Make QA under the
narrow exception in the repository's `AGENTS.md`. The main checkout remains
unchanged throughout preparation.
For this workflow, the Make QA exception also covers the offline subcommands
called by the existing checks (including `tofu fmt`, `tofu init -backend=false`,
`tofu validate`, and `make -n qa-check`). It does not permit infrastructure
plans/applies, AWS access, deployment, or changes to remote resources.
When approval is required for a destructive local branch/worktree change,
Codex must ask a concise explicit question stating the target, effect,
backup/safety step, and exact approval requested, instead of posting an
incomplete long-form report.

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
