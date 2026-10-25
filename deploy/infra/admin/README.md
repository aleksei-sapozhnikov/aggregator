# Aggregator IAM administration (OpenTofu)

**Goal:** Import the existing IAM configuration into an independent admin state without creating, deleting, or changing AWS resources.

This directory is separate from the live demo root (`deploy/infra`). Do **not** run `tofu apply` in this directory until you have captured actual IAM settings and confirmed that the plan contains *imports only*.

## Ownership boundary

- **Admin state:** `aggregator-admin` IAM user, three IAM groups, six customer-managed IAM policies (including both role permission boundaries), all current group policy attachments, user-to-group membership.
- **Demo state:** existing EC2, roles/instance profiles, EIPs, SGs and the `AggregatorCallBedrockModel` policy for now.
- **Publication:** Existing CloudFormation stack continues to own publication runtime and service IAM roles. The admin state owns only the publication *management policy* and the role permission boundary.

The `AggregatorCallBedrockModel` policy must **not** be managed by both states at once. It is deliberately excluded by default. See the later migration below.

## Capture the live IAM configuration (read-only)

Requires Python 3 and boto3. In the repo root on a machine with the AWS CLI profile:

```sh
python -m pip install boto3
python deploy/infra/admin/scripts/capture_iam.py --profile aggregator-admin --output deploy/infra/admin
```

CloudShell alternative (when Python/boto3 are already installed): upload the supplied ZIP, unzip it into a working directory, then run:

```sh
python3 deploy/infra/admin/scripts/capture_iam.py --output deploy/infra/admin
```

The script checks AWS account ID, group memberships and direct user/group inline policy drift, then writes these files:

- `users.tf`, `groups.tf`, `policies.tf`, `attachments.tf`, `memberships.tf`
- `imports.tf`
- `policies/*.json` (actual default policy versions read from AWS)
- `snapshot-summary.json` (reviewable IAM inventory)

The script makes **no AWS changes**. It fails rather than guessing if the actual account differs from the known IAM design. Review the generated source and commit it, excluding state and credentials.

If captured in CloudShell, zip up `deploy/infra/admin`, download it from CloudShell, and put it in your working copy of the repository.

## Initial import

From the admin directory (not the demo root):

```sh
cd deploy/infra/admin
tofu init
tofu fmt -recursive
tofu validate
tofu plan -out=admin-import.tfplan
```

Required invariant: **all planned actions must be imports**. Stop on *any* AWS create, update, replace, or destroy, including tags or policy JSON changes. In particular, `prevent_destroy` guards against accidental destruction but does **not** prevent an in-place policy edit.

If the plan contains imports only:

```sh
tofu apply admin-import.tfplan
tofu plan
```

The next plan should report `No changes`. Remove `admin-import.tfplan` after the operation. The independent local admin state is stored under `.temp/admin/admin-infra.tfstate` relative to the repository root. Back it up; it will move to a versioned, restricted S3 backend later.

If the `aggregator-admin` profile has enough IAM **read** permissions, importing may work under that identity. A privileged admin identity will be needed to make actual admin policy changes later. Do not grant the ordinary demo runtime identity permission to edit its own boundaries or the admin state.

## Bedrock managed policy migration (later, separately)

Only do this after the first admin import is clean and you have backups of both states:

1. In `deploy/infra/main.tf`, remove `module "permissions"` and replace `module.permissions.bedrock_policy_arn` with the literal ARN `arn:aws:iam::905418096305:policy/AggregatorCallBedrockModel` wherever referenced. Do not apply a plan that proposes deleting the Bedrock policy.
2. In the **demo** root, back up the state and then forget the policy without deleting it:

   ```sh
   tofu state pull > demo-state-backup.json
   tofu state rm module.permissions.aws_iam_policy.bedrock
   tofu plan
   ```

   The demo plan should not include any changes to the IAM policy or its attachments. The policy still exists in AWS.
3. Re-run the capture tool for the **admin** root with `--include-bedrock`:

   ```sh
   python deploy/infra/admin/scripts/capture_iam.py --profile aggregator-admin --output deploy/infra/admin --include-bedrock
   ```

4. Review the admin plan; it should **only import** the Bedrock policy (`aws_iam_policy.bedrock_model`). Apply the import, then confirm `No changes` in both states.

The period between forgetting the policy and importing it should be short; no simultaneous owner is ever allowed. Do not execute `tofu destroy` during migration.

## Next infrastructure state work

Bootstrap an encrypted S3 bucket with versioning, block public access and limited access to separate state keys; migrate the admin and demo local states via `tofu init -migrate-state` only after the corresponding bucket/access grants exist. Add a narrowly trusted bootstrap IAM role to the **admin** configuration so ordinary operation no longer requires root.
