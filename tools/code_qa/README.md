# Code QA

Shared format, lint, test, and secret-scanning entrypoint for this
multi-language repository. It discovers repository modules from
`module_checks/`, applies common checks, then runs the checks specific
to each module. CI uses the same module registry.

## Public QA commands

From the repository root:

```sh
make qa-check
make qa-format shared argocd code-qa publisher
make qa-check MODULE=demo QA_SCAN_SECRETS=false
```

- `qa-check` runs checks and tests without modifying tracked files.
- `qa-format` applies supported formatting fixes, then checks and tests.
- Module names after the target are positional selectors; `MODULE=...` is
  supported for CI. Without a selector, all modules are checked.
- A repository-wide secrets scan is included unless
  `QA_SCAN_SECRETS=false` is explicitly set. CI scans secrets once in
  the separate `qa-check MODULE=repository` job.

`code-qa` is **a module name**, not a separate QA command. The Python
orchestrator and small internal Git hook adapters remain implementation
details. CI also uses `python tools/code_qa/src/main.py modules --json`
to generate its module matrix.

Publisher's `resources` OpenTofu root requires the Lambda archive for
`filebase64sha256` during `tofu validate`. The QA configuration builds this
ignored local artifact using `python tools/publisher/publisher.py build`
before validation; it does not deploy or access AWS.


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
