"""Check configured executor CLIs without launching checks or product tests."""

import importlib
import sys
import unittest
from pathlib import Path
from unittest.mock import patch, sentinel

from code_qa.src.core import cli, modules, utils


class ExecutorContractTests(unittest.TestCase):
    def test_every_configured_suite_accepts_orchestrator_arguments(self) -> None:
        root = utils.repo_root()
        for module in modules.MODULES:
            if not module.has_tests:
                continue
            for verbose in (False, True):
                for label, command in cli.test_commands(module, root, verbose=verbose):
                    with self.subTest(module=label, verbose=verbose):
                        actual = importlib.import_module(command[3])
                        with (
                            patch.object(sys, "argv", command[3:]),
                            patch.object(
                                actual, "build_command", return_value=sentinel.prepared
                            ) as build,
                            patch.object(actual, "execute", return_value=0) as execute,
                        ):
                            self.assertEqual(actual.main(), 0)
                        self.assertEqual(
                            build.call_args.args[0],
                            Path(command[command.index("--directory") + 1]),
                        )
                        execute.assert_called_once_with(sentinel.prepared)

    def test_profiles_reference_existing_checks_and_test_executors(self) -> None:
        check_ids = {check.check_id for check in cli.CHECK_TEMPLATES}
        for module in modules.MODULES:
            with self.subTest(module=module.name):
                self.assertTrue(set(module.checks + module.global_checks) <= check_ids)
                for group in module.scoped_checks:
                    self.assertTrue(set(group.checks) <= check_ids)
                if module.tests is not None:
                    self.assertIn(module.tests.kind, cli.TEST_EXECUTORS)
                for group in module.scoped_tests:
                    self.assertIn(group.tests.kind, cli.TEST_EXECUTORS)
