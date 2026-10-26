# Delegated AWS policies

Managed policy documents loaded by `policies.tf` in this root.

- `AggregatorDemoEC2Management.json`: manage tagged demo compute and networking.
- `AggregatorDemoIAMManagement.json`: manage demo workload roles and profiles.
- `AggregatorDemoSSMManagement.json`: manage the named demo SSM deployment document.
- `AggregatorDemoSessionAccess.json`: open browser-based Session Manager shells only on the serving demo, and manage the caller's own sessions.
- `AggregatorDemoSGRuleCreation.json`: create tagged security group rules.
- `AggregatorDemoRoleBoundary.json`: limit demo workload role permissions.
- `AggregatorPublicationManagement.json`: manage publication infrastructure.
- `AggregatorPublicationRoleBoundary.json`: limit publication execution roles.
- `AggregatorCallBedrockModel.json`: invoke the allowed Bedrock models.
