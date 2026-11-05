# Development

Use the repository's existing QA tooling instead of adding parallel formatting
or linting workflows.

## Repository QA

The three public QA commands are:

```shell
make qa-check
make qa-format shared argocd code-qa publisher
make qa-secrets
```

`qa-check` runs each selected module's checks and tests without changing
source files. `qa-format` first fixes supported formatting problems, then
reruns checks and tests. Both scan repository secrets by default. `qa-secrets`
runs only the repository-wide TruffleHog scan. All three finish with
`=== QA: PASSED ===` or `=== QA: FAILED ===`.

Select modules positionally, or pass `MODULE=demo` in CI. Run without
module selectors to cover the whole repository. The `code-qa` module is
the QA engine itself, not a command.

Install Python, Git, and Node.js with npm. The QA runner uses
`.local/qa-runtime` for pinned local dependencies. Infrastructure checks
bootstrap OpenTofu and TFLint with local caches; no AWS state or credentials
are needed for offline validation. See the [QA guide](../tools/code_qa/README.md)
for module configuration and scoped formatting.

CI uses the module registry to run `qa-check` in parallel, with a separate
`make qa-secrets` job. Git hooks use an internal adapter for lighter,
changed-file-only code checks; pre-push invokes the `qa-secrets` CLI
with its changed-file scope. These hooks do not invoke whole-module tests.

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
