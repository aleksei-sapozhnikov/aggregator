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

- **aggregator:** `mvn -B test` (requires Maven and JDK 25).
- **aggregator-ui:** `npm test -- --reporter=verbose` (uses the package lock and runs `npm ci` if Vitest is missing).
- **catalog:** `go test -v ./...` (requires Go 1.23 or newer).
- **ai-agent:** `python -m pytest -v tests` (uses existing Python dependencies or bootstraps the QA virtualenv).
- **code-qa:** `python -m unittest discover -s tools/code_qa -p "test_*.py" -v`.

Each suite runs in its own directory; a failing suite does not prevent other modules from running.
Command output is shown in full, not truncated to the formatting check failure summary.
A missing tool, missing module or failed dependency installation fails the test command.

Run a single module without Make: `python tools/code_qa/main.py test --module catalog`.
Pass `--module` more than once for a subset. All supported modules run by default.
To save the test transcript: `python tools/code_qa/main.py test --out-file test-results.txt`.

The `qa` and `code-qa` flows stop if formatting fails. `qa` scans secrets only after successful tests.
The CI workflow runs lint, tests, and secrets as separate steps, so a failed test does not suppress the security scan.
