"""Check configured executor CLIs without launching checks or product tests."""

import importlib
import sys
import unittest
from unittest.mock import patch, sentinel

from code_qa.src.core import cli, modules, utils


class ExecutorContractTests(unittest.TestCase):
    def test_every_configured_suite_accepts_orchestrator_arguments(self) -> None:
        root = utils.repo_root()
        for module in modules.MODULES:
            if module.tests is None:
                continue
            executor = importlib.import_module(cli.TEST_EXECUTORS[module.tests.kind])
            for verbose in (False, True):
                with self.subTest(module=module.name, verbose=verbose):
                    command = cli.test_command(module, root, verbose=verbose)
                    with (
                        patch.object(sys, "argv", command[3:]),
                        patch.object(
                            executor, "build_command", return_value=sentinel.prepared
                        ) as build,
                        patch.object(executor, "execute", return_value=0) as execute,
                    ):
                        self.assertEqual(executor.main(), 0)
                    self.assertEqual(build.call_args.args[0], root / module.path)
                    execute.assert_called_once_with(sentinel.prepared)

    def test_profiles_reference_existing_checks_and_test_executors(self) -> None:
        check_ids = {check.check_id for check in cli.CHECK_TEMPLATES}
        for module in modules.MODULES:
            with self.subTest(module=module.name):
                self.assertTrue(set(module.checks + module.global_checks) <= check_ids)
                if module.tests is not None:
                    self.assertIn(module.tests.kind, cli.TEST_EXECUTORS)
