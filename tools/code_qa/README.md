# Code QA

Shared format, lint, test, and secret-scanning entrypoint for this
multi-language repository. It discovers repository modules from
`module_checks/`, applies common checks, then runs the checks specific
to each module. CI uses the same module registry.

## Run from the repository root

```sh
python tools/code_qa/src/main.py modules
python tools/code_qa/src/main.py qa-check --module aggregator-ui
python tools/code_qa/src/main.py test --module catalog
python tools/code_qa/src/main.py lint --module demo
python tools/code_qa/src/main.py qa
```

Available commands:

| Command | Behavior |
| --- | --- |
| `modules` | List modules (`--json` for the CI matrix). |
| `lint` | Check only; does not modify files. |
| `format` | Attempt fixes, then recheck. |
| `test` | Run registered tests. |
| `qa-check` / `qa` | Check and test modules; scan secrets at the end. |
| `qa-format` | Format and test modules; scan secrets at the end. |
| `secrets` | Run the repository TruffleHog scan. |

Repeat `--module NAME` to select modules. Without it, commands target
the full repository. In `qa-check` and `qa-format`, a module's tests
run only if its checks passed, but other modules still run. A secrets
scan is repository-wide unless `QA_SCAN_SECRETS=false` is set.

Equivalent human-facing shortcuts include `make qa-check demo`,
`make qa-format aggregator-ui` and `make code-secrets`. Consult
[development](../../docs/development.md) for hook installation and
environment setup.

## Scope and safety

Module definitions own tool choices and test commands. Nested parts
(for example, Ansible inside `demo` and Lambda inside `publisher`)
are checked as part of their parent module, not as separate CI modules.
Common file-hygiene checks apply across modules. The secret scan checks
the working tree, not Git commit history.

With `CODE_QA_FILE_LIST`, file-oriented checks only operate on that
selection. OpenTofu is an exception: a changed infra source can trigger
`tofu fmt -recursive` for the entire OpenTofu root. Review formatted
files before committing. The repository-root `.tflint.hcl` is shared
across infrastructure roots. Ansible lint runs on Linux or WSL and is
skipped on native Windows.

Tool dependencies and caches are installed under the ignored
`.local/qa-runtime` directory. Pinned OpenTofu, TFLint, Java formatter
and TruffleHog binaries are checksum-verified before installation.
Use module-specific tests for focused changes and avoid running
`format` against unrelated modules.

To test the QA framework itself without invoking its CLI:

```sh
python -m unittest discover -s tools/code_qa/tests -t tools -p 'test_*.py'
```
