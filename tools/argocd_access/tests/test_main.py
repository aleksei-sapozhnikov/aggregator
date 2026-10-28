"""Offline tests for the portable Argo CD connection-only command."""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import unittest
from unittest.mock import patch

from tools.argocd_access import main as access


def options(profile: str | None = None) -> argparse.Namespace:
    """Provide representative cross-platform AWS CLI options."""
    return argparse.Namespace(
        region="eu-central-1", profile=profile, local_port=8080
    )


class ArgoCDToolTests(unittest.TestCase):
    def test_resolves_current_k3s_using_tags(self) -> None:
        with patch.object(
            access,
            "aws_output",
            side_effect=[access.ACCOUNT_ID, json.dumps(["i-0eb7ef332aa95e884"])],
        ) as aws:
            self.assertEqual(
                access.resolve_instance_id(options()), "i-0eb7ef332aa95e884"
            )
        self.assertIn(
            "Name=instance-state-name,Values=running", aws.call_args.args
        )

    def test_missing_and_multiple_k3s_nodes_fail_closed(self) -> None:
        for ids in ([], ["i-0123456789abcdef0", "i-0123456789abcdef1"]):
            with self.subTest(ids=ids):
                with patch.object(
                    access, "aws_output", side_effect=[access.ACCOUNT_ID, json.dumps(ids)]
                ):
                    with self.assertRaisesRegex(RuntimeError, "Expected one"):
                        access.resolve_instance_id(options())

    def test_account_mismatch_prevents_ec2_lookup(self) -> None:
        with patch.object(access, "aws_output", return_value="000000000000") as aws:
            with self.assertRaisesRegex(RuntimeError, "Expected AWS account"):
                access.resolve_instance_id(options())
        self.assertEqual(aws.call_count, 1)

    def test_port_forward_is_cross_platform_command_vector(self) -> None:
        command = access.forwarding_command(
            options("aggregator-admin"), "i-0eb7ef332aa95e884"
        )
        self.assertEqual(command[:4], ["aws", "ssm", "start-session", "--target"])
        self.assertIn("portNumber=18080,localPortNumber=8080", command)
        self.assertEqual(command[-2:], ["--profile", "aggregator-admin"])

    def test_instructions_do_not_start_a_session(self) -> None:
        with (
            patch.object(
                access, "resolve_instance_id", return_value="i-0eb7ef332aa95e884"
            ),
            patch.object(access.subprocess, "call") as run,
            contextlib.redirect_stdout(io.StringIO()) as output,
        ):
            self.assertEqual(access.main(["instructions"]), 0)
        run.assert_not_called()
        self.assertIn("--target i-0eb7ef332aa95e884", output.getvalue())
        self.assertIn("ARGOCD_ADMIN_PASSWORD", output.getvalue())

    def test_connect_uses_subprocess_without_shell(self) -> None:
        with (
            patch.object(
                access, "resolve_instance_id", return_value="i-0eb7ef332aa95e884"
            ),
            patch.object(access.subprocess, "call", return_value=0) as run,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            self.assertEqual(access.main(["connect"]), 0)
        self.assertIsInstance(run.call_args.args[0], list)
        self.assertNotIn("shell", run.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
