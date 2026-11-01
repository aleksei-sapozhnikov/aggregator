# Code QA

Run commands from the repository root with
`python tools/code_qa/src/main.py <command>`.

## Layout

```text
module_checks/
  common/
    repository.py    Repository-wide checks (not a second-level module)
    secrets.py       Repository-wide TruffleHog scan
  infra/             administration.py, demo.py, state.py
  services/          aggregator.py, aggregator_ui.py, catalog.py, ...
  deploy/            argocd.py, compose.py, demo.py, infra.py, kubernetes.py
  tools/             code_qa.py, dependency_audit.py, git_hooks.py, ...
  registry.py        Module discovery and CI matrix
  specs.py           Module, nested check, and test contracts
  runner.py          Single-module execution entrypoint
src/
  main.py            Existing CLI entrypoint
  core/              Shared orchestration, path scoping, and QA execution
  checks/
    format/          Formatters, linters, and infrastructure checks
    other/           Default file hygiene and repository-wide checks
    tests/           Test command executors
  tools/             Local tool installation and resolution
tests/
  core/              Core orchestration, contracts, and package tests
  checks/            Mirror src/checks
  tools/             Tooling and local dependency tests
```

Each second-level repository directory is one QA module. Module definitions
in `module_checks` configure its code-specific checks and tests. Default
checks (JSON, YAML, line endings, Prettier, trailing whitespace, and final
newline) apply to every module before or after specialized checks.
Components nested inside a module are configured as scoped checks and suites,
never as separate CI modules. In particular, `infra-demo` owns Ansible and
`deploy-infra` owns publication OpenTofu and publication-tools.

The default `python tools/code_qa/src/main.py qa` command and Make aliases remain
the supported entrypoints. A single module can also be orchestrated directly:

```sh
python -m code_qa.module_checks.infra.demo
```

This direct Python-module form requires `tools/` on `PYTHONPATH`.
The normal CLI does not require setting `PYTHONPATH` manually.

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
repository-root `.tflint.hcl` for the OpenTofu roots; changes to
that file trigger lint in every infrastructure module even in scoped hooks.
The `infra-demo` module includes pinned Ansible syntax and `ansible-lint`
checks, as well as its configuration contract tests. Ansible dependencies
use an isolated local environment, not the general QA Python toolchain.
Ansible lint is skipped on native Windows (not marked passed); Linux and WSL enforce it.

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
