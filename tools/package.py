"""Build the Chrome Web Store runtime archive."""

import json
import sys
import zipfile
from pathlib import Path


def runtime_files(root):
    files = [root / "manifest.json"]
    files.extend(path for path in root.iterdir() if path.is_file()
                 and path.suffix in {".js", ".css", ".html"})
    icons = root / "icons"
    if icons.is_dir():
        files.extend(path for path in icons.rglob("*") if path.is_file())
    return sorted(set(files), key=lambda path: path.relative_to(root).as_posix())


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent.parent).resolve()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    output_dir = root / "dist"
    output_dir.mkdir(exist_ok=True)
    archive = output_dir / f"AddOrHide-{version}.zip"
    files = runtime_files(root)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in files:
            bundle.write(path, path.relative_to(root).as_posix())
    print(f"Created {archive}")
    for path in files:
        print(path.relative_to(root).as_posix())
    print(f"Size: {archive.stat().st_size} bytes ({len(files)} files)")


if __name__ == "__main__":
    main()
