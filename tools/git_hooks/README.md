# Git hooks

Optional local Git hooks run scoped code checks before a commit and a
secret scan before a push. They reuse [Code QA](../code_qa/README.md)
rather than maintaining a second set of lint rules.

## Install

From the repository root with Python and Git installed:

```sh
python tools/git_hooks/src/setup_prek.py
python tools/git_hooks/src/setup_git_hooks.py --mode lint-only
```

Choose `--mode format-and-lint` if you want pre-commit to attempt
formatting before checking. The selected mode is saved in local Git config
(`hooks.qaMode`); installing the hooks configures both pre-commit and
pre-push with `prek.toml`.

- `lint-only` checks without editing working files.
- `format-and-lint` can edit matching files; review and stage changes
  before recommitting.
- Pre-push scans the files included in the pushed commits for secrets.

The hooks operate on local Git events; they do not replace CI or repository
tests. When troubleshooting, run the relevant module check directly as
described in [development](../../docs/development.md).
