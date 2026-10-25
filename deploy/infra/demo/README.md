# Aggregator demo infrastructure

This is an independent OpenTofu root for the demo's AWS compute and networking.
It does not install Kubernetes, deploy applications, or manage publication
utilities. Shared IAM policies and permissions boundaries are owned by
`../admin`; this state owns its workload roles.

The legacy EC2 instance serves the existing demo. The k3s module is for a
separate replacement environment, not an in-place upgrade. Validate a
replacement before switching public traffic, and treat any plan that changes
or destroys the serving instance as a potentially disruptive operation.

Run this root with `aggregator-admin`. Keep its state separate from the
administrative state, and do not commit state, plan files, or credentials.
