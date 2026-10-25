# AWS access administration

This OpenTofu root owns Aggregator's shared IAM identities, delegated permissions,
and permissions boundaries. Workload roles and runtime infrastructure belong to
the stacks that create them; a resource must have exactly one state owner.

Changes here can grant privileges or prevent other stacks from being managed.
Apply them using a separate privileged administrative identity, not the
`aggregator-admin` user whose permissions this configuration controls.
Review the impact on existing workloads before changing shared policies or
boundaries.

Treat this state as privileged: restrict access, keep recoverable backups, and
never commit state, plan files, or credentials.
