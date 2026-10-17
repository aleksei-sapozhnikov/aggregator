# Code QA

The QA runners are invoked from the repository root through the Makefile.

| Command                         | Behavior                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `make code-format`              | Check formatting and apply supported fixes, then recheck.                              |
| `make code-lint`                | Check code quality without changing files or scanning secrets.                         |
| `make test`                     | Run all unit tests, reporting output and status for each module.                       |
| `make test TEST_MODULE=catalog` | Run one module (also accepts `aggregator`, `aggregator-ui`, `ai-agent`, or `code-qa`). |
| `make code-qa`                  | Run formatting, then module tests, with no secrets scan.                               |
| `make code-secrets`             | Run only the TruffleHog secrets scanner.                                               |
| `make qa`                       | Run formatting, tests, and TruffleHog.                                                 |

## Test modules

- **aggregator:** `mvn -B test` (uses an installed JDK 25 or downloads Eclipse Temurin 25 to `.temp/qa-runtime/jdk`; uses Maven on PATH or downloads and verifies Maven 3.9.11 in `.temp/qa-runtime/maven`).
- **aggregator-ui:** `npm test -- --reporter=verbose --no-color` (uses the package lock and runs `npm ci` if Vitest is missing). The runner disables ANSI colors and renders test status symbols as ASCII text (PASS/FAIL).
- **catalog:** `go test -v ./...` (requires Go 1.23 or newer).
- **ai-agent:** `python -m pytest -v tests` (uses existing Python dependencies or bootstraps the QA virtualenv).
- **code-qa:** `python -m unittest discover -s tools/code_qa -p "test_*.py" -v`.

Each suite runs in its own directory; a failing suite does not prevent other modules from running.
Command output is shown in full, not truncated to the formatting check failure summary.
A missing tool, missing module or failed dependency installation fails the test command. Maven is bootstrapped when absent from PATH; an unavailable network or invalid download checksum is reported as a setup failure.

Run a single module without Make: `python tools/code_qa/main.py test --module catalog`.
Pass `--module` more than once for a subset. All supported modules run by default.
To save the test transcript: `python tools/code_qa/main.py test --out-file test-results.txt`.

Ruff lint and Ruff formatting are reported as separate checks. The format
command applies fixes only for the Ruff stage that failed.

The `code-qa` flow stops if formatting fails. Full `qa` always scans secrets, even when formatting or tests fail.
The CI workflow runs `make qa` as its single QA entrypoint and separately verifies that formatting did not change any tracked files. The Makefile does not require `.env` or Docker/Podman for QA targets. The Java formatter also uses the cached JDK 25 when needed; `JAVA_HOME` and `PATH` are scoped to each subprocess and do not modify the system installation.
