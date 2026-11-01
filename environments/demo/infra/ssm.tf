# Restricted demo deployment document; no SSH or arbitrary command payloads.

resource "aws_ssm_document" "aggregator_demo_deploy" {
  name            = "AggregatorDemoDeploy"
  document_type   = "Command"
  document_format = "JSON"
  target_type     = "/AWS::EC2::Instance"

  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Deploy a published Aggregator demo commit on EC2"
    parameters = {
      CommitSha = {
        type              = "String"
        interpolationType = "ENV_VAR"
        allowedPattern    = "^[0-9a-f]{40}$"
        description       = "Full published Git commit SHA"
      }
    }
    mainSteps = [
      {
        action = "aws:runShellScript"
        name   = "deploy"
        precondition = {
          StringEquals = ["platformType", "Linux"]
        }
        inputs = {
          timeoutSeconds = "1200"
          runCommand = [
            <<-SCRIPT
              #!/bin/bash
              set -euo pipefail
              test -n "$SSM_CommitSha"
              [[ "$SSM_CommitSha" =~ ^[0-9a-f]{40}$ ]] || exit 2

              # Execute as ec2-user, not the privileged SSM Agent.
              runuser -u ec2-user -- env DEPLOY_SHA="$SSM_CommitSha" bash -c '
                set -euo pipefail
                cd /home/ec2-user/aggregator-demo/repo
                git fetch --prune origin deploy/demo
                git cat-file -e "$DEPLOY_SHA"
                git merge-base --is-ancestor "$DEPLOY_SHA" origin/deploy/demo
                git checkout -B deploy/demo "$DEPLOY_SHA"
                bash ./deploy/demo/demo-deploy.sh
              '
            SCRIPT
          ]
        }
      }
    ]
  })

  tags = {
    Project     = "aggregator"
    Environment = "demo"
  }
}
