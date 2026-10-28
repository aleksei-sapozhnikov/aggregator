# Private Argo CD dashboard access

Use Python 3.10+, AWS CLI, and the Session Manager plugin on Windows,
Linux or macOS. From the repository root:

```sh
python run-tools.py argocd instructions --profile aggregator-admin
python run-tools.py argocd connect --profile aggregator-admin
```

The tool verifies AWS account `905418096305` and finds exactly one
running EC2 instance with the expected `Name`, `Project`, and
`Environment` tags. It never uses a cached instance ID, so recreation
does not require changing local configuration. The command opens an
SSM tunnel to the loopback-only port `18080` on EC2. Browse to
`https://localhost:8080` and accept the development self-signed
certificate. To change the local port use `--local-port 8081`.

The administrator password is defined in **GitHub Environment
`demo-infra-apply`**, under Secrets → `ARGOCD_ADMIN_PASSWORD`. The
approved infrastructure workflow reconciles it after Ansible, sending
only a bcrypt hash through AWS SSM. Updating the GitHub Secret itself
does not start a workflow: an explicit approved infrastructure run is
required to apply the new password. `run-tools.py` does not read,
display, create, or change passwords.
