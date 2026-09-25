# Development

Use the repository's existing QA tooling instead of adding parallel formatting
or linting workflows.

## Full check

From the repository root:

```shell
python tools/code_qa/main.py lint
```

This is the CI-style check-only path and includes the secrets scan. It finishes
with `=== QA: PASSED ===` or `=== QA: FAILED ===`.

## Manual formatting and checks

Manual `code_qa` requires local tools:

```shell
python -m pip install --upgrade ruff pyyaml
npm install --global prettier@3.6.2
```

TypeScript checks run through each npm package's `typecheck` script. When local
package dependencies are missing, `code_qa` installs them with `npm ci` from the
package lockfile.

Available commands:

```shell
make code-qa
python tools/code_qa/main.py
python tools/code_qa/main.py format
python tools/code_qa/main.py format-check-only
python tools/code_qa/main.py lint
```

`make code-qa` and `python tools/code_qa/main.py` run format-and-lint plus the
secrets scan.

`format` runs checks, formats failed check groups such as Prettier, final
newline, or Java formatting, then re-checks.

`format-check-only` runs only code checks without formatting and without the
secrets scan.

`lint` runs check-only code validation plus the secrets scan.

## Git hooks

Git hooks are managed through `prek`; the QA implementation itself lives under
`tools/code_qa`.

Install local hook tooling:

```shell
python tools/git_hooks/setup_prek.py
python tools/git_hooks/setup_git_hooks.py --mode lint-only
```

Available pre-commit modes:

- `lint-only`: check-only, no file edits.
- `format-and-lint`: format, then lint; the commit fails if files were changed
  by the hook.

Selected mode is stored in local git config key `hooks.qaMode`. Both pre-commit
and pre-push hooks are installed from `prek.toml`.

If `python` is unavailable in PATH on Windows, use `py -3` instead.
