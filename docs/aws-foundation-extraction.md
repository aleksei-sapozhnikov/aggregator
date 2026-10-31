# AWS foundation extraction plan

## Goal

Separate account-level AWS identities and singleton configuration from Aggregator-specific infrastructure without replacing live IAM, SSM, or S3 resources.

The target repository is `aws-foundation`. It is created and bootstrapped independently. This plan does **not** authorize Terraform/OpenTofu apply, state modifications, or credential changes by itself.

## Ownership boundary

| Resource | Target owner | Rationale |
| --- | --- | --- |
| `aws_iam_user.infra_admin` (`infra-admin`) | `aws-foundation` | Account administration identity, not an Aggregator component |
| `aws_iam_openid_connect_provider.github_actions` | `aws-foundation` | Account-wide GitHub Actions OIDC provider |
| `aws_ssm_document.session_manager_preferences` | `aws-foundation` | Regional Session Manager preferences affect the account |
| `aws_iam_user.aggregator_admin` | Aggregator | Application-specific delegated administrator |
| `AggregatorBaseAccess`, `AggregatorDemoAdmins`, `AggregatorInfrastructureAdmins`, `AggregatorBedrockDevelopers` | Aggregator initially | Current policies and memberships are coupled to Aggregator |
| `AggregatorInfrastructureManagement` | Aggregator initially | Grants administration over Aggregator resources and its existing state bucket, despite the generic principal using it |
| `AggregatorDemo*` managed policies and GitHub OIDC roles | Aggregator | Repository/environment-specific permissions |
| `aggregator-tofu-state-...` bucket and policy | Aggregator initially | Bucket and policy are Aggregator-specific and contain the existing `admin`, `demo`, and `publication` states |
| Publication IAM and OpenTofu root | Publication runner, in a later extraction | Independently deployable automation destined for another repository |

Do **not** rename IAM users, groups, policies, roles, S3 buckets, or state keys during the ownership transfer. Their existing names and ARNs should remain stable.

## Dependency changes required in Aggregator

- `deploy/infra/admin/main.tf`: replace the managed `infra-admin` IAM user with a data reference after transferring ownership; keep `aggregator-admin` managed here.
- `deploy/infra/admin/github_demo_deploy.tf` and `github_demo_infra.tf`: replace managed OIDC provider references with a data lookup or a stable provider ARN; leave Aggregator-specific GitHub roles here.
- `deploy/infra/admin/session_manager.tf`: remove the managed account-wide SSM document only after transferring its state ownership.
- `deploy/infra/admin/policies.tf`: retain the Aggregator-scoped administrator policy; review the account-wide SSM preferences permission after extraction.
- `deploy/infra/admin/state.tf`: retain the existing Aggregator state bucket and its access restrictions; the new foundation state should have an independently bootstrapped backend.
- `deploy/infra/admin/main.tf`: the existing `aws_iam_user_group_membership.infra_admin` is authoritative for **all** user groups. Before assigning `infra-admin` to another project's groups, replace it with project-scoped group membership management to prevent accidental removal of unrelated memberships.

## Ordered migration

1. Create the `aws-foundation` repository. Define a separate, secured OpenTofu backend and provider with explicit AWS account restriction. Bootstrapping that backend may require separately authorized credentials.
2. Freeze applies to the Aggregator `admin` root and the prospective foundation root. Verify the AWS account, inspect the current plans, and securely back up the existing state **outside Git**. Do not commit state, credentials, or plans.
3. Define foundation resources matching **existing** objects (same names, configuration and tags initially). Do not apply those resources as new creations.
4. For each existing resource, transfer ownership from Aggregator state to foundation state using a reviewed remove/import or state migration procedure. Avoid two concurrent authoritative states and never apply a plan containing deletes/replacements of the moved live objects.
5. In the same coordinated maintenance window, replace Aggregator resource references with data lookups or stable ARNs. Validate that Aggregator admin plan does not recreate transferred objects and the foundation plan does not replace them.
6. Test: GitHub demo OIDC trust and plan/apply roles; `infra-admin` permissions to administer Aggregator; `aggregator-admin` access; Session Manager behavior; and access restrictions for `admin/tofu.tfstate`.
7. Only after stable ownership transfer, independently redesign generic administration permissions and project-group memberships. Move publication permissions and runner later.

## Safety conditions

- No application code, container deployment, or K3s changes in this extraction.
- No OpenTofu `apply`, `destroy`, state removal, import, or IAM modifications without a reviewed, explicit migration operation.
- Preserve the existing state bucket, backend key paths, IAM identity names, role trust conditions, and resource ARNs.
- Do not broaden `infra-admin` to unrestricted AWS permissions merely because the identity moves to `aws-foundation`.
- The current source root has self-referential IAM administration dependencies. Handle the initial bootstrap using an independently authorized administrator; do not assume an empty foundation root can provision its own permissions.
