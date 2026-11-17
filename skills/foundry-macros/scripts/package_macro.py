"""Serialize a standalone Foundry Script macro without changing its command text."""

import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="UTF-8 JavaScript macro")
    parser.add_argument("--name", required=True, help="Name displayed in Foundry")
    parser.add_argument("--output", type=Path, help="Defaults to source with a .json extension")
    parser.add_argument("--img", default="icons/svg/dice-target.svg", help="Foundry-relative icon path")
    args = parser.parse_args()
    source = args.source.resolve()
    output = (args.output or source.with_suffix(".json")).resolve()
    if source == output:
        parser.error("Output must differ from the JavaScript source.")
    with source.open(encoding="utf-8-sig", newline="") as handle:
        command = handle.read()
    if not command.strip() or not args.name.strip():
        parser.error("Macro command and name must not be empty.")
    data = {"name": args.name, "type": "script", "img": args.img,
            "scope": "global", "command": command, "folder": None, "flags": {}}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if json.loads(output.read_text(encoding="utf-8"))["command"] != command:
        raise RuntimeError("Packaged command differs from source")
    print(output)


if __name__ == "__main__":
    main()
