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
deadline. Runtime changes require deploying the Lambda package; a Git commit
alone does not update the deployed worker.

The preferred input is an ordered JSON `operations` plan. See
[`examples/operations-plan.json`](examples/operations-plan.json) for the
explicit PR and release workflow. The older `pull_requests` / `releases`
format remains readable for archived plans and snapshots.

Each `{"type":"pull_request"}` operation has a branch, title, `body` or `body_file`,
and local `open` and `merge` times. Publisher emits two ordered events,
resolves the actual PR through GitHub, and never infers a release from the
branch name. The optional `milestone` on a PR assigns a GitHub milestone;
without it, milestone association is skipped. The older `pr` spelling is
accepted as an alias for previously prepared plans.

Each `{"type":"release"}` operation has a tag, title, `notes` or
`notes_file`, and a local `publish` time. It runs independently after all
preceding operations are complete. The tag targets the current `main` HEAD
at the start of that operation, and its selected commit SHA is persisted so
retries do not silently move the tag. The release description begins with
the prepared Markdown, followed by GitHub's generated `What's Changed`
and `Full Changelog` sections. GitHub chooses the comparison baseline by
default; a release may specify `previous_tag` to request a custom baseline.
There is no global `previous_published_tag`, version-name inference, or
requirement that an earlier release belongs to the Publisher queue.

Plan-relative `body_file` and `notes_file` values are read from the local
directory containing `plan.json` when the plan is compiled. Their text is
embedded in the immutable JSON snapshot uploaded to S3; the Markdown files
are not uploaded separately. Lambda reads the snapshot and requires no local
Markdown files.

**Compatibility:** The running queue uses explicit format-2 operations.
The CLI retains read support for historical format-1 snapshots, but does not
offer a migration command. Switching an active queue between snapshot formats
is explicitly prohibited. Completed operations and durable publication
identities must remain unchanged when updating the plan.

All plan-relative `body_file` and `notes_file` paths must resolve locally
during compilation.

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

## Publication behavior and recovery

Publisher opens PRs in queue order and requests squash merges using the latest
GitHub PR head SHA. GitHub decides merge eligibility. If GitHub rejects the
merge and the live PR reports `mergeable_state=behind`, Publisher requests
one GitHub `Update branch` operation using `expected_head_sha`. It polls for
an updated head for up to 30 seconds and tries squash merge once more. It
never checks CI or reviews itself: GitHub enforces all merge conditions.
If updating or merging still fails, the event remains pending for the next
watchdog attempt. Other merge refusals do not trigger branch updates.

Publisher never rebases or force-pushes, requires prior head SHAs to remain
unchanged, or inspects ancestry and net file changes. GitHub `Update branch`
merges the current base into the PR branch and may add a merge commit there;
the final merge into `main` still uses squash. Prepare stacked branches
ahead of time or resolve conflicts manually when GitHub cannot update them.

PR identity is saved in DynamoDB as soon as opening succeeds, before milestone
or Project association. Optional metadata failures are warnings and never
prevent PR publication. If an invocation is interrupted after GitHub creates
a PR but before the number is saved, the next run searches GitHub for the
existing PR rather than creating a duplicate.

A GitHub merge refusal (including a conflict), transport error, or runtime
failure leaves the event pending for the next watchdog invocation. Later
events do not overtake it. After three failed attempts Publisher sends an
alert, then continues retrying while the execution window remains open.
Repeated alerts for the same reason are deduplicated. It pauses only when the
configured final deadline is missed or when an operator explicitly pauses it.
Errors cannot be bypassed by moving on to a later PR.

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

From `tools/publisher`, select `aggregator-admin` to manage the guidance bundle:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
python notes.py push         # Upload all seven files as one versioned S3 ZIP
python notes.py pull         # Download when the local directory does not exist
python notes.py pull --force # Replace a local directory deliberately
```

The remote object is
`s3://aggregator-publisher-data-905418096305-eu-central-1/operator/codex-publication-preparation.zip`.

The preparation request is a short parameter list. `From` and `To` are
authoritative; an unpublished baseline must not be
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
directory are not uploaded. Uploads use the stored `.remote-etag` for
conditional writes. Run `pull` before modifying a copy on a second machine; use `push --force`
only when explicitly overriding the remote version is intended. S3 object
versioning retains previous revisions. Both `push` and `pull` (including
`--force`) display the target and require entering exactly `yes` before
any AWS request or local changes. Any other response or missing interactive
input cancels the operation. Codex itself must never call AWS.

To edit publication material or the publication schedule, use the Publisher
CLI and the JSON plan. `notes.py` is for private preparation guidance only.

## Retrying a blocked publication

A non-retryable validation failure pauses the queue and records the blocked
event. Investigate and fix the failure before retrying. For a blocked event
scheduled **today**, during the configured execution window, an operator can
explicitly resume the same pending event without rewriting its schedule:

```powershell
$env:AWS_PROFILE = "aggregator-admin"
python publisher.py resume --retry-blocked
```

This requires the queue to be paused, the latest recorded error to match the
next pending event, and no active execution lease. The normal `resume` still
rejects events that are overdue or too close. The watchdog performs the retry
on its next run; check `publisher.py calendar --live` and CloudWatch for the
outcome. If the scheduled day or execution window has passed, prepare a new
reviewed plan instead of bypassing the queue's safety checks.

## Infrastructure and safety

See [`infra/README.md`](infra/README.md) for the independent IAM
administration and workload roots. Infrastructure is deployed separately
from publication plans; updating a plan does not require OpenTofu or rebuilding
Lambda. Build the Lambda artifact with `python publisher.py build` only for
runtime code deployment.

The worker enforces the configured activation date before processing the
publication queue.

Use `python -m unittest discover -s tests -v` for offline checks. Code QA
includes this Publisher.
