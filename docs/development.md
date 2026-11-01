# Development

Use the repository's existing QA tooling instead of adding parallel formatting
or linting workflows.

## Full check

From the repository root:

```shell
python tools/code_qa/src/main.py qa
```

This checks every module, runs tests, and scans secrets without changing files. It finishes
with `=== QA: PASSED ===` or `=== QA: FAILED ===`.

## Manual formatting and checks

Install Python, Git, and Node.js with npm. The QA runner automatically creates
`.local/qa-runtime/venv` for its pinned Python requirements and installs Prettier
into `.local/qa-runtime/node_modules`. No activation or global package install
is needed. The first run needs internet access; subsequent runs reuse local tools.

TypeScript checks run through each npm package's `typecheck` script. When local
package dependencies are missing, `code_qa` installs them with `npm ci` from the
package lockfile.

Select a module for code checks or its registered tests:

```shell
python tools/code_qa/src/main.py code-qa --module catalog
python tools/code_qa/src/main.py lint --module deploy-infra
python tools/code_qa/src/main.py format --module deploy-infra
python tools/code_qa/src/main.py test --module lambda-publisher
python tools/code_qa/src/main.py modules
```

Repeat `--module` to select several modules; omit it to check all modules.
`code-qa` runs checks and then tests for each module before starting the next.
`qa` follows the same per-module order, then scans repository secrets.

`format` runs checks, formats failed check groups such as Prettier, final
newline, or Java formatting, then re-checks.

`lint` runs code checks without changes or secrets scanning.

Infrastructure checks bootstrap OpenTofu 1.13.1 and TFLint 0.65.0 inside
`.local/qa-runtime`, with local provider and plugin caches. Each infra root
has an independent strict TFLint configuration. Catalog tests require Go 1.23+.
See the [QA guide](../tools/code_qa/README.md) for module configuration,
commands, and the scoped-formatting policy. The CI module matrix is derived from
the same configuration.

## Dependency checks

Check npm dependency advisories and available updates:

```shell
make deps-audit
python tools/dependency_audit/src/check_npm.py
```

The command fails on npm audit findings at `moderate` severity or above. Outdated
packages are printed as update suggestions only.

## Git hooks

Git hooks are managed through `prek`; the QA implementation itself lives under
`tools/code_qa`.

Install local hook tooling:

```shell
python tools/git_hooks/src/setup_prek.py
python tools/git_hooks/src/setup_git_hooks.py --mode lint-only
```

Available pre-commit modes:

- `lint-only`: check-only, no file edits.
- `format-and-lint`: format, then lint; the commit fails if files were changed
  by the hook.

Selected mode is stored in local git config key `hooks.qaMode`. Both pre-commit
and pre-push hooks are installed from `prek.toml`.

If `python` is unavailable in PATH on Windows, use `py -3` instead.
