# Code QA

Run commands from the repository root with
`python tools/code_qa/src/main.py <command>`.

## Layout

```text
src/
  main.py          CLI entrypoint
  core/            module configuration and QA orchestration
  checks/
    format/        formatters, linters, and infrastructure checks
    other/         repository hygiene, file validation, and secret scanning
    tests/         executors for a module's configured test command
  tools/           local tool installation and resolution
tests/             tests for code_qa itself
requirements.txt   pinned Python dependencies for local QA tools
```

`src/checks/tests` contains command executors, not tests for this tool. An
executor receives its working directory and parameters from the module
configuration and runs one test command. `tests/` verifies code_qa behavior.

Configure module paths, check profiles, and test commands in
[`src/core/modules.py`](src/core/modules.py). A module's test configuration
selects an executor and passes it module-relative arguments.

## Make shortcuts

From the repository root:

```shell
make qa-format                  # Format and test each module, then scan secrets
make qa-format MODULE=catalog   # Format and test one module
make qa-check                   # Check, test and scan without changing files
make qa-check MODULE=catalog    # Check and test one module
```

`qa-format` uses a single orchestration pass: for each module, run its
checks, apply available formatting fixes, recheck that module only if needed,
and then run its tests. Tests are skipped when the module still fails checks;
other modules continue. Once all modules pass, secrets are scanned once.
`qa-check` has the same module-by-module test ordering without any fixes.
`qa` remains an alias for `qa-check`. In CI, module jobs use
`make qa-check MODULE=<name> QA_SCAN_SECRETS=false` to avoid repeated
secret scans; the dedicated secrets job uses `make code-secrets`.

## Commands

| Command     | Purpose                                                      |
| ----------- | ------------------------------------------------------------ |
| `lint`      | Check configured modules without modifying files.            |
| `format`    | Format failures, then recheck that module before continuing. |
| `test`      | Run configured module test commands.                         |
| `code-qa`   | Check and test each module before proceeding to the next.    |
| `secrets`   | Scan the repository with TruffleHog.                         |
| `qa`        | Check and test each module, then scan repository secrets.    |
| `qa-format` | Fix and test each module, then scan repository secrets.      |
| `modules`   | List modules; `--json` prints the CI matrix.                 |

Use `--module NAME` to select one or more modules. For example:

```shell
python tools/code_qa/src/main.py lint --module infra-demo
python tools/code_qa/src/main.py test --module catalog
```

Within each module, specialized formatters and validators run before the
final `trailing whitespace` and `final newline` checks. The large-file check
remains a repository-wide check.

In `code-qa`, `qa`, and `qa-format`, each module's registered tests run
directly after its checks pass. Failing checks skip only that module's tests;
other modules are still checked and tested. Standalone `test` retains its separate behavior.

The `secrets` command scans the current repository filesystem recursively,
excluding `.git` and Git-ignored paths, not historical Git commits.
With `CODE_QA_FILE_LIST` set, it scans only the listed files.

With `CODE_QA_FILE_LIST` set, file-based formatters only modify listed files.
OpenTofu deliberately differs: a changed infrastructure source triggers
`tofu fmt -recursive` across its entire infrastructure root, including local
modules. Review these changes before committing. TFLint uses the single
repository-root `.tflint.hcl` for all four infrastructure roots; changes to
that file trigger lint in every infrastructure module even in scoped hooks.
The `infra-demo-ansible` module runs pinned Ansible syntax and `ansible-lint`
checks, as well as its configuration contract tests. Ansible dependencies
use an isolated local environment, not the general QA Python toolchain.

Python and npm dependencies, tool binaries, and caches are stored under the
ignored `.local/qa-runtime` directory. No global Python or npm packages are
required.

Pinned OpenTofu, TFLint, Java formatter, and TruffleHog downloads verify SHA-256
checksums before installation. Tool bootstrapping does not modify application
dependencies.

Run code_qa's own tests from the repository root with:

```shell
python -m unittest discover -s tools/code_qa/tests -t tools -p 'test_*.py'
```
