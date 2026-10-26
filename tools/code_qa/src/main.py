"""Run repository QA commands from the source package."""

import sys
from pathlib import Path

tools_dir = Path(__file__).resolve().parents[2]
if str(tools_dir) not in sys.path:
    sys.path.insert(0, str(tools_dir))

from code_qa.src.core.cli import main as run


def main() -> int:
    """Dispatch the QA command."""
    return run()


if __name__ == "__main__":
    raise SystemExit(main())
