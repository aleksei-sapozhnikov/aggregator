#!/usr/bin/env python3
"""Compare Lambda ZIP member names and hashes without printing file contents."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path


def members(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    with zipfile.ZipFile(path) as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            name = entry.filename.replace("\\", "/")
            if name in result:
                raise ValueError(f"duplicate ZIP member: {name}")
            result[name] = hashlib.sha256(archive.read(entry)).hexdigest()
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("live_zip", type=Path, help="private ZIP downloaded from AWS Lambda")
    parser.add_argument("candidate_zip", type=Path, help="source-controlled candidate ZIP")
    args = parser.parse_args()

    try:
        live = members(args.live_zip)
        candidate = members(args.candidate_zip)
    except (OSError, zipfile.BadZipFile, ValueError) as error:
        parser.error(str(error))

    only_live = sorted(live.keys() - candidate.keys())
    only_candidate = sorted(candidate.keys() - live.keys())
    changed = sorted(name for name in live.keys() & candidate.keys() if live[name] != candidate[name])
    result = {
        "live_member_count": len(live),
        "candidate_member_count": len(candidate),
        "same_file_contents": not (only_live or only_candidate or changed),
        "only_in_live": only_live,
        "only_in_candidate": only_candidate,
        "changed_members": [
            {"name": name, "live_sha256": live[name], "candidate_sha256": candidate[name]}
            for name in changed
        ],
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["same_file_contents"] else 1


if __name__ == "__main__":
    sys.exit(main())
