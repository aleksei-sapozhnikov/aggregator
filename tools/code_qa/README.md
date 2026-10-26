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

## Commands

| Command   | Purpose                                                      |
| --------- | ------------------------------------------------------------ |
| `lint`    | Check configured modules without modifying files.            |
| `format`  | Format failures, then recheck that module before continuing. |
| `test`    | Run configured module test commands.                         |
| `code-qa` | Check modules, then run their tests.                         |
| `secrets` | Scan the repository with TruffleHog.                         |
| `qa`      | Run checks, tests, and secret scanning.                      |
| `modules` | List modules; `--json` prints the CI matrix.                 |

Use `--module NAME` to select one or more modules. For example:

```shell
python tools/code_qa/src/main.py lint --module infra-demo
python tools/code_qa/src/main.py test --module catalog
```

With `CODE_QA_FILE_LIST` set, file-based formatters only modify listed files.
OpenTofu deliberately differs: a changed infrastructure source triggers
`tofu fmt -recursive` across its entire infrastructure root, including local
modules. Review these changes before committing.

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
