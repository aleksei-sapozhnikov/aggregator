# Private Argo CD access

Use Python 3.10+ and the repository root on Windows, Linux, or macOS.
AWS CLI with Session Manager plugin is needed for the SSM tunnel.

```sh
python run-tools.py argocd instructions --profile aggregator-admin
python run-tools.py argocd connect --profile aggregator-admin
python run-tools.py argocd password
python run-tools.py argocd password set --profile aggregator-admin
```

`instructions` finds exactly one **running** K3s EC2 from live AWS tags and
verifies account `905418096305`; it prints a concrete one-line command that
works in PowerShell, Bash, and cmd.exe. `connect` opens it directly and
keeps the SSM tunnel active until Ctrl+C. Open `https://localhost:8080`
while connected. Use `--local-port 8081` if necessary.

`password` displays the name and AWS Console link for the Argo CD admin
password. `password set` (requires `python -m pip install boto3`) creates
the secret if missing, otherwise adds a new value version. It asks for the
password twice through a hidden prompt, validates 16–72 UTF-8 bytes, and
never places it in shell arguments or a Terraform state. On creation, tags
`Project=aggregator` and `Environment=demo` are applied. To make this
command work with the scoped `aggregator-admin` IAM identity, apply the
policy changes in `deploy/infra/admin` first.

The instance runs an Ansible-provisioned systemd timer to refresh the
Kubernetes `argocd-secret` from Secrets Manager about every five minutes.
You can also edit the secret in the AWS Console. No new deployment is
required for a password change. Never paste the password into Actions logs
or pass it as a CLI argument. Both `password` commands avoid reading the
secret value from AWS; only `password set` sends a new value to AWS.
