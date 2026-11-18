"""Provide a small runtime source tree for packaging and release tests."""


def write_source(root):
    """Create a small Lambda package without depending on runtime sources."""
    files = {
        "__init__.py": '"""Fixture Lambda package."""\n',
        "handler.py": "def lambda_handler(event, context):\n    return event\n",
        "github/github_client.py": '"""Nested GitHub helper fixture."""\n',
        "publication/snapshot_runner.py": '"""Nested runner fixture."""\n',
    }
    for name, content in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
    return root
