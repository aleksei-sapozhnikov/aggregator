# npm dependency audit

Reports vulnerabilities and dependency update suggestions for npm projects
in the repository. Only directories containing both `package.json` and
`package-lock.json` are checked.

From the repository root, with Node.js and npm installed:

```sh
python tools/dependency_audit/src/check_npm.py
python tools/dependency_audit/src/check_npm.py --audit-level high
```

The script runs `npm audit` and `npm outdated` in each project. By default,
moderate or higher severity findings make it exit nonzero; `--audit-level`
changes the threshold (`info`, `low`, `moderate`, `high`, or
`critical`). Update suggestions are informational and do not modify
dependencies or lockfiles.

The repository's `make deps-audit` target invokes the same check.
Review package updates in the affected npm module and run its tests before
committing; avoid automatically applying breaking updates.
